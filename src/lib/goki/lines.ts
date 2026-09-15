import type { YearBooks } from "./types";

export type Line = { key: keyof YearBooks; label: string; total?: boolean };

export const IS_LINES: Line[] = [
  { key: "revenue", label: "营业收入" },
  { key: "cogs", label: "营业成本" },
  { key: "gp", label: "毛利", total: true },
  { key: "opex", label: "期间费用" },
  { key: "da", label: "折旧" },
  { key: "ebit", label: "营业利润" },
  { key: "interest", label: "财务费用" },
  { key: "pretax", label: "利润总额", total: true },
  { key: "tax", label: "所得税费用" },
  { key: "ni", label: "净利润", total: true },
  { key: "dividends", label: "分红" },
];

export const BS_LINES: Line[] = [
  { key: "cash", label: "货币资金" },
  { key: "ar", label: "应收账款" },
  { key: "inv", label: "存货" },
  { key: "otherCa", label: "其他流动资产" },
  { key: "ppe", label: "固定资产" },
  { key: "otherNca", label: "其他非流动资产" },
  { key: "ap", label: "应付账款" },
  { key: "stDebt", label: "短期借款" },
  { key: "taxPay", label: "应交税费" },
  { key: "ltDebt", label: "长期借款" },
  { key: "otherL", label: "其他负债" },
  { key: "shareCap", label: "股本" },
  { key: "re", label: "未分配利润" },
];

export const CF_LINES: Line[] = [
  { key: "cfo", label: "经营活动现金流" },
  { key: "cfi", label: "投资活动现金流" },
  { key: "cff", label: "筹资活动现金流" },
  { key: "netCf", label: "现金净增加额", total: true },
  { key: "capex", label: "资本开支" },
  { key: "taxPaid", label: "已交所得税" },
];
