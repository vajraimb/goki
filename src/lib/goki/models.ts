import { ensureAllClosers, ensureCloser } from "./closer-engine";
import { ensureEstimateNets, getEclNet, getFvNet, scoreEcl, scoreFv } from "./estimate-net";
import { ensureCompleteNet, getCompleteNet, scoreComplete } from "./complete-net";
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
  const { ecl, fv } = ensureEstimateNets();
  const complete = ensureCompleteNet();
  const cards: ModelCard[] = [
    {
      id: "pack-net",
      name: "Pack-Net",
      nameEn: "industry router",
      role: "用 12 个结构比率判断该走哪个规则包。不读年报文字。",
      arch: "12 → 24 ReLU → 6 softmax",
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
      arch: "26 → 24 ReLU → 12 sigmoid",
      inDim: 26,
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
  ];
  return { cards, closers };
}

export function warmupIssuerHeads(issuer: Issuer) {
  ensureCloser(issuer.pack ?? "generic");
  getPackNet();
  getCompleteNet();
}

export function estimatesFor(issuer: Issuer): {
  ecl: EstimateScore | null;
  fv: EstimateScore | null;
  pack: PackGuess;
  complete: CompletenessScore;
} {
  return {
    ecl: scoreEcl(issuer),
    fv: scoreFv(issuer),
    pack: guessPack(issuer),
    complete: scoreComplete(issuer),
  };
}

export { guessPack, scoreEcl, scoreFv, scoreComplete, getEclNet, getFvNet, getPackNet, getCompleteNet };
