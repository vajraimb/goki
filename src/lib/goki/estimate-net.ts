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
import { packOf } from "./packs";
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

export const DDA_NAMES = [
  "da/ppe",
  "prior da/ppe",
  "Δrate",
  "capex/ppe",
  "impair/ppe",
  "da/rev",
  "ni/ppe",
  "ppe/A",
];

function ddaRow(issuer: Issuer): { x: number[]; rate: number; prior: number } {
  const n = mergeNotes(issuer.currNotes);
  const ppe = Math.max(issuer.curr.ppe, 1);
  const priorPpe = Math.max(issuer.prior.ppe, 1);
  const rate = issuer.curr.da / ppe;
  const prior = issuer.prior.da / priorPpe;
  const a = Math.max(totalAssets(issuer.curr), 1);
  return {
    rate,
    prior,
    x: [
      rate,
      prior,
      rate - prior,
      issuer.curr.capex / ppe,
      n.ppeImpair / ppe,
      issuer.curr.da / Math.max(issuer.curr.revenue, 1),
      issuer.curr.ni / ppe,
      ppe / a,
    ],
  };
}

let ddaMdl: EstimateModel | null = null;

export function getDdaNet(): EstimateModel {
  if (ddaMdl) return ddaMdl;
  const rng = mulberry32(47);
  const rows: { x: number[]; y: number }[] = [];
  for (let i = 0; i < 480; i++) {
    const kind = i % 3 === 0 ? "telco" : rng() < 0.55 ? "oil" : "power";
    let prior: number;
    let ppeA: number;
    let daRev: number;
    let capex: number;
    if (kind === "telco") {
      prior = 0.22 + rng() * 0.08;
      ppeA = 0.28 + rng() * 0.12;
      daRev = 0.16 + rng() * 0.06;
      capex = 0.18 + rng() * 0.08;
    } else if (kind === "oil") {
      prior = 0.09 + rng() * 0.04;
      ppeA = 0.5 + rng() * 0.15;
      daRev = 0.08 + rng() * 0.12;
      capex = 0.08 + rng() * 0.12;
    } else {
      prior = 0.04 + rng() * 0.025;
      ppeA = 0.55 + rng() * 0.15;
      daRev = 0.08 + rng() * 0.12;
      capex = 0.08 + rng() * 0.12;
    }
    let rate = prior + (rng() - 0.5) * 0.012;
    let y = 0;
    if (i % 4 === 0) {
      rate = rng() < 0.5 ? prior + 0.05 + rng() * 0.06 : Math.max(0.005, prior - 0.05 - rng() * 0.03);
      y = 1;
    }
    const impair = y ? rng() * 0.03 : rng() * 0.004;
    const niPpe = kind === "telco" ? 0.16 + rng() * 0.08 : 0.08 + rng() * 0.12;
    rows.push({
      x: [rate, prior, rate - prior, capex, impair, daRev, niPpe, ppeA],
      y,
    });
  }
  ddaMdl = trainBinary(47, rows, [...DDA_NAMES]);
  return ddaMdl;
}

export function scoreDda(issuer: Issuer): EstimateScore | null {
  if (packOf(issuer) !== "energy" && packOf(issuer) !== "telco") return null;
  if (issuer.curr.ppe <= 0 || issuer.curr.da <= 0) return null;
  const mdl = getDdaNet();
  const row = ddaRow(issuer);
  return scoreWith(mdl, row.x, row.rate, row.prior);
}

export const BB_NAMES = [
  "buyback/|NI|",
  "buyback/eq",
  "buyback/rev",
  "cfo/ni",
  "stInvest/A",
  "ni/eq",
  "div/ni",
  "Δcash/A",
];

