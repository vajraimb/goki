import {
  cashGap,
  debtGap,
  equityGap,
  evaluateNotes,
  NOTE_FIELDS,
  NOTE_FEATURE_NAMES,
  NOTE_RULES,
  nz,
  ppeGap,
  plugTruncation,
  resultsOf,
  taxGap,
} from "./note-rules";
import type { Issuer, NoteBooks, RuleDef, RulePack, RuleResult, YearBooks } from "./types";

export type NoteField = { key: keyof NoteBooks; label: string; group: string };

export interface PackSpec {
  id: RulePack;
  skipMain: Record<string, string>;
  noteRules: RuleDef[];
  noteFields: NoteField[];
  featureNames: string[];
  evaluate: (
    prior: YearBooks,
    curr: YearBooks,
    priorNotes: NoteBooks,
    currNotes: NoteBooks,
  ) => RuleResult[];
  plug: (issuer: Issuer, notes: NoteBooks) => NoteBooks;
}

function namesOf(rules: RuleDef[]): string[] {
  return rules.flatMap((r) => [`${r.code}_resid_log`, `${r.code}_rel`]);
}

function floorOf(curr: YearBooks): number {
  return Math.max(nz(curr.ni, 10), 10);
}

function plugCommon(issuer: Issuer, notes: NoteBooks): NoteBooks {
  return plugTruncation(issuer, notes);
}

const EQ: RuleDef = NOTE_RULES[0]!;
const CASH: RuleDef = NOTE_RULES[2]!;
const DEBT: RuleDef = NOTE_RULES[3]!;
const TAX: RuleDef = NOTE_RULES[4]!;

/* ── bank ── */

export const BANK_NOTE_RULES: RuleDef[] = [
  EQ,
  {
    id: "b1",
    code: "B01",
    name: "ECL 准备滚存",
    nameEn: "ECL allowance rollforward",
    kind: "identity",
    strict: true,
    formula: "期末准备 − (期初 + 计提 − 核销 + 收回 + 汇兑) = 0",
    explain: "HKFRS 9。计提走损益，核销走准备，汇兑/转让/HFS 进其他。这是银行最硬的附注恒等。",
  },
  CASH,
  DEBT,
  TAX,
  {
    id: "b2",
    code: "B02",
    name: "贷款净额恒等",
    nameEn: "Gross loans − ECL = net",
    kind: "identity",
    strict: true,
    formula: "贷款总额 − ECL 准备 − 客户贷款净额 = 0",
    explain: "资产负债表「客户贷款」是净额。总额和准备必须能从信贷附注加回来。",
  },
  {
    id: "b3",
    code: "B03",
    name: "贷存比变动",
    nameEn: "Advances-to-deposits",
    kind: "analytic",
    strict: false,
    formula: "本年净贷款÷存款 − 上年净贷款÷存款",
    explain: "分析性程序，不是恒等。恒生 2025 年报写明 61.4%。大幅偏离同业才上升。",
  },
  {
    id: "b4",
    code: "B04",
    name: "ECL 覆盖率变动",
    nameEn: "ECL coverage change",
    kind: "analytic",
    strict: false,
    formula: "本年 ECL÷贷款总额 − 上年",
    explain: "分析性。覆盖率跳升常见于阶段迁徙或模型更新，要对照计提和核销。",
  },
];

export const BANK_NOTE_FIELDS: NoteField[] = [
  { key: "oci", label: "OCI / FVOCI", group: "n0" },
  { key: "buyback", label: "回购", group: "n0" },
  { key: "sbp", label: "股份支付", group: "n0" },
  { key: "nci", label: "少数股东", group: "n0" },
  { key: "otherEq", label: "其他权益", group: "n0" },
  { key: "ecl", label: "期末 ECL", group: "b1" },
  { key: "eclCharge", label: "本年计提", group: "b1" },
  { key: "eclWriteoff", label: "核销", group: "b1" },
  { key: "eclRecover", label: "收回", group: "b1" },
  { key: "eclFx", label: "汇兑/其他", group: "b1" },
  { key: "fxCash", label: "现金汇兑", group: "n2" },
  { key: "borrowDraw", label: "批发提取", group: "n3" },
  { key: "borrowRepay", label: "批发偿还", group: "n3" },
  { key: "fxDebt", label: "债务汇兑", group: "n3" },
  { key: "deferredTaxAdj", label: "递延调节", group: "n4" },
  { key: "loansGross", label: "贷款总额", group: "b2" },
  { key: "deposits", label: "客户存款", group: "b3" },
  { key: "nii", label: "净利息收入", group: "b4" },
];

