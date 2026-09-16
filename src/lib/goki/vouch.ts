import { boundOf, closedWan, ctxOf } from "./amount";
import { mergeNotes } from "./note-rules";
import { packOf } from "./packs";
import { evaluateGate, type MappingResidual, type Verdict } from "./verdict";
import type { Issuer } from "./types";

export interface VouchCheck {
  id: string;
  name: string;
  main: number;
  notes: number;
  leftover: number;
  leftoverUb: number;
  verdict: Verdict;
  unableReason?: string;
}

export interface Absorption {
  ruleId: string;
  code: string;
  leftover: number;
  leftoverUb: number;
  verdict: Verdict;
  explainers: MappingResidual["explainers"];
  knownMissing: MappingResidual["knownMissing"];
}

export function absorptionOf(issuer: Issuer): Absorption[] {
  return evaluateGate(issuer)
    .residuals.filter((r) => r.kind === "identity" && !r.skipReason)
    .map((r) => ({
      ruleId: r.ruleId,
      code: r.code,
      leftover: r.leftover,
      leftoverUb: r.leftoverUb,
      verdict: r.verdict,
      explainers: r.explainers,
      knownMissing: r.knownMissing,
    }));
}

export function vouchIssuer(issuer: Issuer): VouchCheck[] {
  const n = mergeNotes(issuer.currNotes);
  const pack = packOf(issuer);
  const ub = boundOf(issuer, "r6");
  const out: VouchCheck[] = [];

  if (Math.abs(n.ppeAdd) >= 0.5 && Math.abs(issuer.curr.capex) >= 0.5) {
    const leftover = issuer.curr.capex - n.ppeAdd;
    out.push({
      id: "V01",
      name: "资本开支 vs 固定资产购置",
      main: issuer.curr.capex,
      notes: n.ppeAdd,
      leftover,
      leftoverUb: ub,
      verdict: closedWan(leftover, ub) ? "pass" : "unresolved",
    });
  }

  if (pack === "bank" && Math.abs(n.loansGross) >= 0.5) {
    const notes = n.loansGross - n.ecl;
    const leftover = issuer.curr.ar - notes;
    out.push({
      id: "V02",
      name: "贷款净额 vs 报表客户贷款",
      main: issuer.curr.ar,
      notes,
      leftover,
      leftoverUb: boundOf(issuer, "b2"),
      verdict: closedWan(leftover, boundOf(issuer, "b2")) ? "pass" : "unresolved",
    });
  }

  if (pack === "exchange" && Math.abs(n.ownCash) >= 0.5) {
    const notes = n.ownCash + n.marginCash + n.clearingCash + n.asharesCash;
    const leftover = notes - issuer.curr.cash;
    out.push({
      id: "V03",
      name: "现金四段 vs 报表现金",
      main: issuer.curr.cash,
      notes,
      leftover,
      leftoverUb: boundOf(issuer, "x1"),
      verdict: closedWan(leftover, boundOf(issuer, "x1")) ? "pass" : "unresolved",
    });
  }

  if (pack === "realty") {
    if (Math.abs(n.ip) >= 0.5) {
      out.push({
        id: "V04",
        name: "投资物业 vs 主表",
        main: 0,
        notes: n.ip,
        leftover: n.ip,
        leftoverUb: ub,
        verdict: "unable",
        unableReason: "主表无投资物业专槽，不能交叉校验。",
      });
    }
  }

  void ctxOf(issuer);
  return out;
}
