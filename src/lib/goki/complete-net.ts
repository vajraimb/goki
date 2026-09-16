import {
  checksum,
  makeSoftmax,
  multiBceSgdStep,
  sigmoidKForward,
  softmaxParamCount,
  type SoftmaxNet,
} from "./nn";
import { mulberry32, shuffleInPlace } from "./rng";
import { generateClosedPackIssuers } from "./closer-synth";
import { mergeNotes } from "./note-rules";
import { noteRulesFor, packNoteFeatures, packOf } from "./packs";
import type { CompletenessHit, CompletenessScore, Issuer, NoteBooks, RulePack } from "./types";
import { RULE_PACKS } from "./types";

export const COMPLETE_SEED = 47;

export interface CompleteSlot {
  id: string;
  label: string;
  packs: RulePack[];
  keys: (keyof NoteBooks)[];
  related: string[];
  kind: "identity" | "expected";
}

export const COMPLETE_SLOTS: CompleteSlot[] = [
  { id: "ecl", label: "ECL 准备", packs: ["bank"], keys: ["ecl"], related: ["B01"], kind: "identity" },
  { id: "loans", label: "贷款总额", packs: ["bank"], keys: ["loansGross"], related: ["B02"], kind: "identity" },
  { id: "deposits", label: "客户存款", packs: ["bank"], keys: ["deposits"], related: ["B03"], kind: "expected" },
  { id: "ip", label: "投资物业存量", packs: ["realty"], keys: ["ip"], related: ["P01"], kind: "identity" },
  { id: "ip_roll", label: "投资物业滚存", packs: ["realty"], keys: ["ipAdd", "ipTransfer"], related: ["P01"], kind: "identity" },
  { id: "dev", label: "开发成本", packs: ["realty"], keys: ["devCost"], related: ["P02"], kind: "identity" },
  { id: "ppe_add", label: "PPE 购置", packs: ["energy", "generic", "platform", "telco"], keys: ["ppeAdd"], related: ["E01", "N02", "C01"], kind: "identity" },
  { id: "aro", label: "弃置准备", packs: ["energy"], keys: ["prov"], related: ["E02"], kind: "identity" },
  { id: "aro_charge", label: "弃置新井/修订", packs: ["energy"], keys: ["provCharge"], related: ["E02"], kind: "identity" },
  { id: "margin", label: "现金四段", packs: ["exchange"], keys: ["ownCash", "marginCash"], related: ["X01"], kind: "identity" },
  { id: "st_invest", label: "定期/理财", packs: ["platform", "telco"], keys: ["stInvest"], related: ["T01", "C06"], kind: "expected" },
  { id: "cl", label: "合同负债", packs: ["platform", "telco"], keys: ["cl"], related: ["T03", "C04"], kind: "identity" },
  { id: "cl_add", label: "本年预收", packs: ["platform", "telco"], keys: ["clAdd"], related: ["T03", "C04"], kind: "identity" },
  { id: "sbp", label: "股份支付", packs: ["platform"], keys: ["sbp"], related: ["T04"], kind: "expected" },
  { id: "cip", label: "在建工程", packs: ["telco"], keys: ["cip"], related: ["C01"], kind: "identity" },
  { id: "ca", label: "合同资产", packs: ["telco"], keys: ["contractAsset"], related: ["C05"], kind: "expected" },
  { id: "intan_roll", label: "无形购置/摊销", packs: ["telco"], keys: ["intanAdd", "intanAmort"], related: ["C02"], kind: "identity" },
  { id: "equity", label: "回购/OCI/少数股东", packs: [...RULE_PACKS], keys: ["buyback", "oci", "nci", "otherEq"], related: ["N01"], kind: "identity" },
];

const K = COMPLETE_SLOTS.length;
const HID = 24;
export const COMPLETE_IN = RULE_PACKS.length + K + 8;
const IN = COMPLETE_IN;

