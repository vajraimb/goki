import { buildHkIssuers } from "./hk-bluechips";
import { getEsgNet, scoreEsgNet, trainEsgNet } from "./esg-net";
import { FILINGS } from "./filings";
import { getMapNet, trainMapNet } from "./map-net";
import { getMateriality, trainMateriality } from "./materiality-net";
import { getPackNet, guessPack, trainPackNet } from "./pack-net";
import { packOf } from "./packs";
import { getTitleNet, scoreTitle, trainTitleNet } from "./title-net";
import type { DeskDecision } from "./desk";
import { DESK_DECISION_LABEL } from "./desk";
import { getCompleteNet, trainCompleteNet } from "./complete-net";
import { auditModelsLive } from "./model-audit";

export type TrainDecision = DeskDecision;

export interface HoldoutRow {
  id: string;
  label: string;
  truth: string;
  pred: string;
  ok: boolean;
}

export interface HoldoutReport {
  n: number;
  hit: number;
  acc: number;
  falseClear: number;
  rows: HoldoutRow[];
  usable: boolean;
  why: string;
}

export interface TrainedHead {
  checksum: string;
  paramCount: number;
  trainMs: number;
  synthMetric: number;
  synthLabel: string;
  nTrain: number;
  seed: number;
}

export interface TrainSign {
  modelId: string;
  by: string;
  kind: "release" | "ack";
  note: string;
  at: string;
  checksum: string;
}

export interface SpecialistSpec {
  id: string;
  name: string;
  job: string;
  forbid: string;
  desk: "年报" | "ESG" | "共用";
  snapshot: () => TrainedHead;
  retrain: (seed: number) => TrainedHead;
  holdout: () => HoldoutReport;
}

function packHead(): TrainedHead {
  const m = getPackNet();
  return {
    checksum: m.checksum,
    paramCount: m.paramCount,
    trainMs: m.trainMs,
    synthMetric: m.acc,
    synthLabel: "合成 test acc",
    nTrain: m.nTrain,
    seed: 29,
  };
}

function esgHoldout(): HoldoutReport {
  getEsgNet();
  const issuers = buildHkIssuers();
  const rows: HoldoutRow[] = issuers.map((iss) => {
    const s = scoreEsgNet(iss);
    return { id: iss.ticker, label: iss.name, truth: s.truth, pred: s.label, ok: s.ok };
  });
  const hit = rows.filter((r) => r.ok).length;
  const falseClear = rows.filter((r) => r.truth === "hold" && r.pred === "files_ok").length;
  const acc = hit / Math.max(rows.length, 1);
  const usable = acc >= 8 / 11 && falseClear === 0;
  return {
    n: rows.length,
    hit,
    acc,
    falseClear,
    rows,
    usable,
    why: usable
      ? "十一条实报上分诊与目录规则一致，且没有把文件开口判成可发。可上 ESG 咨询带。"
      : falseClear
        ? "有把文件开口判成 files_ok。不得咨询。"
        : `命中 ${hit}/${rows.length}，未达 8/11。继续训练或停用。`,
  };
}

function titleHoldout(): HoldoutReport {
  getTitleNet();
  const rows: HoldoutRow[] = FILINGS.map((f) => {
    const s = scoreTitle(f.essTitle, f.filename, f.kind);
    return {
      id: `${f.ticker}-${f.kind}-${f.lang}`,
      label: f.essTitle.slice(0, 42),
      truth: f.kind,
      pred: s.pred,
      ok: Boolean(s.ok),
    };
  });
  const hit = rows.filter((r) => r.ok).length;
  const falseClear = rows.filter((r) => r.truth === "esg" && r.pred === "annual_report").length;
  const acc = hit / Math.max(rows.length, 1);
  const usable = acc >= 0.85 && falseClear === 0;
  return {
    n: rows.length,
    hit,
    acc,
    falseClear,
    rows,
    usable,
    why: usable
      ? "目录真实标题上种类命中足够，且未把 ESG 判成年报。可提示 ESS 标题，不改目录。"
      : "实报标题命中不够，或把 ESG 判成年报。标题检查继续走正则。",
  };
}

function packHoldout(): HoldoutReport {
  const issuers = buildHkIssuers();
  const rows: HoldoutRow[] = issuers.map((iss) => {
    const g = guessPack(iss);
    const truth = packOf(iss);
    return { id: iss.ticker, label: iss.name, truth, pred: g.pack, ok: g.match };
  });
  const hit = rows.filter((r) => r.ok).length;
  const acc = hit / Math.max(rows.length, 1);
  const usable = acc >= 0.8;
  return {
    n: rows.length,
    hit,
    acc,
    falseClear: 0,
    rows,
    usable,
    why: usable ? "规则包路由可用。发刊台仍以映射表的包为准。" : "实报路由不准，发刊台用映射表的包。",
  };
}

