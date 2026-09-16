export const INDUSTRIES = [
  "bank",
  "realty",
  "mfg",
  "pharma",
  "cons",
  "energy",
  "tech",
  "trans",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRY_LABEL: Record<Industry, string> = {
  bank: "金融",
  realty: "地产",
  mfg: "制造",
  pharma: "医药",
  cons: "消费",
  energy: "能源",
  tech: "科技",
  trans: "交运",
};

export const RULE_PACKS = ["generic", "bank", "exchange", "realty", "energy", "platform"] as const;
export type RulePack = (typeof RULE_PACKS)[number];

export const PACK_LABEL: Record<RulePack, string> = {
  generic: "通用",
  bank: "银行",
  exchange: "交易所",
  realty: "地产",
  energy: "能源",
  platform: "平台",
};

export const SIZE_LABEL = {
  mega: "超大盘",
  large: "大盘",
  mid: "中盘",
  small: "小盘",
} as const;

export type SizeTier = keyof typeof SIZE_LABEL;

export type InjectKind = "clean" | "rounding" | "reclass" | "true_error";

export type ErrorKind =
  | "cash_hole"
  | "bs_gap"
  | "re_break"
  | "fake_rev"
  | "ppe_over"
  | "tax_break"
  | "note_eq"
  | "note_ppe"
  | "note_cash"
  | "note_debt"
  | "note_intan"
  | "note_rou"
  | "note_ecl"
  | "note_loan"
  | "note_ip"
  | "note_margin"
  | "note_aro";

/** Amounts in 万元. */
export interface YearBooks {
  revenue: number;
  cogs: number;
  gp: number;
  opex: number;
  da: number;
  ebit: number;
  interest: number;
  pretax: number;
  tax: number;
  ni: number;
  dividends: number;
  cash: number;
  ar: number;
  inv: number;
  ppe: number;
  otherCa: number;
  otherNca: number;
  ap: number;
  stDebt: number;
  taxPay: number;
  ltDebt: number;
  otherL: number;
  shareCap: number;
  re: number;
  cfo: number;
  cfi: number;
  cff: number;
  netCf: number;
  capex: number;
  taxPaid: number;
}

export interface Issuer {
  id: string;
  ticker: string;
  name: string;
  industry: Industry;
  size: SizeTier;
  inject: InjectKind;
  errorKinds: ErrorKind[];
  prior: YearBooks;
  curr: YearBooks;
  source?: "synthetic" | "hkex";
  currency?: "HKD" | "RMB" | "USD";
  periodLabel?: string;
  unitLabel?: string;
  caveats?: string[];
  priorNotes?: NoteBooks;
  currNotes?: NoteBooks;
  pack?: RulePack;
}

/** Note-level rollforward lines. Amounts in 万元. Stocks are period-end. */
export interface NoteBooks {
  oci: number;
  buyback: number;
  sbp: number;
  nci: number;
  otherEq: number;
  ppeAdd: number;
  ppeCip: number;
  ppeDisp: number;
  ppeImpair: number;
  ppeFx: number;
  ppeReval: number;
  fxCash: number;
  borrowDraw: number;
  borrowRepay: number;
  fxDebt: number;
  deferredTaxAdj: number;
  intan: number;
  intanAdd: number;
  intanAmort: number;
  intanImpair: number;
  rou: number;
  rouAdd: number;
  rouDep: number;
  rouTerm: number;
  prov: number;
  provCharge: number;
  provUse: number;
  loansGross: number;
  ecl: number;
  eclCharge: number;
  eclWriteoff: number;
  eclRecover: number;
  eclFx: number;
  deposits: number;
  nii: number;
  ip: number;
  ipAdd: number;
  ipFv: number;
  ipDisp: number;
  ipTransfer: number;
  devCost: number;
  abandonUnwind: number;
  ownCash: number;
  marginCash: number;
  clearingCash: number;
  asharesCash: number;
  marginFunds: number;
  marginLiab: number;
  clearingFunds: number;
  clearingLiab: number;
  stInvest: number;
  fuelClause: number;
}

export interface RuleDef {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  kind: "identity" | "analytic";
  strict: boolean;
  formula: string;
  explain: string;
}

export interface RuleResult {
  ruleId: string;
  residual: number;
  scale: number;
  rel: number;
  yoy: number;
  priorRel: number;
  skipped?: boolean;
  skipReason?: string;
  kind?: "identity" | "analytic";
}

export type FeatureRow = Float32Array;

export interface ScoredIssuer {
  issuer: Issuer;
  rules: RuleResult[];
  features: number[];
  pError: number;
  aeErr: number;
  cashPred: number;
  cashResidual: number;
  attribution: { name: string; value: number }[];
  band: "exception" | "review" | "pass";
  maxRel?: number;
}

export interface CloserScore {
  issuer: Issuer;
  notes: NoteBooks;
  rules: RuleResult[];
  features: number[];
  pOpen: number;
  aeErr: number;
  attribution: { name: string; value: number }[];
  band: "exception" | "review" | "pass";
  maxRel: number;
}

export interface CloserEngagement {
  seed: number;
  backend: string;
  issuers: CloserScore[];
  logs: EpochLog[];
  metrics: Metrics;
  routine: string;
  golden: string;
  featureNames: string[];
}

export interface EpochLog {
  epoch: number;
  trainBce: number;
  valBce: number;
  aeMse: number;
  regMse: number;
}

export interface Metrics {
  nTrain: number;
  nVal: number;
  nTest: number;
  testAuc: number;
  testAp: number;
  testAcc: number;
  precision: number;
  recall: number;
  nException: number;
  nTrueError: number;
  nRounding: number;
  nReclass: number;
  nClean: number;
  paramCount: number;
  weightChecksum: string;
  trainMs: number;
}

export interface Engagement {
  seed: number;
  backend: string;
  issuers: ScoredIssuer[];
  logs: EpochLog[];
  metrics: Metrics;
  routine: string;
  golden: string;
  featureNames: string[];
}

export interface EstimateScore {
  predicted: number;
  actual: number;
  residual: number;
  pOutlier: number;
  band: "exception" | "review" | "pass";
  features: number[];
  names: string[];
}

export interface PackGuess {
  pack: RulePack;
  probs: Record<RulePack, number>;
  assigned: RulePack;
  match: boolean;
}

export interface CompletenessHit {
  id: string;
  label: string;
  p: number;
  empty: boolean;
  rel: number;
  related: string;
  band: "exception" | "review" | "pass";
}

export interface CompletenessScore {
  pMissing: number;
  hits: CompletenessHit[];
  missing: CompletenessHit[];
  band: "exception" | "review" | "pass";
  features: number[];
}
