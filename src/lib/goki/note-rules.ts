import type { Issuer, NoteBooks, RuleDef, RuleResult, YearBooks } from "./types";

export const EMPTY_NOTES: NoteBooks = {
  oci: 0,
  buyback: 0,
  sbp: 0,
  nci: 0,
  otherEq: 0,
  ppeAdd: 0,
  ppeCip: 0,
  ppeDisp: 0,
  ppeImpair: 0,
  ppeFx: 0,
  ppeReval: 0,
  fxCash: 0,
  borrowDraw: 0,
  borrowRepay: 0,
  fxDebt: 0,
  deferredTaxAdj: 0,
  intan: 0,
  intanAdd: 0,
  intanAmort: 0,
  intanImpair: 0,
  rou: 0,
  rouAdd: 0,
  rouDep: 0,
  rouTerm: 0,
  prov: 0,
  provCharge: 0,
  provUse: 0,
  loansGross: 0,
  ecl: 0,
  eclCharge: 0,
  eclWriteoff: 0,
  eclRecover: 0,
  eclFx: 0,
  deposits: 0,
  nii: 0,
  ip: 0,
  ipAdd: 0,
  ipFv: 0,
  ipDisp: 0,
  ipTransfer: 0,
  devCost: 0,
  abandonUnwind: 0,
  ownCash: 0,
  marginCash: 0,
  clearingCash: 0,
  asharesCash: 0,
  marginFunds: 0,
  marginLiab: 0,
  clearingFunds: 0,
  clearingLiab: 0,
  stInvest: 0,
  fuelClause: 0,
  cl: 0,
  clAdd: 0,
  clRelease: 0,
  cip: 0,
  contractAsset: 0,
};

export function mergeNotes(base: NoteBooks | undefined, over?: Partial<NoteBooks>): NoteBooks {
  const out: NoteBooks = { ...EMPTY_NOTES, ...base };
  if (over) {
    (Object.keys(over) as (keyof NoteBooks)[]).forEach((k) => {
      const v = over[k];
      if (v != null && Number.isFinite(v)) out[k] = v;
    });
  }
  return out;
}

export const NOTE_RULES: RuleDef[] = [
  {
    id: "n0",
    code: "N01",
    name: "权益滚存（完整）",
    nameEn: "Equity rollforward",
    kind: "identity",
    strict: true,
    formula: "ΔRE − (NI − 分红 + OCI − 回购 + 股份支付 + NCI + 其他) = 0",
    explain: "截断式 R03 缺的项都在这里。附注填齐后仍非零，才是未解释缺口。",
  },
  {
    id: "n1",
    code: "N02",
    name: "固定资产滚存（完整）",
    nameEn: "PPE rollforward",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 购置 + 在建结转 − 折旧 − 处置 − 减值 + 汇兑 + 重估) = 0",
    explain: "截断式 R07 把购置以外的变动都当成断裂。附注 PPE 变动表就是这条。",
  },
  {
    id: "n2",
    code: "N03",
    name: "货币资金（含汇兑）",
    nameEn: "Cash including FX",
    kind: "identity",
    strict: true,
    formula: "Δ现金 − (现金净增加额 + 现金汇兑) = 0",
    explain: "港元/人民币集团的 R02 残差，多数是汇率，不是假现金。",
  },
  {
    id: "n3",
    code: "N04",
    name: "有息负债滚存",
    nameEn: "Borrowings rollforward",
    kind: "identity",
    strict: true,
    formula: "期末债务 − (期初 + 提取 − 偿还 + 汇兑) = 0",
    explain: "借款附注的闭合。并表购置进来的债务走提取，不要改主表。",
  },
  {
    id: "n4",
    code: "N05",
    name: "应交税（含递延调节）",
    nameEn: "Tax payable complete",
    kind: "identity",
    strict: true,
    formula: "期末应交 − (期初 + 所得税 − 已交 + 递延调节) = 0",
    explain: "把递延税、预缴、税务管辖差从 R08 里拆出来。",
  },
  {
    id: "n5",
    code: "N06",
    name: "无形资产滚存",
    nameEn: "Intangibles rollforward",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 购置 − 摊销 − 减值) = 0",
    explain: "资本开支进无形而不是 PPE 时，R07 会裂、这条应闭合。",
  },
  {
    id: "n6",
    code: "N07",
    name: "使用权资产滚存",
    nameEn: "ROU asset rollforward",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 增加 − 折旧 − 终止) = 0",
    explain: "HKFRS 16。记入固定资产的使用权在 N02 的重估/购置里对，不在这条。",
  },
  {
    id: "n7",
    code: "N08",
    name: "准备滚存",
    nameEn: "Provisions rollforward",
    kind: "identity",
    strict: true,
    formula: "期末 − (期初 + 计提 − 使用) = 0",
    explain: "弃置、重组、诉讼。油气公司的 PPE 缺口常和这条对上。",
  },
];

