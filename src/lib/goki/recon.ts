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
