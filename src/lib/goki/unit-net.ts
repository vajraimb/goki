import {
  checksum,
  makeSoftmax,
  softmaxArgmax,
  softmaxForward,
  softmaxParamCount,
  softmaxSgdStep,
  type SoftmaxNet,
} from "./nn";
import { packOf } from "./packs";
import { totalAssets } from "./rules";
import { mulberry32, shuffleInPlace } from "./rng";
import type { Issuer } from "./types";
import { RULE_PACKS } from "./types";

export const UNIT_SEED = 67;
export const UNIT_IDS = ["thousand", "million", "yi"] as const;
export type UnitId = (typeof UNIT_IDS)[number] | "wan";

export const UNIT_LABEL: Record<UnitId, string> = {
  thousand: "千元",
  wan: "万元",
  million: "百万",
  yi: "亿",
};

/** Multiply the typed number by this to get 报表百万. */
export const UNIT_TO_MILLION: Record<UnitId, number> = {
  thousand: 0.001,
  wan: 0.01,
  million: 1,
  yi: 100,
};

const K = UNIT_IDS.length;
const HID = 12;
const PACK_N = RULE_PACKS.length;
export const UNIT_IN = 6 + PACK_N;

function log10p(n: number): number {
  return Math.log10(Math.abs(n) + 1);
}

function clip(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function unitFeatures(issuer: Issuer, raw: number, existingMillion: number): number[] {
  const assetsM = Math.max(totalAssets(issuer.curr) / 100, 1);
  const niM = Math.max(Math.abs(issuer.curr.ni) / 100, 1);
  const has = Math.abs(existingMillion) >= 0.5 ? 1 : 0;
  const vsExist = has ? log10p(raw) - log10p(existingMillion) : 0;
  const pack = packOf(issuer);
  return [
    log10p(raw),
    log10p(assetsM),
    log10p(niM),
    clip(log10p(raw) - log10p(assetsM), -6, 8),
    has,
    clip(vsExist, -6, 8),
    ...RULE_PACKS.map((p) => (p === pack ? 1 : 0)),
  ];
}

function synth(seed: number): { x: number[]; y: number }[] {
  const rng = mulberry32(seed);
  const rows: { x: number[]; y: number }[] = [];
  for (let i = 0; i < 3200; i++) {
    const assetsM = Math.exp(rng() * 8 + 8);
    const niM = assetsM * (0.01 + rng() * 0.08);
    const trueM = assetsM * (0.0005 + rng() * 0.25);
    const y = Math.floor(rng() * K);
    const id = UNIT_IDS[y]!;
    const raw = trueM / UNIT_TO_MILLION[id];
    const has = rng() < 0.35 ? 1 : 0;
    const existing = has ? trueM * (0.7 + rng() * 0.6) : 0;
    const pack = RULE_PACKS[Math.floor(rng() * PACK_N)]!;
    const x = [
      log10p(raw),
      log10p(assetsM),
      log10p(niM),
      clip(log10p(raw) - log10p(assetsM), -6, 8),
      has,
      has ? clip(log10p(raw) - log10p(existing), -6, 8) : 0,
      ...RULE_PACKS.map((p) => (p === pack ? 1 : 0)),
    ];
    rows.push({ x, y });
  }
  return rows;
}

export interface UnitModel {
  net: SoftmaxNet;
  acc: number;
  paramCount: number;
  checksum: string;
  trainMs: number;
}

let cached: UnitModel | null = null;

export function trainUnitNet(seed = UNIT_SEED): UnitModel {
  const t0 = performance.now();
  const rng = mulberry32(seed);
  const rows = synth(seed);
  const idx = rows.map((_, i) => i);
  shuffleInPlace(rng, idx);
  const nTrain = Math.floor(idx.length * 0.85);
  const trainIdx = idx.slice(0, nTrain);
  const testIdx = idx.slice(nTrain);
  const xs = rows.map((r) => Float32Array.from(r.x));
  const ys = rows.map((r) => r.y);
  const net = makeSoftmax(rng, UNIT_IN, HID, K);
  const BATCH = 32;
  const EPOCHS = 16;
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    const lr = 0.22 * (1 - epoch / EPOCHS) + 0.04;
    for (let b = 0; b < nBatches; b++) {
      softmaxSgdStep(net, xs, ys, order.slice(b * BATCH, (b + 1) * BATCH), lr, 1e-4);
    }
  }
  let hit = 0;
  for (const i of testIdx) {
    if (softmaxArgmax(softmaxForward(net, xs[i]!).p) === ys[i]) hit++;
  }
  cached = {
    net,
    acc: hit / Math.max(testIdx.length, 1),
    paramCount: softmaxParamCount(net),
    checksum: checksum([net.w1, net.b1, net.w2, net.b2]),
    trainMs: performance.now() - t0,
  };
  return cached;
}

export function getUnitNet(): UnitModel {
  return cached ?? trainUnitNet();
}

export interface UnitGuess {
  unit: UnitId;
  p: number;
  million: number;
  explicit: boolean;
  features: number[];
}

export function toMillion(raw: number, unit: UnitId): number {
  return raw * UNIT_TO_MILLION[unit];
}

export function guessUnit(
  issuer: Issuer,
  raw: number,
  existingMillion = 0,
  explicit?: UnitId | null,
): UnitGuess {
  if (explicit) {
    return {
      unit: explicit,
      p: 1,
      million: toMillion(raw, explicit),
      explicit: true,
      features: [],
    };
  }
  const mdl = getUnitNet();
  const features = unitFeatures(issuer, raw, existingMillion);
  const { p } = softmaxForward(mdl.net, Float32Array.from(features));
  const i = softmaxArgmax(p);
  const unit = UNIT_IDS[i]!;
  return { unit, p: p[i]!, million: toMillion(raw, unit), explicit: false, features };
}

export function ensureUnitNet() {
  return getUnitNet();
}