export const NOTE_FIELDS: {
  key: keyof NoteBooks;
  label: string;
  group: string;
}[] = [
  { key: "oci", label: "OCI", group: "n0" },
  { key: "buyback", label: "回购", group: "n0" },
  { key: "sbp", label: "股份支付", group: "n0" },
  { key: "nci", label: "少数股东", group: "n0" },
  { key: "otherEq", label: "其他权益", group: "n0" },
  { key: "ppeAdd", label: "购置", group: "n1" },
  { key: "ppeCip", label: "在建结转", group: "n1" },
  { key: "ppeDisp", label: "处置", group: "n1" },
  { key: "ppeImpair", label: "减值", group: "n1" },
  { key: "ppeFx", label: "汇兑", group: "n1" },
  { key: "ppeReval", label: "重估", group: "n1" },
  { key: "fxCash", label: "现金汇兑", group: "n2" },
  { key: "borrowDraw", label: "提取", group: "n3" },
  { key: "borrowRepay", label: "偿还", group: "n3" },
  { key: "fxDebt", label: "债务汇兑", group: "n3" },
  { key: "deferredTaxAdj", label: "递延调节", group: "n4" },
  { key: "intan", label: "无形期末", group: "n5" },
  { key: "intanAdd", label: "无形购置", group: "n5" },
  { key: "intanAmort", label: "摊销", group: "n5" },
  { key: "intanImpair", label: "无形减值", group: "n5" },
  { key: "rou", label: "使用权期末", group: "n6" },
  { key: "rouAdd", label: "租赁增加", group: "n6" },
  { key: "rouDep", label: "使用权折旧", group: "n6" },
  { key: "rouTerm", label: "终止", group: "n6" },
  { key: "prov", label: "准备期末", group: "n7" },
  { key: "provCharge", label: "计提", group: "n7" },
  { key: "provUse", label: "使用", group: "n7" },
];

export function nz(n: number, floor = 1): number {
  const a = Math.abs(n);
  return a < floor ? floor : a;
}

export function resultsOf(rules: RuleDef[], raw: { residual: number; scale: number; rel: number }[]): RuleResult[] {
  return rules.map((rule, i) => ({
    ruleId: rule.id,
    residual: raw[i]!.residual,
    scale: raw[i]!.scale,
    rel: raw[i]!.rel,
    priorRel: 0,
    yoy: raw[i]!.rel,
    kind: rule.kind,
  }));
}

export function equityGap(prior: YearBooks, curr: YearBooks, n: NoteBooks): number {
  return curr.re - prior.re - (curr.ni - curr.dividends + n.oci - n.buyback + n.sbp + n.nci + n.otherEq);
}

export function cashGap(prior: YearBooks, curr: YearBooks, n: NoteBooks): number {
  return curr.cash - prior.cash - (curr.netCf + n.fxCash);
}

export function debtGap(prior: YearBooks, curr: YearBooks, n: NoteBooks): number {
  return curr.stDebt + curr.ltDebt - (prior.stDebt + prior.ltDebt + n.borrowDraw - n.borrowRepay + n.fxDebt);
}

export function taxGap(prior: YearBooks, curr: YearBooks, n: NoteBooks): number {
  return curr.taxPay - (prior.taxPay + curr.tax - curr.taxPaid + n.deferredTaxAdj);
}

export function ppeGap(prior: YearBooks, curr: YearBooks, n: NoteBooks): number {
  return (
    curr.ppe -
    (prior.ppe + n.ppeAdd + n.ppeCip - curr.da - n.ppeDisp - n.ppeImpair + n.ppeFx + n.ppeReval)
  );
}

