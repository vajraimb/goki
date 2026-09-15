import { mulberry32, shuffleInPlace } from "./rng";
import { generateIssuers, INIT_SEED, N_ISSUERS } from "./statements";
import { FEATURE_NAMES, issuerFeatures, labelOf, N_FEATURES, standardize } from "./features";
import { maxIdentityAbsRel } from "./rules";
import { totalAssets } from "./rules";
import {
  aeErr,
  aeSgdStep,
  checksum,
  makeAe,
  makeMlp,
  makeReg,
  mlpMeanBce,
  mlpParamCount,
  mlpProb,
  mlpSaliency,
  mlpSgdStep,
  regForward,
  regSgdStep,
} from "./nn";
import type { Engagement, EpochLog, Issuer, Metrics, ScoredIssuer } from "./types";

const EPOCHS = 14;
const BATCH = 32;
const HID1 = 64;
const HID2 = 32;

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

function averagePrecision(scores: number[], labels: number[]): number {
  const pairs = scores.map((s, i) => ({ s, y: labels[i]! }));
  pairs.sort((a, b) => b.s - a.s);
  let hit = 0;
  let sum = 0;
  const nPos = labels.reduce((a, y) => a + y, 0);
  if (nPos === 0) return 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i]!.y === 1) {
      hit += 1;
      sum += hit / (i + 1);
    }
  }
  return sum / nPos;
}

function cashTarget(issuer: Issuer): number {
  const a = Math.max(totalAssets(issuer.curr), 1);
  return issuer.curr.cash / a;
}

function cashFeatures(issuer: Issuer): Float32Array {
  const y = issuer.curr;
  const a = Math.max(totalAssets(y), 1);
  const x = new Float32Array([
    y.ar / a,
    y.inv / a,
    y.ppe / a,
    y.ap / a,
    (y.stDebt + y.ltDebt) / a,
    y.revenue / a,
    y.ni / a,
    y.cfo / a,
    y.re / a,
    y.tax / a,
  ]);
  return x;
}

function bandOf(p: number, maxRel: number): ScoredIssuer["band"] {
  if (p >= 0.5 || maxRel >= 0.05) return "exception";
  if (p >= 0.2 || maxRel >= 0.01) return "review";
  return "pass";
}

function compileRoutine(paramCount: number, checksumHex: string, auc: number): string {
  return `/* goki_mlp_forward — OCANNL cc backend replica
 * schedule: packed FMA  (v1.0.1-class SIMD)
 * seed=3   params=${paramCount}   dtype=f32
 * checksum=${checksumHex}   test_auc=${auc.toFixed(4)}
 * .cd → .ll → .c    bit-stable under fixed_state_for_init
 */
void goki_mlp_forward(const float *x /* [38] */, float *y /* [1] */) {
  float h1[64], h2[32];
  /* h1 = relu(W1 @ x + b1)   W1 : 64 × 38 */
  for (int i = 0; i < 64; ++i) {
    float acc = b1[i];
    for (int j = 0; j < 38; ++j) acc = fmaf(W1[i*38+j], x[j], acc);
    h1[i] = acc > 0.f ? acc : 0.f;
  }
  /* h2 = relu(W2 @ h1 + b2)  W2 : 32 × 64 */
  for (int i = 0; i < 32; ++i) {
    float acc = b2[i];
    for (int j = 0; j < 64; ++j) acc = fmaf(W2[i*64+j], h1[j], acc);
    h2[i] = acc > 0.f ? acc : 0.f;
  }
  /* logit = W3 @ h2 + b3 */
  float z = b3[0];
  for (int j = 0; j < 32; ++j) z = fmaf(W3[j], h2[j], z);
  y[0] = 1.f / (1.f + expf(-z)); /* sigmoid, audit-stable */
}
`;
}

let cached: Engagement | null = null;

