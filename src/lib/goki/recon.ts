import { mergeNotes } from "./note-rules";
import type { Issuer } from "./types";

export function reconR03(issuer: Issuer) {
  const { curr, prior } = issuer;
  const deltaRe = curr.re - prior.re;
  const niMinusDiv = curr.ni - curr.dividends;
  const gap = deltaRe - niMinusDiv;
  return {
    deltaRe,
    niMinusDiv,
    gap,
    hint:
      gap < 0
        ? "缺口为负：常见于股份回购、拨入法定/一般储备、OCI 亏损、少数股东、外币折算。"
        : gap > 0
          ? "缺口为正：常见于 OCI 盈余、重估、注资进储备、股份支付、投资物业公允。"
          : "简化式闭合。",
  };
}

export function reconR07(issuer: Issuer) {
  const { curr, prior } = issuer;
  const expected = prior.ppe + curr.capex - curr.da;
  const gap = curr.ppe - expected;
  return {
    priorPpe: prior.ppe,
    capex: curr.capex,
    da: curr.da,
    expected,
    actual: curr.ppe,
    gap,
    hint:
      gap < 0
        ? "期末低于滚存：资本开支进了在建/无形/投资物业，或有处置、折耗、减值。"
        : gap > 0
          ? "期末高于滚存：并表购置、在建结转、重估、汇兑、使用权资产记入固定资产。"
          : "简化式闭合。",
  };
}

export function reconEcl(issuer: Issuer) {
  const n = mergeNotes(issuer.currNotes);
  const p = mergeNotes(issuer.priorNotes);
  const expected = p.ecl + n.eclCharge - n.eclWriteoff + n.eclRecover + n.eclFx;
  const gap = n.ecl - expected;
  const net = issuer.curr.ar;
  const gross = n.loansGross;
  const loanGap = gross - n.ecl - net;
  return {
    beg: p.ecl,
    charge: n.eclCharge,
    writeoff: n.eclWriteoff,
    recover: n.eclRecover,
    fx: n.eclFx,
    end: n.ecl,
    expected,
    gap,
    gross,
    net,
    loanGap,
    coverage: gross > 0 ? n.ecl / gross : 0,
    adr: n.deposits > 0 ? net / n.deposits : 0,
    hint:
      Math.abs(gap) / Math.max(Math.abs(n.ecl), 1) < 0.01
        ? "ECL 滚存已闭合。"
        : "缺口来自阶段迁徙、HFS、转让、模型更新未单列，或比较栏 ECL 存量是倒推数。",
  };
}

export function reconIp(issuer: Issuer) {
  const n = mergeNotes(issuer.currNotes);
  const p = mergeNotes(issuer.priorNotes);
  const expected = p.ip + n.ipAdd + n.ipTransfer + n.ipFv - n.ipDisp;
  const gap = n.ip - expected;
  const invExpected = issuer.prior.inv + n.devCost - issuer.curr.cogs - n.ipTransfer;
  const invGap = issuer.curr.inv - invExpected;
  return {
    beg: p.ip,
    add: n.ipAdd,
    fv: n.ipFv,
    end: n.ip,
    expected,
    gap,
    fvRatio: n.ip > 0 ? n.ipFv / n.ip : 0,
    invGap,
    hint:
      Math.abs(gap) / Math.max(Math.abs(n.ip), 1) < 0.01
        ? "投资物业滚存已闭合。"
        : "缺口是未映射的开发转入、收购或处置。公允已按年报填入。",
  };
}

export function reconAro(issuer: Issuer) {
  const n = mergeNotes(issuer.currNotes);
  const p = mergeNotes(issuer.priorNotes);
  const expected = p.prov + n.provCharge + n.abandonUnwind - n.provUse;
  const gap = n.prov - expected;
  return {
    beg: p.prov,
    unwind: n.abandonUnwind,
    charge: n.provCharge,
    end: n.prov,
    expected,
    gap,
    hint:
      Math.abs(gap) / Math.max(Math.abs(n.prov), 1) < 0.01
        ? "弃置准备已闭合。"
        : "缺口是新井 ARO / 储量修订未单列，不是折现释放漏记。",
  };
}

export function reconMargin(issuer: Issuer) {
  const n = mergeNotes(issuer.currNotes);
  const composed = n.ownCash + n.marginCash + n.clearingCash + n.asharesCash;
  const cashGap = composed - issuer.curr.cash;
  const marginGap = n.marginFunds - n.marginLiab;
  const chfGap = n.clearingFunds - n.clearingLiab;
  return {
    ownCash: n.ownCash,
    marginCash: n.marginCash,
    clearingCash: n.clearingCash,
    asharesCash: n.asharesCash,
    cash: issuer.curr.cash,
    cashGap,
    marginFunds: n.marginFunds,
    marginLiab: n.marginLiab,
    marginGap,
    chfGap,
    hint:
      Math.abs(cashGap) < 1
        ? "四段现金加总已对上报表现金。"
        : "现金构成还没加全。",
  };
}
