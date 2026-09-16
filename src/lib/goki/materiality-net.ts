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
import type { Issuer, RuleResult } from "./types";
import { RULE_PACKS } from "./types";

export const MAT_SEED = 61;
export const MAT_BANDS = ["pass", "review", "exception"] as const;
export type MatBand = (typeof MAT_BANDS)[number];

const K = 3;
const HID = 16;
const PACK_N = RULE_PACKS.length;
export const MAT_IN = 7 + PACK_N;

export const MAT_NAMES = [
  "log|resid|",
  "|rel|",
  "log scale",
  "|resid|/|NI|",
  "|resid|/A",
  "analytic",
  "hard",
  ...RULE_PACKS.map((p) => `pack:${p}`),
];

function nz(n: number, f = 1): number {
  return Math.abs(n) < f ? f : n;
}

export function isHardRule(ruleId: string): boolean {
  return ruleId === "r0" || ruleId === "r3";
}

export function matFeatures(issuer: Issuer, r: RuleResult): number[] {
  const ni = nz(Math.abs(issuer.curr.ni), 1);
  const assets = nz(totalAssets(issuer.curr), 1);
  const pack = packOf(issuer);
  return [
    Math.log1p(Math.abs(r.residual)),
    Math.min(Math.abs(r.rel), 5),
    Math.log1p(Math.abs(r.scale)),
    Math.abs(r.residual) / ni,
    Math.abs(r.residual) / assets,
    r.kind === "analytic" ? 1 : 0,
    isHardRule(r.ruleId) ? 1 : 0,
    ...RULE_PACKS.map((p) => (p === pack ? 1 : 0)),
  ];
}

function labelOf(rel: number, analytic: boolean, hard: boolean): number {
  const a = Math.abs(rel);
  if (hard) return a < 0.005 ? 0 : 2;
  if (analytic) return a < 0.12 ? 0 : 1;
  if (a < 0.02) return 0;
  if (a < 0.15) return 1;
  return 2;
}

function synth(seed: number): { x: number[]; y: number }[] {
  const rng = mulberry32(seed);
  const rows: { x: number[]; y: number }[] = [];
  for (let i = 0; i < 3600; i++) {
    const analytic = rng() < 0.22;
    const hard = !analytic && rng() < 0.18;
    const u = rng();
    const rel = hard
      ? u < 0.6
        ? rng() * 0.004
        : 0.01 + rng() * 0.08
      : analytic
        ? u < 0.7
          ? rng() * 0.1
          : 0.13 + rng() * 0.4
        : u < 0.45
          ? rng() * 0.018
          : u < 0.75
            ? 0.022 + rng() * 0.12
            : 0.16 + rng() * 0.5;
    const scale = 1e4 * Math.exp(rng() * 8);
    const residual = rel * scale * (rng() < 0.5 ? 1 : -1);
    const ni = scale * (0.4 + rng());
    const assets = ni * (8 + rng() * 20);
    const pack = RULE_PACKS[Math.floor(rng() * PACK_N)]!;
    const x = [
      Math.log1p(Math.abs(residual)),
      Math.min(Math.abs(rel), 5),
      Math.log1p(Math.abs(scale)),
      Math.abs(residual) / nz(ni),
      Math.abs(residual) / nz(assets),
      analytic ? 1 : 0,
      hard ? 1 : 0,
      ...RULE_PACKS.map((p) => (p === pack ? 1 : 0)),
    ];
    rows.push({ x, y: labelOf(rel, analytic, hard) });
  }
  return rows;
}

export interface MatModel {
  net: SoftmaxNet;
  acc: number;
  paramCount: number;
  checksum: string;
  trainMs: number;
}

let cached: MatModel | null = null;

export function trainMateriality(seed = MAT_SEED): MatModel {
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
  const net = makeSoftmax(rng, MAT_IN, HID, K);
  const BATCH = 32;
  const EPOCHS = 18;
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    const lr = 0.2 * (1 - epoch / EPOCHS) + 0.04;
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

export function getMateriality(): MatModel {
  return cached ?? trainMateriality();
}

export function scoreRuleBand(issuer: Issuer, r: RuleResult): { band: MatBand; p: number; features: number[] } {
  if (r.skipped) return { band: "pass", p: 1, features: [] };
  const mdl = getMateriality();
  const features = matFeatures(issuer, r);
  const { p } = softmaxForward(mdl.net, Float32Array.from(features));
  const i = softmaxArgmax(p);
  return { band: MAT_BANDS[i]!, p: p[i]!, features };
}

const RANK: Record<MatBand, number> = { pass: 0, review: 1, exception: 2 };

export function bandIssuer(issuer: Issuer, main: RuleResult[]): MatBand {
  let worst: MatBand = "pass";
  for (const r of main) {
    if (r.skipped) continue;
    const { band } = scoreRuleBand(issuer, r);
    if (RANK[band] > RANK[worst]) worst = band;
  }
  return worst;
}

export function ensureMateriality() {
  return getMateriality();
}