export function evaluateBankNotes(
  prior: YearBooks,
  curr: YearBooks,
  priorNotes: NoteBooks,
  currNotes: NoteBooks,
): RuleResult[] {
  const n = currNotes;
  const p = priorNotes;
  const floor = floorOf(curr);
  const r0 = equityGap(prior, curr, n);
  const r1 = n.ecl - (p.ecl + n.eclCharge - n.eclWriteoff + n.eclRecover + n.eclFx);
  const r2 = cashGap(prior, curr, n);
  const r3 = debtGap(prior, curr, n);
  const r4 = taxGap(prior, curr, n);
  const r5 = n.loansGross - n.ecl - curr.ar;
  const r6 = curr.ar / nz(n.deposits, 1) - prior.ar / nz(p.deposits, 1);
  const r7 = n.loansGross > 0 && p.loansGross > 0 ? n.ecl / n.loansGross - p.ecl / p.loansGross : 0;
  return resultsOf(BANK_NOTE_RULES, [
    { residual: r0, scale: nz(Math.abs(curr.ni), floor), rel: r0 / nz(Math.abs(curr.ni), floor) },
    { residual: r1, scale: nz(n.ecl, floor), rel: r1 / nz(n.ecl, floor) },
    { residual: r2, scale: nz(Math.abs(curr.netCf), floor), rel: r2 / nz(Math.abs(curr.netCf), floor) },
    {
      residual: r3,
      scale: nz(curr.stDebt + curr.ltDebt, floor),
      rel: r3 / nz(curr.stDebt + curr.ltDebt, floor),
    },
    { residual: r4, scale: nz(Math.abs(curr.tax), floor), rel: r4 / nz(Math.abs(curr.tax), floor) },
    { residual: r5, scale: nz(curr.ar, floor), rel: r5 / nz(curr.ar, floor) },
    { residual: r6, scale: 1, rel: r6 },
    { residual: r7, scale: 1, rel: r7 },
  ]);
}

function plugBank(issuer: Issuer, notes: NoteBooks): NoteBooks {
  const n = plugCommon(issuer, notes);
  const priorNotes = issuer.priorNotes;
  const pEcl = priorNotes?.ecl ?? 0;
  n.loansGross = issuer.curr.ar + n.ecl;
  n.eclFx += n.ecl - (pEcl + n.eclCharge - n.eclWriteoff + n.eclRecover + n.eclFx);
  if (n.deposits === 0) n.deposits = Math.max(0, issuer.curr.otherL);
  return n;
}

/* ── realty ── */

export const REALTY_NOTE_RULES: RuleDef[] = [
  EQ,
  {
    id: "p1",
    code: "P01",
    name: "投资物业滚存",
    nameEn: "Investment property rollforward",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 购置 + 转入 + 公允 − 处置) = 0",
    explain: "HKAS 40。公允进损益，不进 OCI。转入来自待售物业。R07 成本滚存对投资物业无意义。",
  },
  {
    id: "p2",
    code: "P02",
    name: "待售物业滚存",
    nameEn: "Properties for sale rollforward",
    kind: "identity",
    strict: true,
    formula: "期末存货 − (期初 + 开发成本 − 结转成本 − 转入投资物业) = 0",
    explain: "发展商的存货是楼。结转走营业成本。未填开发成本时残差就是未映射的在建投入。",
  },
  CASH,
  DEBT,
  TAX,
  {
    id: "p3",
    code: "P03",
    name: "净负债率变动",
    nameEn: "Net gearing change",
    kind: "analytic",
    strict: false,
    formula: "本年(有息−现金)÷权益 − 上年",
    explain: "分析性。地产周期里杠杆跳升先看这个，不是造假。",
  },
  {
    id: "p4",
    code: "P04",
    name: "投资物业公允幅度",
    nameEn: "IP fair-value / stock",
    kind: "analytic",
    strict: false,
    formula: "本年公允变动 ÷ 期末投资物业",
    explain: "分析性。Estimate-Net 用这条质疑估值。新鸿基 2025 年报公允 −27.3 亿 / 4,170 亿 ≈ −0.7%。",
  },
];

export const REALTY_NOTE_FIELDS: NoteField[] = [
  { key: "oci", label: "OCI", group: "n0" },
  { key: "buyback", label: "回购", group: "n0" },
  { key: "nci", label: "少数股东", group: "n0" },
  { key: "otherEq", label: "其他权益", group: "n0" },
  { key: "ip", label: "投资物业期末", group: "p1" },
  { key: "ipAdd", label: "购置/开发转入", group: "p1" },
  { key: "ipFv", label: "公允变动", group: "p1" },
  { key: "ipDisp", label: "处置", group: "p1" },
  { key: "ipTransfer", label: "待售转入", group: "p1" },
  { key: "devCost", label: "开发成本", group: "p2" },
  { key: "fxCash", label: "现金汇兑", group: "n2" },
  { key: "borrowDraw", label: "提取", group: "n3" },
  { key: "borrowRepay", label: "偿还", group: "n3" },
  { key: "deferredTaxAdj", label: "递延调节", group: "n4" },
];