export const SPECIALISTS: SpecialistSpec[] = [
  {
    id: "esg-net",
    name: "ESG-Net",
    job: "把 ESG 检查向量分成：文件开口 / 底稿未齐 / 文件已过。给可持续发展工单排序。",
    forbid: "不填排放、不写董事会声明、不改 esgSet、不进 ESG 门禁。",
    desk: "ESG",
    snapshot: () => {
      const m = getEsgNet();
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.acc,
        synthLabel: "合成 test acc",
        nTrain: m.nTrain,
        seed: m.seed,
      };
    },
    retrain: (seed) => {
      const m = trainEsgNet(seed);
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.acc,
        synthLabel: "合成 test acc",
        nTrain: m.nTrain,
        seed: m.seed,
      };
    },
    holdout: esgHoldout,
  },
  {
    id: "title-net",
    name: "Title-Net",
    job: "从 ESS 标题和文件名判断年报 / 业绩 / ESG / 澄清。提示目录接错种类。",
    forbid: "不改 filings 目录，不凭标题当文件已发布。",
    desk: "共用",
    snapshot: () => {
      const m = getTitleNet();
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.acc,
        synthLabel: "合成 test acc",
        nTrain: m.nTrain,
        seed: m.seed,
      };
    },
    retrain: (seed) => {
      const m = trainTitleNet(seed);
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.acc,
        synthLabel: "合成 test acc",
        nTrain: m.nTrain,
        seed: m.seed,
      };
    },
    holdout: titleHoldout,
  },
  {
    id: "pack-net",
    name: "Pack-Net",
    job: "结构比率 → 规则包。只建议包，不改已指定的包。",
    forbid: "不改恒等公式，不写科目数字。",
    desk: "年报",
    snapshot: () => packHead(),
    retrain: (seed) => {
      const m = trainPackNet(seed);
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.acc,
        synthLabel: "合成 test acc",
        nTrain: m.nTrain,
        seed,
      };
    },
    holdout: packHoldout,
  },
  {
    id: "map-net",
    name: "Map-Net",
    job: "中英行项目名 → 规范科目。判中的槽可以提示财务去映射页写入。",
    forbid: "不自动写入 YearBooks。冲突要人裁定。",
    desk: "年报",
    snapshot: () => {
      const m = getMapNet();
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.hkAcc,
        synthLabel: "HK 持有 acc",
        nTrain: m.nTrain,
        seed: 53,
      };
    },
    retrain: (seed) => {
      const m = trainMapNet(seed);
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.hkAcc,
        synthLabel: "HK 持有 acc",
        nTrain: m.nTrain,
        seed,
      };
    },
    holdout: () => {
      const m = getMapNet();
      const usable = m.hkAcc >= 0.75;
      return {
        n: 0,
        hit: 0,
        acc: m.hkAcc,
        falseClear: 0,
        rows: [],
        usable,
        why: usable ? "港股行项目名持有可用。只提示槽位。" : "持有不够，映射继续走人。",
      };
    },
  },
  {
    id: "complete-net",
    name: "Completeness-Net",
    job: "指出空槽且残差仍开口的附注。只提示缺项。",
    forbid: "不把估计值写入空槽。",
    desk: "年报",
    snapshot: () => {
      const m = getCompleteNet();
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.auc,
        synthLabel: "合成 micro AUC",
        nTrain: m.nTrain,
        seed: 59,
      };
    },
    retrain: (seed) => {
      const m = trainCompleteNet(seed);
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.auc,
        synthLabel: "合成 micro AUC",
        nTrain: m.nTrain,
        seed,
      };
    },
    holdout: () => {
      const live = auditModelsLive();
      const card = live.cards.find((c) => c.id === "complete-net")!;
      return {
        n: live.n,
        hit: 0,
        acc: card.metric,
        falseClear: 0,
        rows: [],
        usable: card.usable,
        why: card.why,
      };
    },
  },
  {
    id: "materiality-net",
    name: "Materiality-Net",
    job: "残差分诊咨询带。历史遗留，训练台默认不得上发刊台。",
    forbid: "永不进门禁。合成准确率不代表可用。",
    desk: "年报",
    snapshot: () => {
      const m = getMateriality();
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.acc,
        synthLabel: "合成 test acc",
        nTrain: 0,
        seed: 61,
      };
    },
    retrain: (seed) => {
      const m = trainMateriality(seed);
      return {
        checksum: m.checksum,
        paramCount: m.paramCount,
        trainMs: m.trainMs,
        synthMetric: m.acc,
        synthLabel: "合成 test acc",
        nTrain: 0,
        seed,
      };
    },
    holdout: () => {
      getMateriality();
      const live = auditModelsLive();
      const card = live.cards.find((c) => c.id === "materiality-net")!;
      return {
        n: live.n,
        hit: Math.round(card.metric * live.n),
        acc: card.metric,
        falseClear: 1,
        rows: [],
        usable: false,
        why: "合成集准确率约一半。发刊台不读咨询带。",
      };
    },
  },
];

export function specOf(id: string): SpecialistSpec {
  return SPECIALISTS.find((s) => s.id === id) ?? SPECIALISTS[0]!;
}

export interface TrainDesk {
  spec: SpecialistSpec;
  head: TrainedHead;
  holdout: HoldoutReport;
  decision: TrainDecision;
  decisionLabel: string;
  decisionNote: string;
  sign?: TrainSign;
  signStale: boolean;
}

export function trainDeskOf(id: string, sign?: TrainSign, trained?: TrainedHead): TrainDesk {
  const spec = specOf(id);
  const head = trained ?? spec.snapshot();
  const holdout = spec.holdout();
  const signStale = Boolean(sign && sign.checksum !== head.checksum);
  const live = signStale ? undefined : sign;
  let decision: TrainDecision;
  let decisionNote: string;
  if (!holdout.usable) {
    decision = "hold";
    decisionNote = holdout.why;
  } else if (!live || live.kind !== "release") {
    decision = "awaiting_sign";
    decisionNote = "持有已过关。方法论负责人签核后，此校验和才能上咨询带。";
  } else {
    decision = "clear";
    decisionNote = "已签核。只咨询，不进年报或 ESG 门禁。";
  }
  return {
    spec,
    head,
    holdout,
    decision,
    decisionLabel: DESK_DECISION_LABEL[decision],
    decisionNote,
    sign: live,
    signStale,
  };
}

export function ensureTrainHeads() {
  getEsgNet();
  getTitleNet();
  getPackNet();
  getMapNet();
  getCompleteNet();
  getMateriality();
}
