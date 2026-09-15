import {
  checksum,
  makeMlp,
  mlpParamCount,
  mlpProb,
  mlpSgdStep,
  type MLP,
} from "./nn";
import { mulberry32, shuffleInPlace } from "./rng";
import { generatePackCloserIssuers } from "./closer-synth";
import { mergeNotes } from "./note-rules";
import { totalAssets } from "./rules";
import type { EstimateScore, Issuer } from "./types";

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

export interface EstimateModel {
  mlp: MLP;
  mean: Float64Array;
  std: Float64Array;
  auc: number;
  paramCount: number;
  checksum: string;
  trainMs: number;
  names: string[];
}

function trainBinary(
  seed: number,
  rows: { x: number[]; y: number }[],
  names: string[],
): EstimateModel {
  const t0 = performance.now();
  const rng = mulberry32(seed);
  const idx = rows.map((_, i) => i);
  shuffleInPlace(rng, idx);
  const nTrain = Math.floor(idx.length * 0.8);
  const trainIdx = idx.slice(0, nTrain);
  const testIdx = idx.slice(nTrain);
  const d = names.length;
  const mean = new Float64Array(d);
  const std = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    let a = 0;
    for (const i of trainIdx) a += rows[i]!.x[j]!;
    mean[j] = a / trainIdx.length;
  }
  for (let j = 0; j < d; j++) {
    let a = 0;
    for (const i of trainIdx) {
      const v = rows[i]!.x[j]! - mean[j]!;
      a += v * v;
    }
    std[j] = Math.sqrt(a / trainIdx.length) + 1e-6;
  }
  const xs = rows.map((r) => {
    const o = new Float32Array(d);
    for (let j = 0; j < d; j++) o[j] = (r.x[j]! - mean[j]!) / std[j]!;
    return o;
  });
  const ys = rows.map((r) => r.y);
  const mlp = makeMlp(rng, d, 16, 8);
  const BATCH = 32;
  const EPOCHS = 18;
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    const lr = 0.14 * (1 - epoch / EPOCHS) + 0.02;
    for (let b = 0; b < nBatches; b++) {
      mlpSgdStep(mlp, xs, ys, order.slice(b * BATCH, (b + 1) * BATCH), lr, 1e-4);
    }
  }
  const scores = testIdx.map((i) => mlpProb(mlp, xs[i]!));
  const labels = testIdx.map((i) => ys[i]!);
  return {
    mlp,
    mean,
    std,
    auc: rocAuc(scores, labels),
    paramCount: mlpParamCount(mlp),
    checksum: checksum([mlp.w1, mlp.b1, mlp.w2, mlp.b2, mlp.w3, mlp.b3]),
    trainMs: performance.now() - t0,
    names,
  };
}

function scoreWith(mdl: EstimateModel, x: number[], actual: number, predicted: number): EstimateScore {
  const v = new Float32Array(x.length);
  for (let j = 0; j < x.length; j++) v[j] = (x[j]! - mdl.mean[j]!) / mdl.std[j]!;
  const pOutlier = mlpProb(mdl.mlp, v);
  const residual = actual - predicted;
  let band: EstimateScore["band"] = "pass";
  if (Math.abs(residual) >= 0.03 || pOutlier >= 0.85) band = "exception";
  else if (Math.abs(residual) >= 0.01 || pOutlier >= 0.45) band = "review";
  return { predicted, actual, residual, pOutlier, band, features: x, names: mdl.names };
}

export const ECL_NAMES = [
  "coverage",
  "charge/gross",
  "writeoff/gross",
  "Δcoverage",
  "ADR",
  "ni/gross",
  "charge/ni",
  "writeoff/charge",
];

function eclRow(issuer: Issuer): { x: number[]; coverage: number; peer: number } {
  const n = mergeNotes(issuer.currNotes);
  const p = mergeNotes(issuer.priorNotes);
  const gross = Math.max(n.loansGross, 1);
  const priorGross = Math.max(p.loansGross, 1);
  const coverage = n.ecl / gross;
  const priorCov = p.ecl / priorGross;
  const peer = 0.012;
  return {
    coverage,
    peer,
    x: [
      coverage,
      n.eclCharge / gross,
      n.eclWriteoff / gross,
      coverage - priorCov,
      n.deposits > 0 ? issuer.curr.ar / n.deposits : 0.6,
      issuer.curr.ni / gross,
      n.eclCharge / Math.max(Math.abs(issuer.curr.ni), 1),
      n.eclWriteoff / Math.max(n.eclCharge, 1),
    ],
  };
}

