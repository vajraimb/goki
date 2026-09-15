import {
  checksum,
  makeSoftmax,
  softmaxArgmax,
  softmaxForward,
  softmaxParamCount,
  softmaxSgdStep,
  type SoftmaxNet,
} from "./nn";
import { mulberry32, shuffleInPlace } from "./rng";
import { generateIssuers } from "./statements";
import { totalAssets } from "./rules";
import { mergeNotes } from "./note-rules";
import { packOf } from "./packs";
import type { Issuer, PackGuess, RulePack } from "./types";
import { RULE_PACKS } from "./types";

export const PACK_NET_NAMES = [
  "ar/A",
  "inv/A",
  "ppe/A",
  "debt/A",
  "cash/A",
  "gp/rev",
  "da/ppe",
  "otherL/A",
  "otherNca/A",
  "ni/rev",
  "cfo/ni",
  "noteHint/A",
] as const;

const K = RULE_PACKS.length;

function nz(n: number, f = 1e-6): number {
  return Math.abs(n) < f ? f : n;
}

export function packFeatures(issuer: Issuer): number[] {
  const y = issuer.curr;
  const a = Math.max(totalAssets(y), 1);
  const n = mergeNotes(issuer.currNotes);
  const hint = n.loansGross + n.ip + n.marginFunds + n.stInvest + n.prov;
  const gpRatio = y.cogs === 0 && Math.abs(y.gp - y.revenue) < 1 ? 0 : y.gp / nz(y.revenue);
  return [
    y.ar / a,
    y.inv / a,
    y.ppe / a,
    (y.stDebt + y.ltDebt) / a,
    y.cash / a,
    gpRatio,
    y.da / nz(y.ppe),
    y.otherL / a,
    y.otherNca / a,
    y.ni / nz(y.revenue),
    y.cfo / nz(Math.abs(y.ni)),
    hint / a,
  ];
}

function morph(issuer: Issuer, pack: RulePack, rng: () => number): Issuer {
  const y = { ...issuer.curr };
  const p = { ...issuer.prior };
  const a = Math.max(totalAssets(y), 1);
  const notes = mergeNotes(issuer.currNotes);
  if (pack === "bank") {
    y.inv = 0;
    y.gp = 0;
    y.cogs = 0;
    y.ar = a * (0.28 + rng() * 0.08);
    y.otherL = a * (0.55 + rng() * 0.1);
    notes.loansGross = y.ar * 1.02;
    notes.ecl = y.ar * 0.015;
    notes.deposits = y.otherL * 0.85;
  } else if (pack === "realty") {
    y.inv = a * (0.22 + rng() * 0.06);
    y.ppe = a * (0.06 + rng() * 0.03);
    y.otherNca = a * (0.48 + rng() * 0.08);
    y.da = y.ppe * 0.02;
    notes.ip = y.otherNca * 0.85;
    notes.ipFv = y.ni * (rng() * 0.3 - 0.15);
  } else if (pack === "energy") {
    y.ppe = a * (0.55 + rng() * 0.12);
    y.inv = a * 0.02;
    y.da = y.ppe * (0.08 + rng() * 0.05);
    notes.prov = y.ppe * 0.15;
  } else if (pack === "platform") {
    y.inv = a * 0.004;
    y.ppe = a * (0.04 + rng() * 0.04);
    y.otherNca = a * (0.4 + rng() * 0.15);
    notes.stInvest = y.cash * (0.8 + rng());
    notes.buyback = Math.abs(y.ni) * (0.2 + rng() * 0.3);
  } else if (pack === "exchange") {
    y.cash = a * (0.28 + rng() * 0.1);
    y.inv = 0;
    y.ppe = a * 0.005;
    y.otherL = a * (0.85 + rng() * 0.08);
    y.gp = y.revenue;
    y.cogs = 0;
    notes.marginFunds = y.otherL * 0.5;
    notes.ownCash = y.cash * 0.12;
  } else {
    y.inv = a * (0.12 + rng() * 0.08);
    y.ppe = a * (0.18 + rng() * 0.1);
  }
  return { ...issuer, pack, curr: y, prior: p, currNotes: notes };
}

export interface PackNetModel {
  net: SoftmaxNet;
  mean: Float64Array;
  std: Float64Array;
  acc: number;
  paramCount: number;
  checksum: string;
  trainMs: number;
  nTrain: number;
}

let cached: PackNetModel | null = null;

export function trainPackNet(seed = 29): PackNetModel {
  const t0 = performance.now();
  const rng = mulberry32(seed);
  const samples: { x: number[]; y: number }[] = [];
  for (let k = 0; k < K; k++) {
    const pack = RULE_PACKS[k]!;
    const base = generateIssuers(seed + k * 17, 100);
    for (const iss of base) {
      const m = morph(iss, pack, rng);
      samples.push({ x: packFeatures(m), y: k });
    }
  }
  const idx = samples.map((_, i) => i);
  shuffleInPlace(rng, idx);
  const nTrain = Math.floor(idx.length * 0.85);
  const trainIdx = idx.slice(0, nTrain);
  const testIdx = idx.slice(nTrain);
  const d = PACK_NET_NAMES.length;
  const mean = new Float64Array(d);
  const std = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    let a = 0;
    for (const i of trainIdx) a += samples[i]!.x[j]!;
    mean[j] = a / trainIdx.length;
  }
  for (let j = 0; j < d; j++) {
    let a = 0;
    for (const i of trainIdx) {
      const v = samples[i]!.x[j]! - mean[j]!;
      a += v * v;
    }
    std[j] = Math.sqrt(a / trainIdx.length) + 1e-6;
  }
  const xs = samples.map((s) => {
    const o = new Float32Array(d);
    for (let j = 0; j < d; j++) o[j] = (s.x[j]! - mean[j]!) / std[j]!;
    return o;
  });
  const ys = samples.map((s) => s.y);
  const net = makeSoftmax(rng, d, 24, K);
  const BATCH = 32;
  const EPOCHS = 14;
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    const lr = 0.18 * (1 - epoch / EPOCHS) + 0.02;
    for (let b = 0; b < nBatches; b++) {
      const batch = order.slice(b * BATCH, (b + 1) * BATCH);
      softmaxSgdStep(net, xs, ys, batch, lr, 1e-4);
    }
  }
  let hit = 0;
  for (const i of testIdx) {
    if (softmaxArgmax(softmaxForward(net, xs[i]!).p) === ys[i]) hit++;
  }
  const acc = hit / Math.max(testIdx.length, 1);
  cached = {
    net,
    mean,
    std,
    acc,
    paramCount: softmaxParamCount(net),
    checksum: checksum([net.w1, net.b1, net.w2, net.b2]),
    trainMs: performance.now() - t0,
    nTrain: trainIdx.length,
  };
  return cached;
}

export function getPackNet(): PackNetModel {
  return cached ?? trainPackNet();
}

export function guessPack(issuer: Issuer): PackGuess {
  const mdl = getPackNet();
  const raw = packFeatures(issuer);
  const x = new Float32Array(raw.length);
  for (let j = 0; j < raw.length; j++) x[j] = (raw[j]! - mdl.mean[j]!) / mdl.std[j]!;
  const { p } = softmaxForward(mdl.net, x);
  const probs = {} as Record<RulePack, number>;
  for (let i = 0; i < K; i++) probs[RULE_PACKS[i]!] = p[i]!;
  const pack = RULE_PACKS[softmaxArgmax(p)]!;
  const assigned = packOf(issuer);
  return { pack, probs, assigned, match: pack === assigned };
}