export function runEngagement(seed = INIT_SEED): Engagement {
  if (cached && seed === cached.seed) return cached;
  const t0 = performance.now();
  const issuers = generateIssuers(seed, N_ISSUERS);
  const packed = issuers.map((iss) => {
    const { features, rules } = issuerFeatures(iss);
    return { issuer: iss, features, rules, y: labelOf(iss) };
  });

  const idx = packed.map((_, i) => i);
  const splitRng = mulberry32(42);
  shuffleInPlace(splitRng, idx);
  const nTrain = Math.floor(idx.length * 0.8);
  const nVal = Math.floor(idx.length * 0.1);
  const trainIdx = idx.slice(0, nTrain);
  const valIdx = idx.slice(nTrain, nTrain + nVal);
  const testIdx = idx.slice(nTrain + nVal);

  const trainRows = trainIdx.map((i) => packed[i]!.features);
  // Re-fit scaler on train only
  const fitted = standardize(trainRows);
  const xs = packed.map((p) => {
    const o = new Float32Array(N_FEATURES);
    for (let j = 0; j < N_FEATURES; j++) o[j] = (p.features[j]! - fitted.mean[j]!) / fitted.std[j]!;
    return o;
  });
  const ys = packed.map((p) => p.y);

  const rng = mulberry32(seed);
  const mlp = makeMlp(rng, N_FEATURES, HID1, HID2);
  const ae = makeAe(rng, N_FEATURES, 16, 8);
  const cashXs = packed.map((p) => cashFeatures(p.issuer));
  const cashYs = packed.map((p) => cashTarget(p.issuer));
  const reg = makeReg(rng, cashXs[0]!.length, 32);

  const logs: EpochLog[] = [];
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  const steps = EPOCHS * nBatches;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    let bce = 0;
    let aeL = 0;
    let rgL = 0;
    let nb = 0;
    for (let b = 0; b < nBatches; b++) {
      const batch = order.slice(b * BATCH, (b + 1) * BATCH);
      const stepN = epoch * nBatches + b;
      const lr = 0.12 * ((1.5 * steps - stepN) / steps);
      bce += mlpSgdStep(mlp, xs, ys, batch, Math.max(lr, 0.01), 1e-4);
      const aeBatch = batch.filter((i) => ys[i] === 0);
      if (aeBatch.length >= 8) aeL += aeSgdStep(ae, xs, aeBatch, Math.max(lr, 0.02));
      rgL += regSgdStep(reg, cashXs, cashYs, batch, Math.max(lr * 0.5, 0.01));
      nb += 1;
    }
    const valBce = mlpMeanBce(mlp, xs, ys, valIdx);
    logs.push({
      epoch,
      trainBce: bce / nb,
      valBce,
      aeMse: aeL / Math.max(nb, 1),
      regMse: rgL / nb,
    });
  }

  const scored: ScoredIssuer[] = packed.map((p, i) => {
    const x = xs[i]!;
    const pError = mlpProb(mlp, x);
    const aeE = aeErr(ae, x);
    const cashPred = regForward(reg, cashXs[i]!).y;
    const cashResidual = cashPred - cashYs[i]!;
    const sal = mlpSaliency(mlp, x);
    const attribution = sal
      .map((value, j) => ({ name: FEATURE_NAMES[j]!, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 6);
    const maxRel = maxIdentityAbsRel(p.rules);
    return {
      issuer: p.issuer,
      rules: p.rules,
      features: p.features,
      pError,
      aeErr: aeE,
      cashPred,
      cashResidual,
      attribution,
      band: bandOf(pError, maxRel),
    };
  });

  scored.sort((a, b) => b.pError - a.pError);

  const testP = testIdx.map((i) => mlpProb(mlp, xs[i]!));
  const testY = testIdx.map((i) => ys[i]!);
  const auc = rocAuc(testP, testY);
  const ap = averagePrecision(testP, testY);
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let k = 0; k < testP.length; k++) {
    const pred = testP[k]! >= 0.5 ? 1 : 0;
    const y = testY[k]!;
    if (pred === 1 && y === 1) tp++;
    else if (pred === 1 && y === 0) fp++;
    else if (pred === 0 && y === 0) tn++;
    else fn++;
  }
  const acc = (tp + tn) / Math.max(testP.length, 1);
  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);

  const cs = checksum([mlp.w1, mlp.b1, mlp.w2, mlp.b2, mlp.w3, mlp.b3]);
  const paramCount = mlpParamCount(mlp);
  const trainMs = performance.now() - t0;

  const metrics: Metrics = {
    nTrain: trainIdx.length,
    nVal: valIdx.length,
    nTest: testIdx.length,
    testAuc: auc,
    testAp: ap,
    testAcc: acc,
    precision,
    recall,
    nException: scored.filter((s) => s.band === "exception").length,
    nTrueError: issuers.filter((i) => i.inject === "true_error").length,
    nRounding: issuers.filter((i) => i.inject === "rounding").length,
    nReclass: issuers.filter((i) => i.inject === "reclass").length,
    nClean: issuers.filter((i) => i.inject === "clean").length,
    paramCount,
    weightChecksum: cs,
    trainMs,
  };

  const last = logs[logs.length - 1]!;
  const golden = [
    "goki_mlp.expected",
    "backend=cc_replica",
    `fixed_state_for_init=${seed}`,
    `n_issuers=${N_ISSUERS}`,
    `n_features=${N_FEATURES}`,
    `params=${paramCount}`,
    `epochs=${EPOCHS}`,
    `split=80/10/10 seed=42`,
    `train_bce_tail=${last.trainBce.toFixed(6)}`,
    `val_bce_tail=${last.valBce.toFixed(6)}`,
    `test_auc=${auc.toFixed(6)}`,
    `test_ap=${ap.toFixed(6)}`,
    `weight_checksum=${cs}`,
    "bit_stable=true  (same seed, same schedule, same IEEE f32)",
  ].join("\n");

  cached = {
    seed,
    backend: "cc_replica",
    issuers: scored,
    logs,
    metrics,
    routine: compileRoutine(paramCount, cs, auc),
    golden,
    featureNames: FEATURE_NAMES,
  };
  return cached;
}

export function findIssuer(eng: Engagement, id: string): ScoredIssuer | undefined {
  return eng.issuers.find((s) => s.issuer.id === id);
}
