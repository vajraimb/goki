import { mulberry32, shuffleInPlace } from "./rng";
import {
  BANK_CLOSER_SEED,
  CLOSER_SEED,
  generateBankCloserIssuers,
  generateCloserIssuers,
  N_CLOSER,
} from "./closer-synth";
import { N_NOTE_FEATURES, NOTE_FEATURE_NAMES } from "./note-rules";
import { BANK_FEATURE_NAMES, packNoteFeatures, packOf } from "./packs";
import { buildHkIssuers } from "./hk-bluechips";
import {
  aeErr,
  aeSgdStep,
  checksum,
  makeAe,
  makeMlp,
  mlpMeanBce,
  mlpParamCount,
  mlpProb,
  mlpSaliency,
  mlpSgdStep,
  type MLP,
  type AE,
} from "./nn";
import { mergeNotes } from "./note-rules";
import type { CloserEngagement, CloserScore, Issuer, NoteBooks } from "./types";

const EPOCHS = 12;
const BATCH = 32;
const HID1 = 32;
const HID2 = 16;

function rocAuc(scores: number[], labels: number[]): number {
  const pairs = scores.map((s, i) => ({ s, y: labels[i]! }));
  pairs.sort((a, b) => a.s - b.s);
  let pos = 0;
  let neg = 0;
  let rankSum = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i]!.y === 1) {
      pos += 1;
      rankSum += i + 1;
    } else neg += 1;
  }
  if (pos === 0 || neg === 0) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

function bandOf(p: number, maxRel: number): CloserScore["band"] {
  if (p >= 0.5 || maxRel >= 0.05) return "exception";
  if (p >= 0.2 || maxRel >= 0.01) return "review";
  return "pass";
}

function compileRoutine(
  paramCount: number,
  checksumHex: string,
  auc: number,
  kind: "generic" | "bank",
): string {
  const tag = kind === "bank" ? "goki_bank_closer_forward" : "goki_closer_forward";
  const seed = kind === "bank" ? BANK_CLOSER_SEED : CLOSER_SEED;
  return `/* ${tag} — OCANNL cc backend replica
 * ${kind} note-rollforward closer   seed=${seed}   params=${paramCount}   dtype=f32
 * checksum=${checksumHex}   test_auc=${auc.toFixed(4)}
 */
void ${tag}(const float *x /* [16] */, float *y /* [1] */) {
  float h1[32], h2[16];
  for (int i = 0; i < 32; ++i) {
    float acc = b1[i];
    for (int j = 0; j < 16; ++j) acc = fmaf(W1[i*16+j], x[j], acc);
    h1[i] = acc > 0.f ? acc : 0.f;
  }
  for (int i = 0; i < 16; ++i) {
    float acc = b2[i];
    for (int j = 0; j < 32; ++j) acc = fmaf(W2[i*32+j], h1[j], acc);
    h2[i] = acc > 0.f ? acc : 0.f;
  }
  float z = b3[0];
  for (int j = 0; j < 16; ++j) z = fmaf(W3[j], h2[j], z);
  y[0] = 1.f / (1.f + expf(-z));
}
`;
}

export interface CloserModel {
  mlp: MLP;
  ae: AE;
  mean: Float64Array;
  std: Float64Array;
}

function maxPackRel(rules: CloserScore["rules"]): number {
  let m = 0;
  for (const r of rules) {
    if (r.skipped) continue;
    if (r.kind === "analytic") continue;
    m = Math.max(m, Math.abs(r.rel));
  }
  return m;
}

