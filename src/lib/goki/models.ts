import { ensureAllClosers, ensureCloser } from "./closer-engine";
import { ensureEstimateNets, getEclNet, getFvNet, getDdaNet, getBuybackNet, getSbcNet, getClNet, scoreEcl, scoreFv, scoreDda, scoreBuyback, scoreSbc, scoreDeferred } from "./estimate-net";
import { ensureCompleteNet, getCompleteNet, scoreComplete, COMPLETE_IN, COMPLETE_SLOTS } from "./complete-net";
import { ensureMapNet, getMapNet, MAP_IN, MAP_TARGETS } from "./map-net";
import { ensureMateriality, getMateriality, MAT_IN } from "./materiality-net";
import { ensureUnitNet, getUnitNet, UNIT_IN } from "./unit-net";
import { getPackNet, guessPack } from "./pack-net";
import type { CompletenessScore, EstimateScore, Issuer, Metrics, PackGuess, RulePack } from "./types";
import { PACK_LABEL } from "./types";

export interface ModelCard {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  arch: string;
  inDim: number;
  params: number;
  metricLabel: string;
  metric: number;
  checksum: string;
  trainMs: number;
  ocaml: string;
}

export interface ModelCatalog {
  cards: ModelCard[];
  closers: { pack: RulePack; metrics: Metrics }[];
}