export function evaluateRealtyNotes(
  prior: YearBooks,
  curr: YearBooks,
  priorNotes: NoteBooks,
  currNotes: NoteBooks,
): RuleResult[] {
  const n = currNotes;
  const p = priorNotes;
  const floor = floorOf(curr);
  const r0 = equityGap(prior, curr, n);
  const r1 = n.ip - (p.ip + n.ipAdd + n.ipTransfer + n.ipFv - n.ipDisp);
  const r2 = curr.inv - (prior.inv + n.devCost - curr.cogs - n.ipTransfer);
  const r3 = cashGap(prior, curr, n);
  const r4 = debtGap(prior, curr, n);
  const r5 = taxGap(prior, curr, n);
  const gear = (y: YearBooks) => (y.stDebt + y.ltDebt - y.cash) / nz(y.shareCap + y.re);
  const r6 = gear(curr) - gear(prior);
  const r7 = n.ipFv / nz(n.ip);
  return resultsOf(REALTY_NOTE_RULES, [
    { residual: r0, scale: nz(Math.abs(curr.ni), floor), rel: r0 / nz(Math.abs(curr.ni), floor) },
    { residual: r1, scale: nz(n.ip, floor), rel: r1 / nz(n.ip, floor) },
    { residual: r2, scale: nz(curr.inv, floor), rel: r2 / nz(curr.inv, floor) },
    { residual: r3, scale: nz(Math.abs(curr.netCf), floor), rel: r3 / nz(Math.abs(curr.netCf), floor) },
    {
      residual: r4,
      scale: nz(curr.stDebt + curr.ltDebt, floor),
      rel: r4 / nz(curr.stDebt + curr.ltDebt, floor),
    },
    { residual: r5, scale: nz(Math.abs(curr.tax), floor), rel: r5 / nz(Math.abs(curr.tax), floor) },
    { residual: r6, scale: 1, rel: r6 },
    { residual: r7, scale: 1, rel: r7 },
  ]);
}

function plugRealty(issuer: Issuer, notes: NoteBooks): NoteBooks {
  const n = plugCommon(issuer, notes);
  const p = issuer.priorNotes;
  const ipBeg = p?.ip ?? 0;
  n.ipAdd += n.ip - (ipBeg + n.ipAdd + n.ipTransfer + n.ipFv - n.ipDisp);
  n.devCost += issuer.curr.inv - (issuer.prior.inv + n.devCost - issuer.curr.cogs - n.ipTransfer);
  return n;
}

/* ── energy ── */

export const ENERGY_NOTE_RULES: RuleDef[] = [
  EQ,
  {
    id: "e1",
    code: "E01",
    name: "油气/电厂资产滚存",
    nameEn: "Oil & gas / generation PPE",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 资本开支 − 折耗 − 减值 − 处置 + 汇兑) = 0",
    explain: "中海油折耗按储量，中电按管制资产。简化 R07 缺减值、弃置修订、汇兑。",
  },
  {
    id: "e2",
    code: "E02",
    name: "弃置准备滚存",
    nameEn: "Decommissioning provision",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 计提 + 折现释放 − 使用) = 0",
    explain: "中海油 2025 弃置准备 1,160 亿，折现释放 38 亿。新井 ARO 未单列时会留缺口。",
  },
  CASH,
  DEBT,
  {
    id: "e3",
    code: "E03",
    name: "使用权资产",
    nameEn: "ROU rollforward",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 增加 − 折旧 − 终止) = 0",
    explain: "油气租约和电厂土地。",
  },
  {
    id: "e4",
    code: "E04",
    name: "折耗率变动",
    nameEn: "DD&A / PPE change",
    kind: "analytic",
    strict: false,
    formula: "本年折旧÷PPE − 上年",
    explain: "分析性。储量修订或机组退役会让折耗率跳。",
  },
  {
    id: "e5",
    code: "E05",
    name: "燃料条款 / 管制余额",
    nameEn: "Fuel clause / tariff account",
    kind: "analytic",
    strict: false,
    formula: "燃料条款余额 ÷ 收入",
    explain: "中电 SoC：燃料条款从资产翻成负债是关税机制，不是账错。中海油这条接近 0。",
  },
];

