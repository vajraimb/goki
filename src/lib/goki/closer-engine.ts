import { mulberry32, shuffleInPlace } from "./rng";
import {
  generatePackCloserIssuers,
  PACK_CLOSER_SEED,
} from "./closer-synth";
import { N_NOTE_FEATURES } from "./note-rules";
import { packNoteFeatures, packOf } from "./packs";
import { buildHkIssuers } from "./hk-bluechips";
import { liveIssuers } from "./map-intake";
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
import type { CloserEngagement, CloserScore, Issuer, NoteBooks, RulePack } from "./types";
import { RULE_PACKS } from "./types";

const EPOCHS_FULL = 12;
const EPOCHS_PACK = 8;
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

function compileRoutine(paramCount: number, checksumHex: string, auc: number, pack: RulePack): string {
  const tag = `goki_${pack}_closer_forward`;
  const seed = PACK_CLOSER_SEED[pack];
  return `/* ${tag} — OCANNL cc backend replica
 * ${pack} note-rollforward closer   seed=${seed}   params=${paramCount}   dtype=f32
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
  pack: RulePack;
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

function trainCloser(seed: number, issuers: Issuer[], pack: RulePack): { engagement: CloserEngagement; model: CloserModel } {
  const t0 = performance.now();
  const packed = issuers.map((iss) => {
    const { features, rules, notes, names } = packNoteFeatures(iss);
    return { issuer: iss, features, rules, notes, names, y: iss.inject === "true_error" ? 1 : 0 };
  });
  const names = packed[0]?.names ?? [];

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
  const epochs = pack === "generic" || pack === "bank" ? EPOCHS_FULL : EPOCHS_PACK;
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  const steps = epochs * nBatches;

  for (let epoch = 0; epoch < epochs; epoch++) {
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

  const model: CloserModel = { mlp, ae, mean, std, pack };
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
    routine: compileRoutine(paramCount, cs, auc, pack),
    golden: [
      `goki_${pack}_closer.expected`,
      `fixed_state_for_init=${seed}`,
      `n_issuers=${issuers.length}`,
      `n_features=${d}`,
      `params=${paramCount}`,
      `epochs=${epochs}`,
      `train_bce_tail=${last.trainBce.toFixed(6)}`,
      `val_bce_tail=${last.valBce.toFixed(6)}`,
      `test_auc=${auc.toFixed(6)}`,
      `checksum=${cs}`,
    ].join("\n"),
    featureNames: names,
  };
  return { engagement, model };
}

const cachedEng = new Map<RulePack, CloserEngagement>();
const cachedModel = new Map<RulePack, CloserModel>();

export function ensureCloser(pack: RulePack): CloserEngagement {
  const hit = cachedEng.get(pack);
  if (hit) return hit;
  const seed = PACK_CLOSER_SEED[pack];
  const issuers = generatePackCloserIssuers(pack, seed);
  const out = trainCloser(seed, issuers, pack);
  cachedEng.set(pack, out.engagement);
  cachedModel.set(pack, out.model);
  return out.engagement;
}

export function runCloserEngagement(seed = PACK_CLOSER_SEED.generic): CloserEngagement {
  return ensureCloser("generic");
}

export function runBankCloserEngagement(seed = PACK_CLOSER_SEED.bank): CloserEngagement {
  return ensureCloser("bank");
}

export function getCloserModel(): CloserModel {
  ensureCloser("generic");
  return cachedModel.get("generic")!;
}

export function getBankCloserModel(): CloserModel {
  ensureCloser("bank");
  return cachedModel.get("bank")!;
}

export function getPackCloserModel(pack: RulePack): CloserModel {
  ensureCloser(pack);
  return cachedModel.get(pack)!;
}

export function scoreCloserLive(issuer: Issuer, overlay?: Partial<NoteBooks>): CloserScore {
  const pack = packOf(issuer);
  const mdl = getPackCloserModel(pack);
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
  const issuers = liveIssuers(buildHkIssuers());
  const needed = new Set(issuers.map((i) => packOf(i)));
  for (const p of needed) ensureCloser(p);
  return issuers
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
  return ensureCloser("bank").metrics;
}

export function ensureAllClosers() {
  for (const p of RULE_PACKS) ensureCloser(p);
  return RULE_PACKS.map((p) => ({ pack: p, metrics: cachedEng.get(p)!.metrics }));
}