export function ensureAllModels(): ModelCatalog {
  const closers = ensureAllClosers();
  const packNet = getPackNet();
  const { ecl, fv, dda, buyback, sbc, deferred } = ensureEstimateNets();
  const complete = ensureCompleteNet();
  const mapNet = ensureMapNet();
  const materiality = ensureMateriality();
  const unitNet = ensureUnitNet();
  const cards: ModelCard[] = [
    {
      id: "map-net",
      name: "Map-Net",
      nameEn: "line-item mapper",
      role: "中英行项目名的关键词 + 规则包 + 报表位置 → 规范科目。判中的槽可以写入底稿。",
      arch: `${MAP_IN} → 40 ReLU → ${MAP_TARGETS.length} softmax`,
      inDim: MAP_IN,
      params: mapNet.paramCount,
      metricLabel: "HK acc",
      metric: mapNet.hkAcc,
      checksum: mapNet.checksum,
      trainMs: mapNet.trainMs,
      ocaml: "ocaml/bin/map_net.ml",
    },
    {
      id: "materiality-net",
      name: "Materiality-Net",
      nameEn: "pass / review / exception",
      role: "咨询分诊：主表残差 × 净利润/资产 → 过 / 复核 / 例外。不进门禁。阻断只看未解释残差与映射缺项。",
      arch: `${MAT_IN} → 16 ReLU → 3 softmax`,
      inDim: MAT_IN,
      params: materiality.paramCount,
      metricLabel: "test acc",
      metric: materiality.acc,
      checksum: materiality.checksum,
      trainMs: materiality.trainMs,
      ocaml: "ocaml/bin/materiality.ml",
    },
    {
      id: "unit-net",
      name: "Unit-Net",
      nameEn: "thousand / million / yi",
      role: "贴入金额相对资产、净利润的数量级 → 千元 / 百万 / 亿。写明万元或亿的以字面为准。",
      arch: `${UNIT_IN} → 12 ReLU → 3 softmax`,
      inDim: UNIT_IN,
      params: unitNet.paramCount,
      metricLabel: "test acc",
      metric: unitNet.acc,
      checksum: unitNet.checksum,
      trainMs: unitNet.trainMs,
      ocaml: "ocaml/bin/unit_net.ml",
    },
    {
      id: "pack-net",
      name: "Pack-Net",
      nameEn: "industry router",
      role: "用 12 个结构比率判断该走哪个规则包。不读年报文字。",
      arch: "12 → 24 ReLU → 7 softmax",
      inDim: 12,
      params: packNet.paramCount,
      metricLabel: "test acc",
      metric: packNet.acc,
      checksum: packNet.checksum,
      trainMs: packNet.trainMs,
      ocaml: "ocaml/bin/pack_net.ml",
    },
    ...closers.map((c) => ({
      id: `closer-${c.pack}`,
      name: `${PACK_LABEL[c.pack]}闭合头`,
      nameEn: `${c.pack} closer`,
      role: `16 维附注残差 → 开口概率。${PACK_LABEL[c.pack]}包专用槽位。`,
      arch: "16 → 32 ReLU → 16 ReLU → 1 sigmoid",
      inDim: 16,
      params: c.metrics.paramCount,
      metricLabel: "test AUC",
      metric: c.metrics.testAuc,
      checksum: c.metrics.weightChecksum,
      trainMs: c.metrics.trainMs,
      ocaml: c.pack === "generic" ? "ocaml/bin/closer.ml" : `ocaml/bin/${c.pack}_closer.ml`,
    })),
    {
      id: "complete-net",
      name: "Completeness-Net",
      nameEn: "missing-note slots",
      role: "包 one-hot + 字段是否为空 + 附注残差 → 漏填了哪几项。空且恒等仍闭合的，不当漏填。",
      arch: `${COMPLETE_IN} → 24 ReLU → ${COMPLETE_SLOTS.length} sigmoid`,
      inDim: COMPLETE_IN,
      params: complete.paramCount,
      metricLabel: "micro AUC",
      metric: complete.auc,
      checksum: complete.checksum,
      trainMs: complete.trainMs,
      ocaml: "ocaml/bin/complete_net.ml",
    },
    {
      id: "ecl-net",
      name: "Estimate-Net ECL",
      nameEn: "coverage outlier",
      role: "覆盖率、计提、核销、贷存比对照同业。偏离 1.2% 邻域才质疑模型更新。",
      arch: "8 → 16 ReLU → 8 ReLU → 1 sigmoid",
      inDim: 8,
      params: ecl.paramCount,
      metricLabel: "test AUC",
      metric: ecl.auc,
      checksum: ecl.checksum,
      trainMs: ecl.trainMs,
      ocaml: "ocaml/bin/estimate_ecl.ml",
    },
    {
      id: "fv-net",
      name: "Estimate-Net 公允",
      nameEn: "IP fair-value outlier",
      role: "投资物业公允变动相对存量。新鸿基 2025 −0.7% 是市况，不是估值造假。",
      arch: "8 → 16 ReLU → 8 ReLU → 1 sigmoid",
      inDim: 8,
      params: fv.paramCount,
      metricLabel: "test AUC",
      metric: fv.auc,
      checksum: fv.checksum,
      trainMs: fv.trainMs,
      ocaml: "ocaml/bin/estimate_fv.ml",
    },
    {
      id: "dda-net",
      name: "Estimate-Net 折耗",
      nameEn: "DD&A rate outlier",
      role: "本年折旧÷PPE 对照上年。中海油约 12%、中电约 6%、中移动约 27%（含摊销）是各行业常态。",
      arch: "8 → 16 ReLU → 8 ReLU → 1 sigmoid",
      inDim: 8,
      params: dda.paramCount,
      metricLabel: "test AUC",
      metric: dda.auc,
      checksum: dda.checksum,
      trainMs: dda.trainMs,
      ocaml: "ocaml/bin/estimate_dda.ml",
    },
    {
      id: "buyback-net",
      name: "Estimate-Net 回购",
      nameEn: "buyback / NI outlier",
      role: "回购占盈利。腾讯 2025 约 32% 落在平台常态，接近或超过盈利才复核。",
      arch: "8 → 16 ReLU → 8 ReLU → 1 sigmoid",
      inDim: 8,
      params: buyback.paramCount,
      metricLabel: "test AUC",
      metric: buyback.auc,
      checksum: buyback.checksum,
      trainMs: buyback.trainMs,
      ocaml: "ocaml/bin/estimate_buyback.ml",
    },
    {
      id: "sbc-net",
      name: "Estimate-Net 股份支付",
      nameEn: "SBC / opex outlier",
      role: "权益结算股份支付占期间费用。腾讯约 14%、美团约 5% 是平台常态，超过 20% 才复核。",
      arch: "8 → 16 ReLU → 8 ReLU → 1 sigmoid",
      inDim: 8,
      params: sbc.paramCount,
      metricLabel: "test AUC",
      metric: sbc.auc,
      checksum: sbc.checksum,
      trainMs: sbc.trainMs,
      ocaml: "ocaml/bin/estimate_sbc.ml",
    },
    {
      id: "cl-net",
      name: "Estimate-Net 递延",
      nameEn: "contract liability / revenue",
      role: "合同负债÷收入。腾讯游戏点券约 13%、美团约 1.6%。过高才质疑提前确认。",
      arch: "8 → 16 ReLU → 8 ReLU → 1 sigmoid",
      inDim: 8,
      params: deferred.paramCount,
      metricLabel: "test AUC",
      metric: deferred.auc,
      checksum: deferred.checksum,
      trainMs: deferred.trainMs,
      ocaml: "ocaml/bin/estimate_cl.ml",
    },
  ];
  return { cards, closers };
}

export function warmupIssuerHeads(issuer: Issuer) {
  ensureCloser(issuer.pack ?? "generic");
  getPackNet();
  getCompleteNet();
  getMapNet();
  getDdaNet();
  getBuybackNet();
  getSbcNet();
  getClNet();
}

export function estimatesFor(issuer: Issuer): {
  ecl: EstimateScore | null;
  fv: EstimateScore | null;
  dda: EstimateScore | null;
  buyback: EstimateScore | null;
  sbc: EstimateScore | null;
  deferred: EstimateScore | null;
  pack: PackGuess;
  complete: CompletenessScore;
} {
  return {
    ecl: scoreEcl(issuer),
    fv: scoreFv(issuer),
    dda: scoreDda(issuer),
    buyback: scoreBuyback(issuer),
    sbc: scoreSbc(issuer),
    deferred: scoreDeferred(issuer),
    pack: guessPack(issuer),
    complete: scoreComplete(issuer),
  };
}

export { guessPack, scoreEcl, scoreFv, scoreDda, scoreBuyback, scoreSbc, scoreDeferred, scoreComplete, getEclNet, getFvNet, getDdaNet, getBuybackNet, getSbcNet, getClNet, getPackNet, getCompleteNet, getMapNet };