export const ENERGY_NOTE_FIELDS: NoteField[] = [
  { key: "oci", label: "OCI", group: "n0" },
  { key: "nci", label: "少数股东", group: "n0" },
  { key: "otherEq", label: "其他权益", group: "n0" },
  { key: "ppeAdd", label: "资本开支", group: "e1" },
  { key: "ppeImpair", label: "减值", group: "e1" },
  { key: "ppeDisp", label: "处置", group: "e1" },
  { key: "ppeFx", label: "汇兑", group: "e1" },
  { key: "prov", label: "弃置准备期末", group: "e2" },
  { key: "provCharge", label: "新井/修订", group: "e2" },
  { key: "abandonUnwind", label: "折现释放", group: "e2" },
  { key: "provUse", label: "使用", group: "e2" },
  { key: "fxCash", label: "现金汇兑", group: "n2" },
  { key: "borrowDraw", label: "提取", group: "n3" },
  { key: "borrowRepay", label: "偿还", group: "n3" },
  { key: "rou", label: "使用权期末", group: "e3" },
  { key: "rouAdd", label: "租赁增加", group: "e3" },
  { key: "rouDep", label: "使用权折旧", group: "e3" },
  { key: "rouTerm", label: "终止", group: "e3" },
  { key: "fuelClause", label: "燃料条款余额", group: "e5" },
];

export function evaluateEnergyNotes(
  prior: YearBooks,
  curr: YearBooks,
  priorNotes: NoteBooks,
  currNotes: NoteBooks,
): RuleResult[] {
  const n = currNotes;
  const p = priorNotes;
  const floor = floorOf(curr);
  const r0 = equityGap(prior, curr, n);
  const r1 = ppeGap(prior, curr, n);
  const r2 = n.prov - (p.prov + n.provCharge + n.abandonUnwind - n.provUse);
  const r3 = cashGap(prior, curr, n);
  const r4 = debtGap(prior, curr, n);
  const r5 = n.rou - (p.rou + n.rouAdd - n.rouDep - n.rouTerm);
  const r6 = curr.da / nz(curr.ppe) - prior.da / nz(prior.ppe);
  const r7 = n.fuelClause / nz(curr.revenue);
  return resultsOf(ENERGY_NOTE_RULES, [
    { residual: r0, scale: nz(Math.abs(curr.ni), floor), rel: r0 / nz(Math.abs(curr.ni), floor) },
    { residual: r1, scale: nz(curr.ppe, floor), rel: r1 / nz(curr.ppe, floor) },
    { residual: r2, scale: nz(n.prov, floor), rel: r2 / nz(n.prov, floor) },
    { residual: r3, scale: nz(Math.abs(curr.netCf), floor), rel: r3 / nz(Math.abs(curr.netCf), floor) },
    {
      residual: r4,
      scale: nz(curr.stDebt + curr.ltDebt, floor),
      rel: r4 / nz(curr.stDebt + curr.ltDebt, floor),
    },
    { residual: r5, scale: nz(n.rou, floor), rel: r5 / nz(n.rou, floor) },
    { residual: r6, scale: 1, rel: r6 },
    { residual: r7, scale: 1, rel: r7 },
  ]);
}

function plugEnergy(issuer: Issuer, notes: NoteBooks): NoteBooks {
  const n = plugCommon(issuer, notes);
  const p = issuer.priorNotes;
  n.abandonUnwind += n.prov - ((p?.prov ?? 0) + n.provCharge + n.abandonUnwind - n.provUse);
  return n;
}

function plugPlatform(issuer: Issuer, notes: NoteBooks): NoteBooks {
  const n = plugCommon(issuer, notes);
  const beg = issuer.priorNotes?.cl ?? 0;
  n.clAdd += n.cl - (beg + n.clAdd - n.clRelease);
  return n;
}

/* ── platform ── */

export const PLATFORM_NOTE_RULES: RuleDef[] = [
  EQ,
  {
    id: "t3",
    code: "T03",
    name: "合同负债滚存",
    nameEn: "Contract liability rollforward",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 本年预收 − 本年结转收入) = 0",
    explain: "HKFRS 15。腾讯 2025 期末 945 亿、期初 876 亿，年初余额结转收入 851 亿。本年预收年报常不单列，空着这条就会开口。",
  },
  CASH,
  DEBT,
  NOTE_RULES[5]!,
  NOTE_RULES[6]!,
  {
    id: "t1",
    code: "T01",
    name: "流动性结构",
    nameEn: "Cash vs term deposits",
    kind: "analytic",
    strict: false,
    formula: "定期存款 ÷ (现金 + 定期存款)",
    explain: "平台账上大量定期/理财不进「现金及现金等价物」。美团 2025 短期理财约 600 亿。",
  },
  {
    id: "t4",
    code: "T04",
    name: "股份支付占开支",
    nameEn: "SBC / opex",
    kind: "analytic",
    strict: false,
    formula: "权益结算股份支付 ÷ 期间费用",
    explain: "分析性。腾讯 2025 计入权益的雇员服务 256 亿 / 期间费用 1,779 亿 ≈ 14%。进股本溢价和其他储备，不进未分配利润。",
  },
];

