import {
  EMPTY_NOTES,
  evaluateNotes,
  mergeNotes,
  NOTE_FIELDS,
  NOTE_RULES,
  plugTruncation,
} from "./note-rules";
import { evaluateRules, RULES } from "./rules";
import type {
  Industry,
  Issuer,
  NoteBooks,
  RuleDef,
  RulePack,
  RuleResult,
  YearBooks,
} from "./types";
import { INDUSTRY_LABEL, PACK_LABEL } from "./types";

export { PACK_LABEL };

export function sectorLabel(issuer: { pack?: RulePack; industry: Industry; ticker?: string }): string {
  const pack = packOf(issuer);
  if (pack === "generic") return INDUSTRY_LABEL[issuer.industry];
  return PACK_LABEL[pack];
}

export function packOf(issuer: {
  pack?: RulePack;
  industry?: string;
  ticker?: string;
}): RulePack {
  if (issuer.pack) return issuer.pack;
  if (issuer.ticker === "00388") return "exchange";
  if (issuer.industry === "bank") return "bank";
  return "generic";
}

/** Main-table rule ids turned off for banks (manufacturing identities). */
const BANK_SKIP_MAIN = new Set(["r4", "r5", "r6", "r8", "r9"]); // R05 GP, R06 CFO, R07 PPE, R09 AR, R10 inv
const BANK_SKIP_REASON: Record<string, string> = {
  r4: "银行没有营业成本/毛利。收入是净经营收入。",
  r5: "银行经营现金流含贷款与存款变动，简化间接法不适用。",
  r6: "PPE 相对总资产可忽略，成本滚存不是银行勾稽。",
  r8: "贷款÷净经营收入是倍数不是应收周转。改看贷存比 B03。",
  r9: "银行存货近零。周转分析改看贷存比 B03。",
};

export const BANK_NOTE_RULES: RuleDef[] = [
  {
    id: "n0",
    code: "N01",
    name: "权益滚存（完整）",
    nameEn: "Equity rollforward",
    kind: "identity",
    strict: true,
    formula: "ΔRE − (NI − 分红 + OCI − 回购 + 股份支付 + NCI + 其他) = 0",
    explain:
      "银行 SCE 还含 FVOCI、外汇折算、回购。填齐后仍非零才是未解释缺口。",
  },
  {
    id: "b1",
    code: "B01",
    name: "ECL 准备滚存",
    nameEn: "ECL allowance rollforward",
    kind: "identity",
    strict: true,
    formula: "期末准备 − (期初 + 计提 − 核销 + 收回 + 汇兑) = 0",
    explain:
      "HKFRS 9。计提走损益，核销走准备，汇兑/转让/HFS 进其他。这是银行最硬的附注恒等。",
  },
  {
    id: "n2",
    code: "N03",
    name: "货币资金（含汇兑）",
    nameEn: "Cash including FX",
    kind: "identity",
    strict: true,
    formula: "Δ现金 − (现金净增加额 + 现金汇兑) = 0",
    explain: "银行「现金」常是央行结余，和中国底稿货币资金不是同一口径。",
  },
  {
    id: "n3",
    code: "N04",
    name: "批发负债滚存",
    nameEn: "Wholesale funding rollforward",
    kind: "identity",
    strict: true,
    formula: "期末债务 − (期初 + 提取 − 偿还 + 汇兑) = 0",
    explain: "已发行债务、同业拆入。客户存款不在这条，在 B03。",
  },
  {
    id: "n4",
    code: "N05",
    name: "应交税（含递延调节）",
    nameEn: "Tax payable complete",
    kind: "identity",
    strict: true,
    formula: "期末应交 − (期初 + 所得税 − 已交 + 递延调节) = 0",
    explain: "多辖区税务和递延税从简化 R08 里拆出来。",
  },
  {
    id: "b2",
    code: "B02",
    name: "贷款净额恒等",
    nameEn: "Gross loans − ECL = net",
    kind: "identity",
    strict: true,
    formula: "贷款总额 − ECL 准备 − 客户贷款净额 = 0",
    explain:
      "资产负债表「客户贷款」是净额。总额和准备必须能从信贷附注加回来。对不上就是取数口径错了。",
  },
  {
    id: "b3",
    code: "B03",
    name: "贷存比变动",
    nameEn: "Advances-to-deposits",
    kind: "analytic",
    strict: false,
    formula: "本年净贷款÷存款 − 上年净贷款÷存款",
    explain:
      "分析性程序，不是恒等。恒生 2025 年报写明 61.4%（上年 64.7%）。大幅偏离同业才上升。",
  },
  {
    id: "b4",
    code: "B04",
    name: "ECL 覆盖率变动",
    nameEn: "ECL coverage change",
    kind: "analytic",
    strict: false,
    formula: "本年 ECL÷贷款总额 − 上年",
    explain:
      "分析性。覆盖率跳升常见于阶段迁徙或模型更新，要对照计提和核销，不当造假。",
  },
];

