import type { RuleDef, RuleResult, YearBooks } from "./types";

export const RULES: RuleDef[] = [
  {
    id: "r0",
    code: "R01",
    name: "资产负债恒等",
    nameEn: "Balance-sheet identity",
    kind: "identity",
    strict: true,
    formula: "资产 − (负债 + 权益) = 0",
    effectiveFrom: "2018-01-01",
    appliesIf: "always",
    authority: "HKAS 1",
    explain:
      "资产负债表最硬的勾稽。任何非零残差都不是“业务波动”，只能是漏列、串户或取数口径不一致。容差是披露刻度的 n × 半刻度。",
  },
  {
    id: "r1",
    code: "R02",
    name: "货币资金滚存",
    nameEn: "Cash rollforward",
    kind: "identity",
    strict: false,
    formula: "Δ货币资金 − 现金净增加额 = 0",
    explain:
      "期末货币资金 − 期初货币资金 必须等于现金流量表“现金及现金等价物净增加额”。这是假现金、未入账资金池的经典抓手。",
  },
  {
    id: "r2",
    code: "R03",
    name: "未分配利润滚存",
    nameEn: "Retained-earnings rollforward",
    kind: "identity",
    strict: true,
    formula: "Δ未分配利润 − (TCI − 分红 − 回购 + 股份支付 + NCI + 其他) = 0",
    effectiveFrom: "2018-01-01",
    appliesIf: "always",
    authority: "HKAS 1 / SOCIE",
    explain:
      "硬闭合。TCI 未单列时用净利润 + OCI。与所有者交易和组成部分转拨进附注槽。截断式「ΔRE − (NI − 分红)」只作诊断，不进门禁。",
  },
  {
    id: "r3",
    code: "R04",
    name: "净利润桥",
    nameEn: "Net-income bridge",
    kind: "identity",
    strict: true,
    formula: "利润总额 − 所得税费用 − 净利润 = 0",
    explain: "利润表内部恒等。残差意味着所得税费用与净利润取数不在同一张表。",
  },
  {
    id: "r4",
    code: "R05",
    name: "毛利勾稽",
    nameEn: "Gross-profit identity",
    kind: "identity",
    strict: true,
    formula: "营业收入 − 营业成本 − 毛利 = 0",
    explain: "毛利是派生项。断裂几乎总是科目重分类或取数层级错误（含税/不含税）。",
  },
  {
    id: "r5",
    code: "R06",
    name: "间接法现金流",
    nameEn: "Indirect-method CFO",
    kind: "identity",
    strict: false,
    formula: "CFO − (净利润 + 折旧 − Δ应收 − Δ存货 + Δ应付) = 0",
    explain:
      "简化间接法恒等（本样本无其他营运资本项）。假利润通常在这里露馋：净利润上去了，经营现金流对不上。",
  },
  {
    id: "r6",
    code: "R07",
    name: "固定资产滚存",
    nameEn: "PPE rollforward",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 购置 + 合并取得 − 处置/待售 − 折旧 − 减值 + 汇兑 + 重估) = 0",
    effectiveFrom: "2018-01-01",
    appliesIf: "always",
    authority: "HKAS 16",
    explain:
      "硬闭合。截断式「期初 + 资本开支 − 折旧」只作诊断。行业包关掉本条时改测 P01 / E01 / C01。",
  },
  {
    id: "r7",
    code: "R08",
    name: "应交税费滚存",
    nameEn: "Tax-payable rollforward",
    kind: "identity",
    strict: false,
    formula: "期末应交税费 − (期初 + 所得税费用 − 已交税) = 0",
    explain: "税费余额必须能用“计提 − 实交”滚出来。税务调节和延迟纳税都要能解释这条。",
  },
  {
    id: "r8",
    code: "R09",
    name: "应收／收入周转",
    nameEn: "AR / revenue turnover",
    kind: "analytic",
    strict: false,
    formula: "本年应收÷收入 − 上年应收÷收入",
    explain:
      "分析性程序，不是恒等。周转显著放缓是渠道压货或提前确认收入的早期信号；需结合行业。",
  },
  {
    id: "r9",
    code: "R10",
    name: "存货／成本周转",
    nameEn: "Inventory / COGS turnover",
    kind: "analytic",
    strict: false,
    formula: "本年存货÷成本 − 上年存货÷成本",
    explain:
      "分析性程序。存货相对成本异常抬升常见于滞销未减值，或成本少结转。金融业该条近零。",
  },
];