export const PLATFORM_NOTE_FIELDS: NoteField[] = [
  { key: "oci", label: "OCI", group: "n0" },
  { key: "buyback", label: "回购", group: "n0" },
  { key: "nci", label: "少数股东", group: "n0" },
  { key: "otherEq", label: "其他权益", group: "n0" },
  { key: "ppeAdd", label: "购置", group: "n1" },
  { key: "ppeCip", label: "在建结转", group: "n1" },
  { key: "ppeDisp", label: "处置", group: "n1" },
  { key: "ppeImpair", label: "减值", group: "n1" },
  { key: "fxCash", label: "现金汇兑", group: "n2" },
  { key: "borrowDraw", label: "提取", group: "n3" },
  { key: "borrowRepay", label: "偿还", group: "n3" },
  { key: "intan", label: "无形期末", group: "n5" },
  { key: "intanAdd", label: "无形购置", group: "n5" },
  { key: "intanAmort", label: "摊销", group: "n5" },
  { key: "rou", label: "使用权期末", group: "n6" },
  { key: "rouAdd", label: "租赁增加", group: "n6" },
  { key: "rouDep", label: "使用权折旧", group: "n6" },
  { key: "rouTerm", label: "终止", group: "n6" },
  { key: "stInvest", label: "定期/理财", group: "t1" },
  { key: "cl", label: "合同负债期末", group: "t3" },
  { key: "clAdd", label: "本年预收", group: "t3" },
  { key: "clRelease", label: "结转收入", group: "t3" },
  { key: "sbp", label: "股份支付（权益结算）", group: "t4" },
];

export function evaluatePlatformNotes(
  prior: YearBooks,
  curr: YearBooks,
  priorNotes: NoteBooks,
  currNotes: NoteBooks,
): RuleResult[] {
  const n = currNotes;
  const p = priorNotes;
  const floor = floorOf(curr);
  const r0 = curr.re - prior.re - (curr.ni - curr.dividends + n.oci - n.buyback + n.nci + n.otherEq);
  const r1 = n.cl - (p.cl + n.clAdd - n.clRelease);
  const r2 = cashGap(prior, curr, n);
  const r3 = debtGap(prior, curr, n);
  const r4 = n.intan - (p.intan + n.intanAdd - n.intanAmort - n.intanImpair);
  const r5 = n.rou - (p.rou + n.rouAdd - n.rouDep - n.rouTerm);
  const liq = curr.cash + n.stInvest;
  const r6 = n.stInvest / nz(liq);
  const r7 = n.sbp / nz(curr.opex);
  return resultsOf(PLATFORM_NOTE_RULES, [
    { residual: r0, scale: nz(Math.abs(curr.ni), floor), rel: r0 / nz(Math.abs(curr.ni), floor) },
    { residual: r1, scale: nz(n.cl, floor), rel: r1 / nz(n.cl, floor) },
    { residual: r2, scale: nz(Math.abs(curr.netCf), floor), rel: r2 / nz(Math.abs(curr.netCf), floor) },
    {
      residual: r3,
      scale: nz(curr.stDebt + curr.ltDebt, floor),
      rel: r3 / nz(curr.stDebt + curr.ltDebt, floor),
    },
    { residual: r4, scale: nz(n.intan, floor), rel: r4 / nz(n.intan, floor) },
    { residual: r5, scale: nz(n.rou, floor), rel: r5 / nz(n.rou, floor) },
    { residual: r6, scale: 1, rel: r6 },
    { residual: r7, scale: 1, rel: r7 },
  ]);
}

/* ── exchange ── */