function trainCloser(
  seed: number,
  issuers: Issuer[],
  kind: "generic" | "bank",
): { engagement: CloserEngagement; model: CloserModel } {
  const t0 = performance.now();
  const names = kind === "bank" ? BANK_FEATURE_NAMES : NOTE_FEATURE_NAMES;
  const packed = issuers.map((iss) => {
    const { features, rules, notes } = packNoteFeatures(iss);
    return { issuer: iss, features, rules, notes, y: iss.inject === "true_error" ? 1 : 0 };
  });

  const idx = packed.map((_, i) => i);
  const splitRng = mulberry32(42);
  shuffleInPlace(splitRng, idx);
  const nTrain = Math.floor(idx.length * 0.8);
  const nVal = Math.floor(idx.length * 0.1);
  const trainIdx = idx.slice(0, nTrain);
  const valIdx = idx.slice(nTrain, nTrain + nVal);
  const testIdx = idx.slice(nTrain + nVal);

  const d = N_NOTE_FEATURES;
  const mean = new Float64Array(d);
  const std = new Float64Array(d);
  const nTr = trainIdx.length;
  for (let j = 0; j < d; j++) {
    let a = 0;
    for (const i of trainIdx) a += packed[i]!.features[j]!;
    mean[j] = a / nTr;
  }
  for (let j = 0; j < d; j++) {
    let a = 0;
    for (const i of trainIdx) {
      const v = packed[i]!.features[j]! - mean[j]!;
      a += v * v;
    }
    std[j] = Math.sqrt(a / Math.max(nTr, 1)) + 1e-6;
  }

  const xs = packed.map((p) => {
    const o = new Float32Array(d);
    for (let j = 0; j < d; j++) o[j] = (p.features[j]! - mean[j]!) / std[j]!;
    return o;
  });
  const ys = packed.map((p) => p.y);

  const rng = mulberry32(seed);
  const mlp = makeMlp(rng, d, HID1, HID2);
  const ae = makeAe(rng, d, 12, 6);

  const logs: CloserEngagement["logs"] = [];
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  const steps = EPOCHS * nBatches;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    let bce = 0;
    let aeL = 0;
    let nb = 0;
    for (let b = 0; b < nBatches; b++) {
      const batch = order.slice(b * BATCH, (b + 1) * BATCH);
      const stepN = epoch * nBatches + b;
      const lr = 0.12 * ((1.5 * steps - stepN) / steps);
      bce += mlpSgdStep(mlp, xs, ys, batch, Math.max(lr, 0.01), 1e-4);
      const aeBatch = batch.filter((i) => ys[i] === 0);
      if (aeBatch.length >= 8) aeL += aeSgdStep(ae, xs, aeBatch, Math.max(lr, 0.02));
      nb += 1;
    }
    logs.push({
      epoch,
      trainBce: bce / nb,
      valBce: mlpMeanBce(mlp, xs, ys, valIdx),
      aeMse: aeL / Math.max(nb, 1),
      regMse: 0,
    });
  }

  const scored: CloserScore[] = packed.map((p, i) => {
    const x = xs[i]!;
    const pOpen = mlpProb(mlp, x);
    const aeE = aeErr(ae, x);
    const sal = mlpSaliency(mlp, x);
    const attribution = sal
      .map((value, j) => ({ name: names[j]!, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 6);
    const maxRel = maxPackRel(p.rules);
    return {
      issuer: p.issuer,
      notes: p.notes,
      rules: p.rules,
      features: p.features,
      pOpen,
      aeErr: aeE,
      attribution,
      band: bandOf(pOpen, maxRel),
      maxRel,
    };
  });
  scored.sort((a, b) => b.pOpen - a.pOpen);

  const testP = testIdx.map((i) => mlpProb(mlp, xs[i]!));
  const testY = testIdx.map((i) => ys[i]!);
  const auc = rocAuc(testP, testY);
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (let k = 0; k < testP.length; k++) {
    const pred = testP[k]! >= 0.5 ? 1 : 0;
    const y = testY[k]!;
    if (pred === 1 && y === 1) tp++;
    else if (pred === 1 && y === 0) fp++;
    else if (pred === 0 && y === 0) tn++;
    else fn++;
  }
  const cs = checksum([mlp.w1, mlp.b1, mlp.w2, mlp.b2, mlp.w3, mlp.b3]);
  const paramCount = mlpParamCount(mlp);
  const last = logs[logs.length - 1]!;

  const model: CloserModel = { mlp, ae, mean, std };
  const engagement: CloserEngagement = {
    seed,
    backend: "cc_replica",
    issuers: scored,
    logs,
    metrics: {
      nTrain: trainIdx.length,
      nVal: valIdx.length,
      nTest: testIdx.length,
      testAuc: auc,
      testAp: auc,
      testAcc: (tp + tn) / Math.max(testP.length, 1),
      precision: tp / Math.max(tp + fp, 1),
      recall: tp / Math.max(tp + fn, 1),
      nException: scored.filter((s) => s.band === "exception").length,
      nTrueError: issuers.filter((i) => i.inject === "true_error").length,
      nRounding: issuers.filter((i) => i.inject === "rounding").length,
      nReclass: issuers.filter((i) => i.inject === "reclass").length,
      nClean: issuers.filter((i) => i.inject === "clean").length,
      paramCount,
      weightChecksum: cs,
      trainMs: performance.now() - t0,
    },
    routine: compileRoutine(paramCount, cs, auc, kind),
    golden: [
      kind === "bank" ? "goki_bank_closer.expected" : "goki_closer.expected",
      `fixed_state_for_init=${seed}`,
      `n_issuers=${issuers.length}`,
      `n_features=${d}`,
      `params=${paramCount}`,
      `epochs=${EPOCHS}`,
      `train_bce_tail=${last.trainBce.toFixed(6)}`,
      `val_bce_tail=${last.valBce.toFixed(6)}`,
      `test_auc=${auc.toFixed(6)}`,
      `checksum=${cs}`,
    ].join("\n"),
    featureNames: names,
  };
  return { engagement, model };
}

let cached: CloserEngagement | null = null;
let model: CloserModel | null = null;
let bankCached: CloserEngagement | null = null;
let bankModel: CloserModel | null = null;

export function runCloserEngagement(seed = CLOSER_SEED): CloserEngagement {
  if (cached && seed === cached.seed) return cached;
  const issuers = generateCloserIssuers(seed, N_CLOSER);
  const out = trainCloser(seed, issuers, "generic");
  model = out.model;
  cached = out.engagement;
  return cached;
}

export function runBankCloserEngagement(seed = BANK_CLOSER_SEED): CloserEngagement {
  if (bankCached && seed === bankCached.seed) return bankCached;
  const issuers = generateBankCloserIssuers(seed, N_CLOSER);
  const out = trainCloser(seed, issuers, "bank");
  bankModel = out.model;
  bankCached = out.engagement;
  return bankCached;
}

export function getCloserModel(): CloserModel {
  if (!model) runCloserEngagement();
  return model!;
}

export function getBankCloserModel(): CloserModel {
  if (!bankModel) runBankCloserEngagement();
  return bankModel!;
}

export function scoreCloserLive(issuer: Issuer, overlay?: Partial<NoteBooks>): CloserScore {
  const pack = packOf(issuer);
  const mdl = pack === "bank" ? getBankCloserModel() : getCloserModel();
  const { mlp, ae, mean, std } = mdl;
  const { features, rules, notes, names } = packNoteFeatures(issuer, overlay);
  const x = new Float32Array(N_NOTE_FEATURES);
  for (let j = 0; j < N_NOTE_FEATURES; j++) x[j] = (features[j]! - mean[j]!) / std[j]!;
  const pOpen = mlpProb(mlp, x);
  const aeE = aeErr(ae, x);
  const sal = mlpSaliency(mlp, x);
  const attribution = sal
    .map((value, j) => ({ name: names[j]!, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 6);
  const maxRel = maxPackRel(rules);
  return {
    issuer: { ...issuer, currNotes: notes },
    notes,
    rules,
    features,
    pOpen,
    aeErr: aeE,
    attribution,
    band: bandOf(pOpen, maxRel),
    maxRel,
  };
}

export function scoreHkCloser(): CloserScore[] {
  runCloserEngagement();
  runBankCloserEngagement();
  return buildHkIssuers()
    .map((iss) => scoreCloserLive(iss))
    .sort((a, b) => b.maxRel - a.maxRel || b.pOpen - a.pOpen);
}

export function findCloser(id: string): CloserScore | undefined {
  if (!id.startsWith("hk-")) return undefined;
  return scoreHkCloser().find((s) => s.issuer.id === id);
}

export function mergeIssuerNotes(issuer: Issuer, overlay?: Partial<NoteBooks>): Issuer {
  return { ...issuer, currNotes: mergeNotes(issuer.currNotes, overlay) };
}

export function getBankCloserMetrics() {
  return runBankCloserEngagement().metrics;
}
