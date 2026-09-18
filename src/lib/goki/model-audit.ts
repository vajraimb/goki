import { buildHkIssuers } from "./hk-bluechips";
import { scoreComplete } from "./complete-net";
import { estimatesFor } from "./models";
import { bandIssuer } from "./materiality-net";
import { evaluateMainRules } from "./packs";
import { guessPack } from "./pack-net";
import { evaluateGate, gateToBand } from "./verdict";
import type { Issuer } from "./types";

export interface ModelLiveCard {
  id: string;
  name: string;
  usable: boolean;
  why: string;
  metricLabel: string;
  metric: number;
  detail: string;
}

export interface ModelLiveAudit {
  n: number;
  cards: ModelLiveCard[];
  usableIds: string[];
}

function rate(hit: number, n: number): number {
  return n === 0 ? 0 : hit / n;
}

let cached: ModelLiveAudit | undefined;

export function auditModelsLive(issuers: Issuer[] = buildHkIssuers()): ModelLiveAudit {
  if (cached && issuers.length === cached.n) return cached;

  const n = issuers.length;
  let packHit = 0;
  let matHit = 0;
  let completeTp = 0;
  let completeFp = 0;
  let completeFn = 0;
  let estN = 0;
  let estAgree = 0;

  for (const iss of issuers) {
    const pack = guessPack(iss);
    if (pack.match) packHit++;
    const gate = evaluateGate(iss);
    const mlp = bandIssuer(iss, evaluateMainRules(iss));
    if (mlp === gateToBand(gate.verdict)) matHit++;

    const complete = scoreComplete(iss);
    for (const h of complete.hits) {
      const flagged = h.band !== "pass";
      const should = h.empty && Math.abs(h.rel) >= 0.01;
      if (flagged && should) completeTp++;
      else if (flagged && !should) completeFp++;
      else if (!flagged && should) completeFn++;
    }

    const est = estimatesFor(iss);
    for (const s of [est.ecl, est.fv, est.dda, est.buyback, est.sbc, est.deferred]) {
      if (!s) continue;
      estN++;
      if (s.band === "pass" || Math.abs(s.residual) < Math.max(1, Math.abs(s.actual) * 0.15)) estAgree++;
    }
  }

  const packAcc = rate(packHit, n);
  const matAcc = rate(matHit, n);
  const prec = completeTp + completeFp === 0 ? 0 : completeTp / (completeTp + completeFp);
  const rec = completeTp + completeFn === 0 ? 0 : completeTp / (completeTp + completeFn);
  const estAcc = rate(estAgree, estN);

  const cards: ModelLiveCard[] = [
    {
      id: "pack-net",
      name: "Pack-Net",
      usable: packAcc >= 0.8,
      why: packAcc >= 0.8 ? "实报规则包路由可用。" : "实报路由不准，发刊台用映射表的包，不用它改包。",
      metricLabel: "11 家命中",
      metric: packAcc,
      detail: `${packHit}/${n}`,
    },
    {
      id: "complete-net",
      name: "Completeness-Net",
      usable: prec >= 0.5 && rec >= 0.4,
      why:
        prec >= 0.5 && rec >= 0.4
          ? "能指出空槽且残差开口的附注。只提示，不填数。"
          : "实报上召回/精度不够，空槽清单改走规则包字段表。",
      metricLabel: "精度",
      metric: prec,
      detail: `精度 ${prec.toFixed(2)} · 召回 ${rec.toFixed(2)}`,
    },
    {
      id: "materiality-net",
      name: "Materiality-Net",
      usable: false,
      why: "合成集准确率约一半，实报也不得用来分诊发刊。咨询带保留，发刊台不读。",
      metricLabel: "与门禁一致",
      metric: matAcc,
      detail: `${matHit}/${n} 与 gateToBand 一致`,
    },
    {
      id: "estimate-net",
      name: "Estimate-Net 族",
      usable: false,
      why: "估计头不写映射。空槽要人填年报数字，不能用预测值闭合恒等。",
      metricLabel: "已披露吻合",
      metric: estAcc,
      detail: estN ? `${estAgree}/${estN} 条与已披露相近` : "本队列无估计样本",
    },
    {
      id: "closer",
      name: "行业闭合头",
      usable: false,
      why: "闭合头在合成开口上训练。实报残差不自动填塞子，AUC 不代表可用。",
      metricLabel: "实报可用",
      metric: 0,
      detail: "不进发刊路径",
    },
  ];

  const out = {
    n,
    cards,
    usableIds: cards.filter((c) => c.usable).map((c) => c.id),
  };
  cached = out;
  return out;
}