export const EXCHANGE_NOTE_RULES: RuleDef[] = [
  EQ,
  {
    id: "x1",
    code: "X01",
    name: "现金构成恒等",
    nameEn: "Cash composition",
    kind: "identity",
    strict: true,
    formula: "公司资金现金 + 保证金现金 + 结算所现金 + 沪深股通 − 报表现金 = 0",
    explain: "港交所现金 1,827 亿里大部分是参与者的钱。四段加总必须等于现金流量表现金。",
  },
  {
    id: "x2",
    code: "X02",
    name: "保证金资产负债",
    nameEn: "Margin funds vs deposits",
    kind: "identity",
    strict: true,
    formula: "保证金基金资产 − 参与者保证金负债",
    explain: "资产可以投进债券，负债是参与者存款。对不上通常是投资分类或时点，不是假现金。",
  },
  {
    id: "x3",
    code: "X03",
    name: "结算所基金",
    nameEn: "Clearing house funds",
    kind: "identity",
    strict: true,
    formula: "结算所基金资产 − 参与者缴款",
    explain: "违约基金。港交所 2025 年资产 358 亿、缴款 340 亿。",
  },
  CASH,
  TAX,
  {
    id: "x4",
    code: "X04",
    name: "自有现金占比",
    nameEn: "Own cash / total cash",
    kind: "analytic",
    strict: false,
    formula: "公司资金现金 ÷ 报表现金",
    explain: "分析性。自有现金占比低说明资产负债表被保证金撑大，R02 不能当自有资金滚存。",
  },
  {
    id: "x5",
    code: "X05",
    name: "保证金规模变动",
    nameEn: "Margin funds growth",
    kind: "analytic",
    strict: false,
    formula: "本年保证金负债 ÷ 上年 − 1",
    explain: "分析性。2025 年保证金负债从 1,889 亿升到 2,692 亿，随成交额走。",
  },
];

export const EXCHANGE_NOTE_FIELDS: NoteField[] = [
  { key: "oci", label: "OCI", group: "n0" },
  { key: "otherEq", label: "其他权益", group: "n0" },
  { key: "ownCash", label: "公司资金现金", group: "x1" },
  { key: "marginCash", label: "保证金现金", group: "x1" },
  { key: "clearingCash", label: "结算所现金", group: "x1" },
  { key: "asharesCash", label: "沪深股通现金", group: "x1" },
  { key: "marginFunds", label: "保证金基金资产", group: "x2" },
  { key: "marginLiab", label: "参与者保证金", group: "x2" },
  { key: "clearingFunds", label: "结算所基金资产", group: "x3" },
  { key: "clearingLiab", label: "参与者缴款", group: "x3" },
  { key: "fxCash", label: "现金汇兑", group: "n2" },
  { key: "deferredTaxAdj", label: "递延调节", group: "n4" },
];

export function evaluateExchangeNotes(
  prior: YearBooks,
  curr: YearBooks,
  priorNotes: NoteBooks,
  currNotes: NoteBooks,
): RuleResult[] {
  const n = currNotes;
  const p = priorNotes;
  const floor = floorOf(curr);
  const r0 = equityGap(prior, curr, n);
  const composed = n.ownCash + n.marginCash + n.clearingCash + n.asharesCash;
  const r1 = composed - curr.cash;
  const r2 = n.marginFunds - n.marginLiab;
  const r3 = n.clearingFunds - n.clearingLiab;
  const r4 = cashGap(prior, curr, n);
  const r5 = taxGap(prior, curr, n);
  const r6 = n.ownCash / nz(curr.cash);
  const r7 = p.marginLiab > 0 ? n.marginLiab / p.marginLiab - 1 : 0;
  return resultsOf(EXCHANGE_NOTE_RULES, [
    { residual: r0, scale: nz(Math.abs(curr.ni), floor), rel: r0 / nz(Math.abs(curr.ni), floor) },
    { residual: r1, scale: nz(curr.cash, floor), rel: r1 / nz(curr.cash, floor) },
    { residual: r2, scale: nz(n.marginLiab, floor), rel: r2 / nz(n.marginLiab, floor) },
    { residual: r3, scale: nz(n.clearingFunds, floor), rel: r3 / nz(n.clearingFunds, floor) },
    { residual: r4, scale: nz(Math.abs(curr.netCf), floor), rel: r4 / nz(Math.abs(curr.netCf), floor) },
    { residual: r5, scale: nz(Math.abs(curr.tax), floor), rel: r5 / nz(Math.abs(curr.tax), floor) },
    { residual: r6, scale: 1, rel: r6 },
    { residual: r7, scale: 1, rel: r7 },
  ]);
}

function plugExchange(issuer: Issuer, notes: NoteBooks): NoteBooks {
  const n = plugCommon(issuer, notes);
  const composed = n.ownCash + n.marginCash + n.clearingCash + n.asharesCash;
  n.ownCash += issuer.curr.cash - composed;
  return n;
}

/* ── telco ── */