let eclMdl: EstimateModel | null = null;

export function getEclNet(): EstimateModel {
  if (eclMdl) return eclMdl;
  const rng = mulberry32(41);
  const rows: { x: number[]; y: number }[] = [];
  for (let i = 0; i < 420; i++) {
    const coverage = 0.007 + rng() * 0.016;
    const charge = coverage * (0.25 + rng() * 0.35);
    const writeoff = charge * (0.3 + rng() * 0.5);
    const dCov = (rng() - 0.5) * 0.004;
    const adr = 0.55 + rng() * 0.18;
    const niG = 0.015 + rng() * 0.02;
    const x = [
      coverage,
      charge,
      writeoff,
      dCov,
      adr,
      niG,
      charge / Math.max(niG, 0.01),
      writeoff / Math.max(charge, 0.0001),
    ];
    let y = 0;
    if (i % 4 === 0) {
      const hi = rng() < 0.55;
      x[0] = hi ? 0.055 + rng() * 0.05 : 0.0005 + rng() * 0.001;
      x[1] = x[0]! * (0.25 + rng() * 0.4);
      x[2] = x[1]! * (0.3 + rng() * 0.5);
      x[3] = x[0]! - coverage;
      x[6] = x[1]! / Math.max(niG, 0.01);
      x[7] = x[2]! / Math.max(x[1]!, 0.0001);
      y = 1;
    }
    rows.push({ x, y });
  }
  eclMdl = trainBinary(41, rows, [...ECL_NAMES]);
  return eclMdl;
}

export function scoreEcl(issuer: Issuer): EstimateScore | null {
  const n = mergeNotes(issuer.currNotes);
  if (n.loansGross <= 0) return null;
  const mdl = getEclNet();
  const row = eclRow(issuer);
  return scoreWith(mdl, row.x, row.coverage, row.peer);
}

export const FV_NAMES = [
  "|fv|/ip",
  "fv/ni",
  "ip/A",
  "gearing",
  "rev/ip",
  "Δip",
  "da/ppe",
  "ni/eq",
];

function fvRow(issuer: Issuer): { x: number[]; ratio: number; peer: number } {
  const n = mergeNotes(issuer.currNotes);
  const p = mergeNotes(issuer.priorNotes);
  const ip = Math.max(n.ip, 1);
  const ratio = n.ipFv / ip;
  const a = Math.max(totalAssets(issuer.curr), 1);
  const eq = Math.max(issuer.curr.shareCap + issuer.curr.re, 1);
  return {
    ratio,
    peer: -0.008,
    x: [
      Math.abs(ratio),
      n.ipFv / Math.max(Math.abs(issuer.curr.ni), 1),
      n.ip / a,
      (issuer.curr.stDebt + issuer.curr.ltDebt - issuer.curr.cash) / eq,
      issuer.curr.revenue / ip,
      p.ip > 0 ? n.ip / p.ip - 1 : 0,
      issuer.curr.da / Math.max(issuer.curr.ppe, 1),
      issuer.curr.ni / eq,
    ],
  };
}

let fvMdl: EstimateModel | null = null;

export function getFvNet(): EstimateModel {
  if (fvMdl) return fvMdl;
  const rng = mulberry32(43);
  const base = generatePackCloserIssuers("realty", 43, 320);
  const rows = base.map((iss) => {
    const row = fvRow(iss);
    let y = Math.abs(row.ratio) > 0.05 ? 1 : 0;
    if (rng() < 0.14) {
      row.x[0] = 0.08 + rng() * 0.1;
      y = 1;
    }
    return { x: row.x, y };
  });
  fvMdl = trainBinary(43, rows, [...FV_NAMES]);
  return fvMdl;
}

export function scoreFv(issuer: Issuer): EstimateScore | null {
  const n = mergeNotes(issuer.currNotes);
  if (n.ip <= 0) return null;
  const mdl = getFvNet();
  const row = fvRow(issuer);
  return scoreWith(mdl, row.x, row.ratio, row.peer);
}

export function ensureEstimateNets() {
  return { ecl: getEclNet(), fv: getFvNet() };
}