export function totalAssets(y: YearBooks): number {
  return y.cash + y.ar + y.inv + y.ppe + y.otherCa + y.otherNca;
}

export function totalLE(y: YearBooks): number {
  return y.ap + y.stDebt + y.taxPay + y.ltDebt + y.otherL + y.shareCap + y.re;
}

function nz(n: number, floor = 1): number {
  const a = Math.abs(n);
  return a < floor ? floor : a;
}

function evalOne(prior: YearBooks, curr: YearBooks): Omit<RuleResult, "ruleId" | "yoy" | "priorRel">[] {
  const dAr = curr.ar - prior.ar;
  const dInv = curr.inv - prior.inv;
  const dAp = curr.ap - prior.ap;
  const dCash = curr.cash - prior.cash;
  const dRe = curr.re - prior.re;

  const r0 = totalAssets(curr) - totalLE(curr);
  const r1 = dCash - curr.netCf;
  const r2 = dRe - (curr.ni - curr.dividends);
  const r3 = curr.pretax - curr.tax - curr.ni;
  const r4 = curr.revenue - curr.cogs - curr.gp;
  const r5 = curr.cfo - (curr.ni + curr.da - dAr - dInv + dAp);
  const r6 = curr.ppe - (prior.ppe + curr.capex - curr.da);
  const r7 = curr.taxPay - (prior.taxPay + curr.tax - curr.taxPaid);
  const r8 = curr.ar / nz(curr.revenue) - prior.ar / nz(prior.revenue);
  const r9 = curr.inv / nz(curr.cogs) - prior.inv / nz(prior.cogs);

  const assets = nz(totalAssets(curr));
  const rev = nz(curr.revenue);
  const floor = Math.max(assets * 0.001, 10);

  return [
    { residual: r0, scale: assets, rel: r0 / assets },
    { residual: r1, scale: nz(Math.abs(curr.netCf), floor), rel: r1 / nz(Math.abs(curr.netCf), floor) },
    { residual: r2, scale: nz(Math.abs(curr.ni), floor), rel: r2 / nz(Math.abs(curr.ni), floor) },
    { residual: r3, scale: nz(Math.abs(curr.ni), floor), rel: r3 / nz(Math.abs(curr.ni), floor) },
    { residual: r4, scale: rev, rel: r4 / rev },
    { residual: r5, scale: nz(Math.abs(curr.cfo), floor), rel: r5 / nz(Math.abs(curr.cfo), floor) },
    { residual: r6, scale: nz(curr.ppe, floor), rel: r6 / nz(curr.ppe, floor) },
    { residual: r7, scale: nz(Math.abs(curr.tax), floor), rel: r7 / nz(Math.abs(curr.tax), floor) },
    { residual: r8, scale: 1, rel: r8 },
    { residual: r9, scale: 1, rel: r9 },
  ];
}

export function evaluateRules(prior: YearBooks, curr: YearBooks): RuleResult[] {
  const now = evalOne(prior, curr);
  return RULES.map((rule, i) => {
    const n = now[i]!;
    return {
      ruleId: rule.id,
      residual: n.residual,
      scale: n.scale,
      rel: n.rel,
      priorRel: 0,
      yoy: n.rel,
    };
  });
}

export function maxIdentityAbsRel(rules: RuleResult[]): number {
  let m = 0;
  for (let i = 0; i < 8; i++) {
    if (rules[i]?.skipped) continue;
    m = Math.max(m, Math.abs(rules[i]!.rel));
  }
  return m;
}

/** R01 / R04 / R05 — closed identities if the mapping is honest. */
export function maxStrictAbsRel(rules: RuleResult[]): number {
  let m = 0;
  for (let i = 0; i < RULES.length; i++) {
    if (!RULES[i]!.strict) continue;
    if (rules[i]?.skipped) continue;
    m = Math.max(m, Math.abs(rules[i]!.rel));
  }
  return m;
}

export function maxSoftAbsRel(rules: RuleResult[]): number {
  let m = 0;
  for (let i = 0; i < 8; i++) {
    if (RULES[i]!.strict) continue;
    if (rules[i]?.skipped) continue;
    m = Math.max(m, Math.abs(rules[i]!.rel));
  }
  return m;
}