export const TELCO_NOTE_RULES: RuleDef[] = [
  EQ,
  {
    id: "c1",
    code: "C01",
    name: "网络资产（固定资产+在建）",
    nameEn: "PPE + CIP roll",
    kind: "identity",
    strict: true,
    formula: "(PPE+在建) − (期初 + 资本开支 − (折旧摊销 − 无形摊销)) = 0",
    explain: "中移动 2025 固定资产 7,071 亿、在建 618 亿、开支 1,509 亿。折旧摊销 1,900 亿含无形 161 亿。",
  },
  {
    id: "c2",
    code: "C02",
    name: "无形 / 频谱 / 土地",
    nameEn: "Intangibles + spectrum + land",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 购置 − 摊销) = 0",
    explain: "土地使用权+软件+频谱等。中移动 2025 账面 597 亿。并购并入不进「本年增加」就会开口。",
  },
  {
    id: "c3",
    code: "C03",
    name: "使用权资产",
    nameEn: "ROU / towers",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 增加 − 折旧 − 终止) = 0",
    explain: "铁塔租赁。中移动 2025 期末 777 亿。增加/折旧未单列则开口。",
  },
  CASH,
  {
    id: "c4",
    code: "C04",
    name: "合同负债滚存",
    nameEn: "Contract liability rollforward",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 本年预收 − 结转收入) = 0",
    explain: "预存款、积分、未用流量。中移动 2025 期末 496 亿、期初 550 亿。预收和结转常不单列。",
  },
  {
    id: "c5",
    code: "C05",
    name: "合同资产 / 收入",
    nameEn: "Contract assets / revenue",
    kind: "analytic",
    strict: false,
    formula: "合同资产 ÷ 营业收入",
    explain: "IFRS 15 未开票。中移动 2025 流动 202 亿 / 收入 10,502 亿 ≈ 1.9%。",
  },
  {
    id: "c6",
    code: "C06",
    name: "银行存款占流动性",
    nameEn: "Bank deposits / liquidity",
    kind: "analytic",
    strict: false,
    formula: "流动定期 ÷ (现金 + 流动定期)",
    explain: "现金等价物之外的银行定期。中移动 2025 流动 738 亿、现金 973 亿。",
  },
];

export const TELCO_NOTE_FIELDS: NoteField[] = [
  { key: "oci", label: "OCI", group: "n0" },
  { key: "nci", label: "少数股东", group: "n0" },
  { key: "otherEq", label: "其他权益", group: "n0" },
  { key: "ppeAdd", label: "资本开支", group: "c1" },
  { key: "cip", label: "在建工程", group: "c1" },
  { key: "intan", label: "无形期末", group: "c2" },
  { key: "intanAdd", label: "无形购置", group: "c2" },
  { key: "intanAmort", label: "摊销", group: "c2" },
  { key: "rou", label: "使用权期末", group: "c3" },
  { key: "rouAdd", label: "租赁增加", group: "c3" },
  { key: "rouDep", label: "使用权折旧", group: "c3" },
  { key: "fxCash", label: "现金汇兑", group: "n2" },
  { key: "cl", label: "合同负债期末", group: "c4" },
  { key: "clAdd", label: "本年预收", group: "c4" },
  { key: "clRelease", label: "结转收入", group: "c4" },
  { key: "contractAsset", label: "合同资产", group: "c5" },
  { key: "stInvest", label: "流动银行定期", group: "c6" },
];

export function evaluateTelcoNotes(
  prior: YearBooks,
  curr: YearBooks,
  priorNotes: NoteBooks,
  currNotes: NoteBooks,
): RuleResult[] {
  const n = currNotes;
  const p = priorNotes;
  const floor = floorOf(curr);
  const r0 = curr.re - prior.re - (curr.ni - curr.dividends + n.oci - n.buyback + n.nci + n.otherEq);
  const stock = curr.ppe + n.cip;
  const priorStock = prior.ppe + p.cip;
  const daNet = curr.da - n.intanAmort;
  const r1 = stock - (priorStock + curr.capex - daNet);
  const r2 = n.intan - (p.intan + n.intanAdd - n.intanAmort);
  const r3 = n.rou - (p.rou + n.rouAdd - n.rouDep - n.rouTerm);
  const r4 = cashGap(prior, curr, n);
  const r5 = n.cl - (p.cl + n.clAdd - n.clRelease);
  const r6 = n.contractAsset / nz(curr.revenue);
  const liq = curr.cash + n.stInvest;
  const r7 = n.stInvest / nz(liq);
  return resultsOf(TELCO_NOTE_RULES, [
    { residual: r0, scale: nz(Math.abs(curr.ni), floor), rel: r0 / nz(Math.abs(curr.ni), floor) },
    { residual: r1, scale: nz(stock, floor), rel: r1 / nz(stock, floor) },
    { residual: r2, scale: nz(n.intan, floor), rel: r2 / nz(n.intan, floor) },
    { residual: r3, scale: nz(n.rou, floor), rel: r3 / nz(n.rou, floor) },
    { residual: r4, scale: nz(Math.abs(curr.netCf), floor), rel: r4 / nz(Math.abs(curr.netCf), floor) },
    { residual: r5, scale: nz(n.cl, floor), rel: r5 / nz(n.cl, floor) },
    { residual: r6, scale: 1, rel: r6 },
    { residual: r7, scale: 1, rel: r7 },
  ]);
}