export const BANK_NOTE_FIELDS: {
  key: keyof NoteBooks;
  label: string;
  group: string;
}[] = [
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

export const BANK_FEATURE_NAMES: string[] = BANK_NOTE_RULES.flatMap((r) => [
  `${r.code}_resid_log`,
  `${r.code}_rel`,
]);

function nz(n: number, floor = 1): number {
  const a = Math.abs(n);
  return a < floor ? floor : a;
}

export function evaluateBankNotes(
  prior: YearBooks,
  curr: YearBooks,
  priorNotes: NoteBooks,
  currNotes: NoteBooks,
): RuleResult[] {
  const n = currNotes;
  const p = priorNotes;
  const dRe = curr.re - prior.re;
  const r0 = dRe - (curr.ni - curr.dividends + n.oci - n.buyback + n.sbp + n.nci + n.otherEq);
  const r1 = n.ecl - (p.ecl + n.eclCharge - n.eclWriteoff + n.eclRecover + n.eclFx);
  const r2 = curr.cash - prior.cash - (curr.netCf + n.fxCash);
  const r3 =
    curr.stDebt +
    curr.ltDebt -
    (prior.stDebt + prior.ltDebt + n.borrowDraw - n.borrowRepay + n.fxDebt);
  const r4 = curr.taxPay - (prior.taxPay + curr.tax - curr.taxPaid + n.deferredTaxAdj);
  const r5 = n.loansGross - n.ecl - curr.ar;
  const dep = nz(n.deposits, 1);
  const priorDep = nz(p.deposits, 1);
  const r6 = curr.ar / dep - prior.ar / priorDep;
  const r7 = n.loansGross > 0 && p.loansGross > 0 ? n.ecl / n.loansGross - p.ecl / p.loansGross : 0;

  const floor = Math.max(nz(curr.ni, 10), 10);
  const raw = [
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
  ];

  return BANK_NOTE_RULES.map((rule, i) => ({
    ruleId: rule.id,
    residual: raw[i]!.residual,
    scale: raw[i]!.scale,
    rel: raw[i]!.rel,
    priorRel: 0,
    yoy: raw[i]!.rel,
    kind: rule.kind,
  }));
}

export function evaluateMainRules(issuer: Issuer): RuleResult[] {
  const rules = evaluateRules(issuer.prior, issuer.curr);
  const pack = packOf(issuer);
  return rules.map((r, i) => {
    const def = RULES[i]!;
    const out: RuleResult = { ...r, kind: def.kind };
    if (pack === "bank" && BANK_SKIP_MAIN.has(r.ruleId)) {
      out.skipped = true;
      out.skipReason = BANK_SKIP_REASON[r.ruleId];
      out.residual = 0;
      out.rel = 0;
      out.yoy = 0;
    }
    return out;
  });
}

export function noteRulesFor(pack: RulePack): RuleDef[] {
  return pack === "bank" ? BANK_NOTE_RULES : NOTE_RULES;
}

export function noteFieldsFor(pack: RulePack) {
  return pack === "bank" ? BANK_NOTE_FIELDS : NOTE_FIELDS;
}

export function packNoteFeatures(
  issuer: Issuer,
  overlay?: Partial<NoteBooks>,
): { features: number[]; rules: RuleResult[]; notes: NoteBooks; names: string[] } {
  const notes = mergeNotes(issuer.currNotes, overlay);
  const priorNotes = mergeNotes(issuer.priorNotes);
  const pack = packOf(issuer);
  const rules =
    pack === "bank"
      ? evaluateBankNotes(issuer.prior, issuer.curr, priorNotes, notes)
      : evaluateNotes(issuer.prior, issuer.curr, priorNotes, notes);
  const feats: number[] = [];
  for (const r of rules) {
    const rel = r.skipped ? 0 : r.rel;
    const resid = r.skipped ? 0 : r.residual;
    feats.push(Math.sign(resid) * Math.log1p(Math.abs(resid)));
    feats.push(rel);
  }
  return {
    features: feats,
    rules,
    notes,
    names: pack === "bank" ? BANK_FEATURE_NAMES : NOTE_RULES.flatMap((r) => [`${r.code}_resid_log`, `${r.code}_rel`]),
  };
}

function plugBank(issuer: Issuer, notes: NoteBooks): NoteBooks {
  const n = { ...notes };
  const { curr, prior } = issuer;
  const priorNotes = mergeNotes(issuer.priorNotes);
  const dRe = curr.re - prior.re;
  const eqExplained = curr.ni - curr.dividends + n.oci - n.buyback + n.sbp + n.nci + n.otherEq;
  n.otherEq += dRe - eqExplained;
  n.loansGross = curr.ar + n.ecl;
  n.eclFx += n.ecl - (priorNotes.ecl + n.eclCharge - n.eclWriteoff + n.eclRecover + n.eclFx);
  const cashGap = curr.cash - prior.cash - (curr.netCf + n.fxCash);
  n.fxCash += cashGap;
  const debtGap =
    curr.stDebt +
    curr.ltDebt -
    (prior.stDebt + prior.ltDebt + n.borrowDraw - n.borrowRepay + n.fxDebt);
  if (debtGap >= 0) n.borrowDraw += debtGap;
  else n.borrowRepay += -debtGap;
  n.deferredTaxAdj += curr.taxPay - (prior.taxPay + curr.tax - curr.taxPaid + n.deferredTaxAdj);
  if (n.deposits === 0) n.deposits = Math.max(0, curr.otherL);
  return n;
}

export function plugPackTruncation(issuer: Issuer, notes: NoteBooks): NoteBooks {
  if (packOf(issuer) === "bank") return plugBank(issuer, notes);
  return plugTruncation(issuer, notes);
}

export { EMPTY_NOTES };
