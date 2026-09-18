import {
  checksum,
  makeSoftmax,
  softmaxArgmax,
  softmaxForward,
  softmaxParamCount,
  softmaxSgdStep,
  type SoftmaxNet,
} from "./nn";
import { esgSet, type EsgCheck, type EsgStatus } from "./esg";
import { mulberry32, shuffleInPlace } from "./rng";
import type { Issuer } from "./types";

export const ESG_NET_SEED = 71;
export const ESG_NET_LABELS = ["hold", "not_ready", "files_ok"] as const;
export type EsgNetLabel = (typeof ESG_NET_LABELS)[number];

const STATUSES: EsgStatus[] = ["pass", "missing", "mismatch", "pending", "unmapped"];
const N_CHECK = 12;
export const ESG_NET_IN = N_CHECK * STATUSES.length;
const HID = 16;
const K = 3;

function encode(statuses: EsgStatus[]): number[] {
  const x = new Array<number>(ESG_NET_IN).fill(0);
  for (let i = 0; i < N_CHECK; i++) {
    const s = statuses[i] ?? "pending";
    const j = STATUSES.indexOf(s);
    x[i * STATUSES.length + (j < 0 ? 3 : j)] = 1;
  }
  return x;
}

export function esgNetFeatures(checks: EsgCheck[]): number[] {
  const statuses = checks.slice(0, N_CHECK).map((c) => c.status);
  while (statuses.length < N_CHECK) statuses.push("pending");
  return encode(statuses);
}

export function esgNetTruth(checks: EsgCheck[]): EsgNetLabel {
  if (checks.some((c) => c.status === "missing" || c.status === "mismatch")) return "hold";
  if (checks.some((c) => c.status === "unmapped" || c.status === "pending")) return "not_ready";
  return "files_ok";
}

function labelIndex(l: EsgNetLabel): number {
  return ESG_NET_LABELS.indexOf(l);
}

/** Synthetic catalogs. Real filings never enter training. */
function synth(seed: number): { x: number[]; y: number }[] {
  const rng = mulberry32(seed);
  const rows: { x: number[]; y: number }[] = [];
  for (let i = 0; i < 2800; i++) {
    const mode = rng();
    const s: EsgStatus[] = new Array(N_CHECK).fill("unmapped");
    if (mode < 0.28) {
      s[0] = rng() < 0.5 ? "pending" : "missing";
      s[1] = s[0] === "pending" ? "pending" : rng() < 0.6 ? "missing" : "pass";
      s[2] = "pending";
      s[3] = "pending";
      s[4] = "pending";
    } else if (mode < 0.55) {
      s[0] = "pass";
      s[1] = rng() < 0.55 ? "missing" : "pass";
      s[2] = rng() < 0.3 ? "mismatch" : "pass";
      s[3] = rng() < 0.15 ? "mismatch" : "pass";
      s[4] = rng() < 0.2 ? "pending" : "pass";
    } else {
      s[0] = "pass";
      s[1] = "pass";
      s[2] = "pass";
      s[3] = "pass";
      s[4] = rng() < 0.25 ? "pending" : "pass";
      s[11] = rng() < 0.4 ? "pass" : "unmapped";
    }
    const x = encode(s);
    const fake: EsgCheck[] = s.map((status, idx) => ({
      id: `E${String(idx + 1).padStart(2, "0")}`,
      group: "file",
      label: "",
      status,
      note: "",
      files: [],
    }));
    rows.push({ x, y: labelIndex(esgNetTruth(fake)) });
  }
  return rows;
}

export interface EsgNetModel {
  net: SoftmaxNet;
  acc: number;
  paramCount: number;
  checksum: string;
  trainMs: number;
  nTrain: number;
  seed: number;
}

let cached: EsgNetModel | null = null;

export function trainEsgNet(seed = ESG_NET_SEED): EsgNetModel {
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
  const net = makeSoftmax(rng, ESG_NET_IN, HID, K);
  const BATCH = 32;
  const EPOCHS = 16;
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    const lr = 0.18 * (1 - epoch / EPOCHS) + 0.04;
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
    nTrain: trainIdx.length,
    seed,
  };
  return cached;
}

export function getEsgNet(): EsgNetModel {
  return cached ?? trainEsgNet();
}

export function scoreEsgNet(issuer: Issuer): { label: EsgNetLabel; p: number; truth: EsgNetLabel; ok: boolean } {
  const model = getEsgNet();
  const checks = esgSet(issuer);
  const truth = esgNetTruth(checks);
  const p = softmaxForward(model.net, esgNetFeatures(checks)).p;
  const pred = ESG_NET_LABELS[softmaxArgmax(p)]!;
  return { label: pred, p: p[softmaxArgmax(p)]!, truth, ok: pred === truth };
}