function bbRow(issuer: Issuer): { x: number[]; ratio: number; peer: number } {
  const n = mergeNotes(issuer.currNotes);
  const eq = Math.max(issuer.curr.shareCap + issuer.curr.re, 1);
  const niAbs = Math.max(Math.abs(issuer.curr.ni), 1);
  const ratio = n.buyback / niAbs;
  const a = Math.max(totalAssets(issuer.curr), 1);
  return {
    ratio,
    peer: 0.22,
    x: [
      ratio,
      n.buyback / eq,
      n.buyback / Math.max(issuer.curr.revenue, 1),
      issuer.curr.cfo / niAbs,
      n.stInvest / a,
      issuer.curr.ni / eq,
      issuer.curr.dividends / niAbs,
      (issuer.curr.cash - issuer.prior.cash) / a,
    ],
  };
}

let bbMdl: EstimateModel | null = null;

export function getBuybackNet(): EstimateModel {
  if (bbMdl) return bbMdl;
  const rng = mulberry32(49);
  const rows: { x: number[]; y: number }[] = [];
  for (let i = 0; i < 420; i++) {
    let ratio = 0.04 + rng() * 0.35;
    let y = 0;
    if (i % 4 === 0) {
      ratio = 0.7 + rng() * 0.9;
      y = 1;
    }
    const eq = 0.02 + rng() * 0.08;
    const rev = 0.02 + rng() * 0.08;
    const cfoNi = 0.8 + rng() * 0.6;
    const stA = 0.05 + rng() * 0.12;
    const niEq = 0.08 + rng() * 0.12;
    const div = 0.1 + rng() * 0.25;
    const dCash = (rng() - 0.5) * 0.04;
    rows.push({
      x: [ratio, eq, rev, cfoNi, stA, niEq, div, dCash],
      y,
    });
  }
  bbMdl = trainBinary(49, rows, [...BB_NAMES]);
  return bbMdl;
}

export function scoreBuyback(issuer: Issuer): EstimateScore | null {
  if (packOf(issuer) !== "platform") return null;
  const n = mergeNotes(issuer.currNotes);
  if (n.buyback <= 0) return null;
  const mdl = getBuybackNet();
  const row = bbRow(issuer);
  const scored = scoreWith(mdl, row.x, row.ratio, row.peer);
  let band: EstimateScore["band"] = "pass";
  if (row.ratio >= 0.8 || scored.pOutlier >= 0.85) band = "exception";
  else if (row.ratio >= 0.45 || scored.pOutlier >= 0.55) band = "review";
  return { ...scored, band };
}

export const SBC_NAMES = [
  "sbp/opex",
  "sbp/|NI|",
  "sbp/eq",
  "opex/rev",
  "ni/eq",
  "buyback/|NI|",
  "stInvest/A",
  "Δeq",
];

function sbcRow(issuer: Issuer): { x: number[]; ratio: number; peer: number } {
  const n = mergeNotes(issuer.currNotes);
  const opex = Math.max(issuer.curr.opex, 1);
  const niAbs = Math.max(Math.abs(issuer.curr.ni), 1);
  const eq = Math.max(issuer.curr.shareCap + issuer.curr.re, 1);
  const a = Math.max(totalAssets(issuer.curr), 1);
  const ratio = n.sbp / opex;
  return {
    ratio,
    peer: 0.12,
    x: [
      ratio,
      n.sbp / niAbs,
      n.sbp / eq,
      issuer.curr.opex / Math.max(issuer.curr.revenue, 1),
      issuer.curr.ni / eq,
      n.buyback / niAbs,
      n.stInvest / a,
      (eq - (issuer.prior.shareCap + issuer.prior.re)) / eq,
    ],
  };
}

let sbcMdl: EstimateModel | null = null;