export const COMPLETE_FEAT_NAMES = [
  ...RULE_PACKS.map((p) => `pack_${p}`),
  ...COMPLETE_SLOTS.map((s) => `empty_${s.id}`),
  ...Array.from({ length: 8 }, (_, i) => `rel_${i}`),
];

function nzAbs(n: number): boolean {
  return Math.abs(n) < 0.5;
}

export function slotEmpty(notes: NoteBooks, slot: CompleteSlot): boolean {
  return slot.keys.every((k) => nzAbs(notes[k]));
}

function slotsFor(pack: RulePack): CompleteSlot[] {
  return COMPLETE_SLOTS.filter((s) => s.packs.includes(pack));
}

function relatedRel(issuer: Issuer, slot: CompleteSlot): number {
  const pack = packOf(issuer);
  const { rules } = packNoteFeatures(issuer);
  const defs = noteRulesFor(pack);
  for (const code of slot.related) {
    const i = defs.findIndex((d) => d.code === code);
    if (i >= 0) return rules[i]?.rel ?? 0;
  }
  return 0;
}

export function completeFeatures(issuer: Issuer): number[] {
  const pack = packOf(issuer);
  const notes = mergeNotes(issuer.currNotes);
  const { rules } = packNoteFeatures(issuer);
  const oh = RULE_PACKS.map((p) => (p === pack ? 1 : 0));
  const empty = COMPLETE_SLOTS.map((s) => (slotEmpty(notes, s) ? 1 : 0));
  const rels: number[] = [];
  for (let i = 0; i < 8; i++) {
    const r = rules[i];
    rels.push(r && !r.skipped ? Math.max(-1, Math.min(1, r.rel)) : 0);
  }
  return [...oh, ...empty, ...rels];
}

function dropSlot(notes: NoteBooks, slot: CompleteSlot): NoteBooks {
  const n = { ...notes };
  for (const k of slot.keys) n[k] = 0;
  return n;
}

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

export interface CompleteModel {
  net: SoftmaxNet;
  auc: number;
  slotAuc: number[];
  paramCount: number;
  checksum: string;
  trainMs: number;
  nTrain: number;
}

function generateRows(seed: number): { x: number[]; y: number[] }[] {
  const rng = mulberry32(seed);
  const rows: { x: number[]; y: number[] }[] = [];
  for (let p = 0; p < RULE_PACKS.length; p++) {
    const pack = RULE_PACKS[p]!;
    const issuers = generateClosedPackIssuers(pack, seed + p * 13, 80);
    const packOnly = slotsFor(pack).filter((s) => s.id !== "equity");
    const eq = COMPLETE_SLOTS.find((s) => s.id === "equity")!;
    const eqIdx = COMPLETE_SLOTS.indexOf(eq);
    for (const iss of issuers) {
      const filled = mergeNotes(iss.currNotes);
      const push = (notes: NoteBooks, y: number[]) => {
        rows.push({ x: completeFeatures({ ...iss, currNotes: notes }), y });
      };
      push(filled, new Array(K).fill(0));
      if (rng() < 0.42) {
        const y = new Array(K).fill(0);
        y[eqIdx] = 1;
        push(dropSlot(filled, eq), y);
      }
      for (const s of packOnly) {
        if (rng() >= 0.6) continue;
        const y = new Array(K).fill(0);
        y[COMPLETE_SLOTS.indexOf(s)] = 1;
        push(dropSlot(filled, s), y);
      }
      if (rng() < 0.12) {
        push({ ...filled, sbp: 0, ppeImpair: 0, rouTerm: 0, eclRecover: 0 }, new Array(K).fill(0));
      }
    }
  }
  return rows;
}

let cached: CompleteModel | null = null;

