import {
  checksum,
  makeSoftmax,
  softmaxArgmax,
  softmaxForward,
  softmaxParamCount,
  softmaxSgdStep,
  type SoftmaxNet,
} from "./nn";
import { FILINGS, type FilingKind } from "./filings";
import { mulberry32, shuffleInPlace } from "./rng";

export const TITLE_NET_SEED = 73;
export const TITLE_KINDS = ["annual_report", "annual_results", "esg", "clarification"] as const;
export type TitleKind = (typeof TITLE_KINDS)[number];

export const TITLE_LEXICON = [
  "annual report",
  "年报",
  "年報",
  "accounts",
  "年度報告",
  "results",
  "業績",
  "业绩",
  "announcement",
  "esg",
  "sustainability",
  "可持续",
  "可持續",
  "環境、社會",
  "environmental, social",
  "governance",
  "clarif",
  "澄清",
  "in annual report",
] as const;

export const TITLE_NET_IN = TITLE_LEXICON.length + 4;
const HID = 12;
const K = TITLE_KINDS.length;

export function titleFeatures(title: string, filename: string): number[] {
  const t = `${title} ${filename}`.toLowerCase();
  const hits = TITLE_LEXICON.map((w) => (t.includes(w.toLowerCase()) ? 1 : 0));
  const zh = /[\u4e00-\u9fff]/.test(title) ? 1 : 0;
  const en = /[a-z]/i.test(title) ? 1 : 0;
  const stamped = /\d{6,8}/.test(filename) ? 1 : 0;
  const esgAndAr =
    /esg|sustainability|环境|環境|可持续|管治/.test(t) && /annual report|年报|年報/.test(t) ? 1 : 0;
  return [...hits, zh, en, stamped, esgAndAr];
}

const TEMPLATES: Record<TitleKind, string[]> = {
  annual_report: [
    "Annual Report 2025",
    "2025年報",
    "2025 Annual Report and Accounts",
    "二零二五年年报",
    "年度報告 2025",
  ],
  annual_results: [
    "Annual Results Announcement",
    "2025年度業績公告",
    "Final Results for the year ended 31 December 2025",
    "全年业绩公告",
  ],
  esg: [
    "Environmental, Social and Governance Report 2025",
    "2025年可持續發展報告",
    "ESG Report",
    "Sustainability Report 2025",
    "環境、社會及管治報告",
    "ENVIRONMENTAL, SOCIAL AND GOVERNANCE REPORT (in Annual Report 2025)",
    "ESG Report (in Annual Report)",
  ],
  clarification: [
    "Clarification Announcement",
    "澄清公告",
    "Clarification in relation to media reports",
  ],
};

function synth(seed: number): { x: number[]; y: number }[] {
  const rng = mulberry32(seed);
  const rows: { x: number[]; y: number }[] = [];
  for (let i = 0; i < 2200; i++) {
    const kind = TITLE_KINDS[Math.floor(rng() * K)]!;
    const base = TEMPLATES[kind][Math.floor(rng() * TEMPLATES[kind].length)]!;
    const noise = rng() < 0.25 ? ` (${Math.floor(rng() * 9)})` : "";
    const title = rng() < 0.1 ? base.toLowerCase() : base + noise;
    const filename =
      rng() < 0.6 ? `26${String(100 + Math.floor(rng() * 800)).padStart(4, "0")}_${kind.slice(0, 2)}.pdf` : "";
    rows.push({ x: titleFeatures(title, filename), y: TITLE_KINDS.indexOf(kind) });
  }
  return rows;
}

export interface TitleNetModel {
  net: SoftmaxNet;
  acc: number;
  paramCount: number;
  checksum: string;
  trainMs: number;
  nTrain: number;
  seed: number;
}

let cached: TitleNetModel | null = null;

export function trainTitleNet(seed = TITLE_NET_SEED): TitleNetModel {
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
  const net = makeSoftmax(rng, TITLE_NET_IN, HID, K);
  const BATCH = 32;
  const EPOCHS = 14;
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    const lr = 0.2 * (1 - epoch / EPOCHS) + 0.05;
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

export function getTitleNet(): TitleNetModel {
  return cached ?? trainTitleNet();
}

export function scoreTitle(title: string, filename: string, kind?: FilingKind): { pred: TitleKind; p: number; ok?: boolean } {
  const model = getTitleNet();
  const out = softmaxForward(model.net, titleFeatures(title, filename));
  const i = softmaxArgmax(out.p);
  const pred = TITLE_KINDS[i]!;
  return { pred, p: out.p[i]!, ok: kind ? pred === kind : undefined };
}

export function titleHoldout(): { n: number; hit: number; acc: number; falseKind: number } {
  getTitleNet();
  let hit = 0;
  let falseKind = 0;
  for (const f of FILINGS) {
    const s = scoreTitle(f.essTitle, f.filename, f.kind);
    if (s.ok) hit++;
    else if (f.kind === "esg" && s.pred === "annual_report") falseKind++;
  }
  const n = FILINGS.length;
  return { n, hit, acc: hit / Math.max(n, 1), falseKind };
}