export function getSbcNet(): EstimateModel {
  if (sbcMdl) return sbcMdl;
  const rng = mulberry32(51);
  const rows: { x: number[]; y: number }[] = [];
  for (let i = 0; i < 420; i++) {
    let ratio = 0.06 + rng() * 0.14;
    let y = 0;
    if (i % 4 === 0) {
      ratio = 0.32 + rng() * 0.25;
      y = 1;
    }
    rows.push({
      x: [
        ratio,
        ratio * (0.4 + rng()),
        0.02 + rng() * 0.04,
        0.2 + rng() * 0.15,
        0.08 + rng() * 0.1,
        0.1 + rng() * 0.25,
        0.08 + rng() * 0.12,
        (rng() - 0.3) * 0.1,
      ],
      y,
    });
  }
  sbcMdl = trainBinary(51, rows, [...SBC_NAMES]);
  return sbcMdl;
}

export function scoreSbc(issuer: Issuer): EstimateScore | null {
  if (packOf(issuer) !== "platform") return null;
  const n = mergeNotes(issuer.currNotes);
  if (n.sbp <= 0) return null;
  const mdl = getSbcNet();
  const row = sbcRow(issuer);
  const scored = scoreWith(mdl, row.x, row.ratio, row.peer);
  let band: EstimateScore["band"] = "pass";
  if (row.ratio >= 0.3 || scored.pOutlier >= 0.85) band = "exception";
  else if (row.ratio >= 0.2 || scored.pOutlier >= 0.55) band = "review";
  return { ...scored, band };
}

export const CL_NAMES = [
  "cl/rev",
  "release/cl_beg",
  "Δcl/rev",
  "cl/A",
  "gp/rev",
  "opex/rev",
  "cfo/rev",
  "stInvest/A",
];

function clRow(issuer: Issuer): { x: number[]; ratio: number; peer: number } {
  const n = mergeNotes(issuer.currNotes);
  const p = mergeNotes(issuer.priorNotes);
  const rev = Math.max(issuer.curr.revenue, 1);
  const a = Math.max(totalAssets(issuer.curr), 1);
  const ratio = n.cl / rev;
  const relBeg = p.cl > 0 ? n.clRelease / p.cl : 0;
  return {
    ratio,
    peer: 0.1,
    x: [
      ratio,
      relBeg,
      (n.cl - p.cl) / rev,
      n.cl / a,
      issuer.curr.gp / rev,
      issuer.curr.opex / rev,
      issuer.curr.cfo / rev,
      n.stInvest / a,
    ],
  };
}

let clMdl: EstimateModel | null = null;

export function getClNet(): EstimateModel {
  if (clMdl) return clMdl;
  const rng = mulberry32(53);
  const rows: { x: number[]; y: number }[] = [];
  for (let i = 0; i < 420; i++) {
    let ratio = 0.04 + rng() * 0.14;
    let y = 0;
    if (i % 4 === 0) {
      ratio = 0.35 + rng() * 0.25;
      y = 1;
    }
    rows.push({
      x: [
        ratio,
        0.85 + rng() * 0.12,
        (rng() - 0.4) * 0.04,
        ratio * 0.4,
        0.4 + rng() * 0.2,
        0.2 + rng() * 0.15,
        0.15 + rng() * 0.2,
        0.08 + rng() * 0.1,
      ],
      y,
    });
  }
  clMdl = trainBinary(53, rows, [...CL_NAMES]);
  return clMdl;
}

export function scoreDeferred(issuer: Issuer): EstimateScore | null {
  const pack = packOf(issuer);
  if (pack !== "platform" && pack !== "telco") return null;
  const n = mergeNotes(issuer.currNotes);
  if (n.cl <= 0) return null;
  const mdl = getClNet();
  const row = clRow(issuer);
  const scored = scoreWith(mdl, row.x, row.ratio, row.peer);
  let band: EstimateScore["band"] = "pass";
  if (row.ratio >= 0.28 || scored.pOutlier >= 0.85) band = "exception";
  else if (row.ratio >= 0.18 || scored.pOutlier >= 0.55) band = "review";
  return { ...scored, band };
}

export function ensureEstimateNets() {
  return {
    ecl: getEclNet(),
    fv: getFvNet(),
    dda: getDdaNet(),
    buyback: getBuybackNet(),
    sbc: getSbcNet(),
    deferred: getClNet(),
  };
}