export function evaluateNotes(
  prior: YearBooks,
  curr: YearBooks,
  priorNotes: NoteBooks,
  currNotes: NoteBooks,
): RuleResult[] {
  const n = currNotes;
  const p = priorNotes;
  const r0 = equityGap(prior, curr, n);
  const r1 = ppeGap(prior, curr, n);
  const r2 = cashGap(prior, curr, n);
  const r3 = debtGap(prior, curr, n);
  const r4 = taxGap(prior, curr, n);
  const r5 = n.intan - (p.intan + n.intanAdd - n.intanAmort - n.intanImpair);
  const r6 = n.rou - (p.rou + n.rouAdd - n.rouDep - n.rouTerm);
  const r7 = n.prov - (p.prov + n.provCharge - n.provUse);

  const floor = Math.max(nz(curr.ni, 10), 10);
  const raw = [
    { residual: r0, scale: nz(Math.abs(curr.ni), floor), rel: r0 / nz(Math.abs(curr.ni), floor) },
    { residual: r1, scale: nz(curr.ppe, floor), rel: r1 / nz(curr.ppe, floor) },
    { residual: r2, scale: nz(Math.abs(curr.netCf), floor), rel: r2 / nz(Math.abs(curr.netCf), floor) },
    {
      residual: r3,
      scale: nz(curr.stDebt + curr.ltDebt, floor),
      rel: r3 / nz(curr.stDebt + curr.ltDebt, floor),
    },
    { residual: r4, scale: nz(Math.abs(curr.tax), floor), rel: r4 / nz(Math.abs(curr.tax), floor) },
    { residual: r5, scale: nz(n.intan, floor), rel: r5 / nz(n.intan, floor) },
    { residual: r6, scale: nz(n.rou, floor), rel: r6 / nz(n.rou, floor) },
    { residual: r7, scale: nz(n.prov, floor), rel: r7 / nz(n.prov, floor) },
  ];
  return resultsOf(NOTE_RULES, raw);
}

export function noteFeatures(issuer: Issuer, overlay?: Partial<NoteBooks>): {
  features: number[];
  rules: RuleResult[];
  notes: NoteBooks;
} {
  const notes = mergeNotes(issuer.currNotes, overlay);
  const priorNotes = mergeNotes(issuer.priorNotes);
  const rules = evaluateNotes(issuer.prior, issuer.curr, priorNotes, notes);
  const feats: number[] = [];
  for (const r of rules) {
    feats.push(Math.sign(r.residual) * Math.log1p(Math.abs(r.residual)));
    feats.push(r.rel);
  }
  return { features: feats, rules, notes };
}

export const N_NOTE_FEATURES = NOTE_RULES.length * 2;

export const NOTE_FEATURE_NAMES: string[] = NOTE_RULES.flatMap((r) => [
  `${r.code}_resid_log`,
  `${r.code}_rel`,
]);

export function maxNoteAbsRel(rules: RuleResult[]): number {
  let m = 0;
  for (const r of rules) {
    if (r.skipped) continue;
    if (r.kind === "analytic") continue;
    m = Math.max(m, Math.abs(r.rel));
  }
  return m;
}

/** Attribute truncated R03/R07 residual into catch-all note lines. */
export function plugTruncation(issuer: Issuer, notes: NoteBooks): NoteBooks {
  const n = { ...notes };
  const { curr, prior } = issuer;
  const dRe = curr.re - prior.re;
  const eqExplained = curr.ni - curr.dividends + n.oci - n.buyback + n.sbp + n.nci + n.otherEq;
  n.otherEq += dRe - eqExplained;
  const ppeExplained =
    prior.ppe + n.ppeAdd + n.ppeCip - curr.da - n.ppeDisp - n.ppeImpair + n.ppeFx + n.ppeReval;
  const gap = curr.ppe - ppeExplained;
  if (gap < 0) n.ppeDisp += -gap;
  else n.ppeCip += gap;
  n.fxCash += curr.cash - prior.cash - (curr.netCf + n.fxCash);
  const dGap =
    curr.stDebt + curr.ltDebt - (prior.stDebt + prior.ltDebt + n.borrowDraw - n.borrowRepay + n.fxDebt);
  if (dGap >= 0) n.borrowDraw += dGap;
  else n.borrowRepay += -dGap;
  n.deferredTaxAdj += curr.taxPay - (prior.taxPay + curr.tax - curr.taxPaid + n.deferredTaxAdj);
  return n;
}