export function trainCompleteNet(seed = COMPLETE_SEED): CompleteModel {
  const t0 = performance.now();
  const rng = mulberry32(seed);
  const rows = generateRows(seed);
  const idx = rows.map((_, i) => i);
  shuffleInPlace(rng, idx);
  const nTrain = Math.floor(idx.length * 0.82);
  const trainIdx = idx.slice(0, nTrain);
  const testIdx = idx.slice(nTrain);
  const xs = rows.map((r) => Float32Array.from(r.x));
  const ys = rows.map((r) => r.y);
  const net = makeSoftmax(rng, IN, HID, K);
  const BATCH = 32;
  const EPOCHS = 18;
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    const lr = 0.16 * (1 - epoch / EPOCHS) + 0.02;
    for (let b = 0; b < nBatches; b++) {
      multiBceSgdStep(net, xs, ys, order.slice(b * BATCH, (b + 1) * BATCH), lr, 1e-4);
    }
  }
  const slotScores: number[][] = Array.from({ length: K }, () => []);
  const slotLabels: number[][] = Array.from({ length: K }, () => []);
  const microS: number[] = [];
  const microY: number[] = [];
  for (const i of testIdx) {
    const { p } = sigmoidKForward(net, xs[i]!);
    for (let k = 0; k < K; k++) {
      slotScores[k]!.push(p[k]!);
      slotLabels[k]!.push(ys[i]![k]!);
      microS.push(p[k]!);
      microY.push(ys[i]![k]!);
    }
  }
  const slotAuc = slotScores.map((s, k) => rocAuc(s, slotLabels[k]!));
  cached = {
    net,
    auc: rocAuc(microS, microY),
    slotAuc,
    paramCount: softmaxParamCount(net),
    checksum: checksum([net.w1, net.b1, net.w2, net.b2]),
    trainMs: performance.now() - t0,
    nTrain: trainIdx.length,
  };
  return cached;
}

export function getCompleteNet(): CompleteModel {
  return cached ?? trainCompleteNet();
}

function bandSlot(slot: CompleteSlot, p: number, empty: boolean, rel: number): CompletenessHit["band"] {
  if (!empty) return "pass";
  if (slot.kind === "expected") {
    if (p >= 0.55) return "exception";
    if (p >= 0.35) return "review";
    return "pass";
  }
  const ar = Math.abs(rel);
  if (ar >= 0.05) return "exception";
  if (ar >= 0.02) return "review";
  return "pass";
}

export function scoreComplete(issuer: Issuer): CompletenessScore {
  const mdl = getCompleteNet();
  const pack = packOf(issuer);
  const defs = noteRulesFor(pack);
  const notes = mergeNotes(issuer.currNotes);
  const x = completeFeatures(issuer);
  const { p } = sigmoidKForward(mdl.net, x);
  const applicable = new Set(slotsFor(pack).map((s) => s.id));
  const hits: CompletenessHit[] = [];
  for (let k = 0; k < K; k++) {
    const slot = COMPLETE_SLOTS[k]!;
    if (!applicable.has(slot.id)) continue;
    const empty = slotEmpty(notes, slot);
    const rel = relatedRel(issuer, slot);
    const pk = p[k]!;
    const band = bandSlot(slot, pk, empty, rel);
    const relatedCode = slot.related.find((c) => defs.some((d) => d.code === c)) ?? slot.related[0] ?? "";
    hits.push({
      id: slot.id,
      label: slot.label,
      p: pk,
      empty,
      rel,
      related: relatedCode,
      band,
    });
  }
  const missing = hits.filter((h) => h.band !== "pass");
  const pMissing = missing.length ? Math.max(...missing.map((h) => h.p)) : Math.max(0, ...hits.map((h) => (h.empty ? h.p : 0)));
  let band: CompletenessScore["band"] = "pass";
  if (missing.some((h) => h.band === "exception")) band = "exception";
  else if (missing.length) band = "review";
  return { pMissing, hits, missing, band, features: x };
}

export function ensureCompleteNet() {
  return getCompleteNet();
}