function plugTelco(issuer: Issuer, notes: NoteBooks): NoteBooks {
  const n = plugCommon(issuer, notes);
  const p = issuer.priorNotes;
  const priorStock = issuer.prior.ppe + (p?.cip ?? 0);
  const daNet = issuer.curr.da - n.intanAmort;
  n.cip = priorStock + issuer.curr.capex - daNet - issuer.curr.ppe;
  n.clAdd += n.cl - ((p?.cl ?? 0) + n.clAdd - n.clRelease);
  n.intanAdd += n.intan - ((p?.intan ?? 0) + n.intanAdd - n.intanAmort);
  return n;
}

/* ── registry ── */

export const PACK_SPECS: Record<RulePack, PackSpec> = {
  generic: {
    id: "generic",
    skipMain: {},
    noteRules: NOTE_RULES,
    noteFields: NOTE_FIELDS,
    featureNames: NOTE_FEATURE_NAMES,
    evaluate: evaluateNotes,
    plug: plugTruncation,
  },
  bank: {
    id: "bank",
    skipMain: {
      r4: "银行没有营业成本/毛利。收入是净经营收入。",
      r5: "银行经营现金流含贷款与存款变动，简化间接法不适用。",
      r6: "PPE 相对总资产可忽略，成本滚存不是银行勾稽。",
      r8: "贷款÷净经营收入是倍数不是应收周转。改看贷存比 B03。",
      r9: "银行存货近零。周转分析改看贷存比 B03。",
    },
    noteRules: BANK_NOTE_RULES,
    noteFields: BANK_NOTE_FIELDS,
    featureNames: namesOf(BANK_NOTE_RULES),
    evaluate: evaluateBankNotes,
    plug: plugBank,
  },
  exchange: {
    id: "exchange",
    skipMain: {
      r4: "交易所收入是交易/结算费，没有营业成本。",
      r5: "经营现金流被参与者保证金进出主导，简化间接法不适用。",
      r6: "固定资产相对保证金资产可忽略。",
      r8: "应收主要是结算应收，不是赊销。",
      r9: "没有存货。",
    },
    noteRules: EXCHANGE_NOTE_RULES,
    noteFields: EXCHANGE_NOTE_FIELDS,
    featureNames: namesOf(EXCHANGE_NOTE_RULES),
    evaluate: evaluateExchangeNotes,
    plug: plugExchange,
  },
  realty: {
    id: "realty",
    skipMain: {
      r6: "投资物业按公允计量，不按成本减折旧。改测 P01。",
      r5: "发展商经营现金流含预售和土地，简化间接法不适用。",
    },
    noteRules: REALTY_NOTE_RULES,
    noteFields: REALTY_NOTE_FIELDS,
    featureNames: namesOf(REALTY_NOTE_RULES),
    evaluate: evaluateRealtyNotes,
    plug: plugRealty,
  },
  energy: {
    id: "energy",
    skipMain: {
      r6: "油气折耗按储量、电厂按管制资产，简化「期初+开支−折旧」不够。改测 E01。",
    },
    noteRules: ENERGY_NOTE_RULES,
    noteFields: ENERGY_NOTE_FIELDS,
    featureNames: namesOf(ENERGY_NOTE_RULES),
    evaluate: evaluateEnergyNotes,
    plug: plugEnergy,
  },
  platform: {
    id: "platform",
    skipMain: {
      r9: "平台存货近零。美团/腾讯的存货不是周转分析对象。",
    },
    noteRules: PLATFORM_NOTE_RULES,
    noteFields: PLATFORM_NOTE_FIELDS,
    featureNames: namesOf(PLATFORM_NOTE_RULES),
    evaluate: evaluatePlatformNotes,
    plug: plugPlatform,
  },
  telco: {
    id: "telco",
    skipMain: {
      r6: "网络资产走在建结转，折旧含无形摊销。改测 C01。",
      r4: "毛利把其他业务收入近似为成本，终端销售不是网络成本结构。",
    },
    noteRules: TELCO_NOTE_RULES,
    noteFields: TELCO_NOTE_FIELDS,
    featureNames: namesOf(TELCO_NOTE_RULES),
    evaluate: evaluateTelcoNotes,
    plug: plugTelco,
  },
};
