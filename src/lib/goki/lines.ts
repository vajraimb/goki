import type { RulePack, YearBooks } from "./types";

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

export const BANK_IS_LINES: Line[] = [
  { key: "revenue", label: "净经营收入" },
  { key: "opex", label: "经营支出" },
  { key: "da", label: "折旧" },
  { key: "ebit", label: "经营利润" },
  { key: "pretax", label: "除税前利润", total: true },
  { key: "tax", label: "税项" },
  { key: "ni", label: "除税后利润", total: true },
  { key: "dividends", label: "股息" },
];

export const BANK_BS_LINES: Line[] = [
  { key: "cash", label: "现金及央行结余" },
  { key: "ar", label: "客户贷款（净额）" },
  { key: "otherCa", label: "其他流动资产" },
  { key: "ppe", label: "物业及设备" },
  { key: "otherNca", label: "金融投资及其他" },
  { key: "stDebt", label: "短期批发负债" },
  { key: "ltDebt", label: "长期批发负债" },
  { key: "otherL", label: "客户存款及其他负债" },
  { key: "shareCap", label: "股本" },
  { key: "re", label: "储备及未分配利润" },
];

export const CF_LINES: Line[] = [
  { key: "cfo", label: "经营活动现金流" },
  { key: "cfi", label: "投资活动现金流" },
  { key: "cff", label: "筹资活动现金流" },
  { key: "netCf", label: "现金净增加额", total: true },
  { key: "capex", label: "资本开支" },
  { key: "taxPaid", label: "已交所得税" },
];

export function linesFor(pack: RulePack | undefined): {
  is: Line[];
  bs: Line[];
  cf: Line[];
} {
  if (pack === "bank") return { is: BANK_IS_LINES, bs: BANK_BS_LINES, cf: CF_LINES };
  if (pack === "exchange") {
    return {
      is: [
        { key: "revenue", label: "收入及其他收益" },
        { key: "opex", label: "经营开支" },
        { key: "da", label: "折旧及摊销" },
        { key: "ebit", label: "经营溢利" },
        { key: "pretax", label: "除税前溢利", total: true },
        { key: "tax", label: "税项" },
        { key: "ni", label: "股东应占溢利", total: true },
        { key: "dividends", label: "股息" },
      ],
      bs: [
        { key: "cash", label: "现金（含保证金）" },
        { key: "ar", label: "应收及结算" },
        { key: "otherCa", label: "其他流动资产" },
        { key: "ppe", label: "物业及设备" },
        { key: "otherNca", label: "其他非流动资产" },
        { key: "ap", label: "应付及结算" },
        { key: "otherL", label: "保证金及结算负债" },
        { key: "shareCap", label: "股本" },
        { key: "re", label: "储备" },
      ],
      cf: CF_LINES,
    };
  }
  if (pack === "realty") {
    return {
      is: IS_LINES,
      bs: [
        { key: "cash", label: "银行存款及现金" },
        { key: "ar", label: "贸易及其他应收" },
        { key: "inv", label: "待售物业" },
        { key: "otherCa", label: "其他流动资产" },
        { key: "ppe", label: "物业厂房及设备" },
        { key: "otherNca", label: "投资物业及其他" },
        { key: "ap", label: "贸易及其他应付" },
        { key: "stDebt", label: "短期借款" },
        { key: "taxPay", label: "应交税" },
        { key: "ltDebt", label: "长期借款" },
        { key: "otherL", label: "其他负债" },
        { key: "shareCap", label: "股本" },
        { key: "re", label: "储备" },
      ],
      cf: CF_LINES,
    };
  }
  if (pack === "telco") {
    return {
      is: [
        { key: "revenue", label: "营运收入" },
        { key: "cogs", label: "其他业务成本" },
        { key: "gp", label: "主营业务收入", total: true },
        { key: "opex", label: "营运支出" },
        { key: "da", label: "折旧及摊销" },
        { key: "ebit", label: "营运利润" },
        { key: "interest", label: "财务费用" },
        { key: "pretax", label: "除税前利润", total: true },
        { key: "tax", label: "所得税" },
        { key: "ni", label: "股东应占利润", total: true },
        { key: "dividends", label: "股息" },
      ],
      bs: [
        { key: "cash", label: "现金及现金等价物" },
        { key: "ar", label: "应收账款" },
        { key: "inv", label: "存货" },
        { key: "otherCa", label: "其他流动资产" },
        { key: "ppe", label: "固定资产" },
        { key: "otherNca", label: "在建/无形及其他" },
        { key: "ap", label: "应付账款及应计" },
        { key: "stDebt", label: "租赁负债（流动）" },
        { key: "taxPay", label: "应付所得税" },
        { key: "ltDebt", label: "非流动负债" },
        { key: "otherL", label: "合同负债及其他" },
        { key: "shareCap", label: "股本" },
        { key: "re", label: "储备及未分配利润" },
      ],
      cf: CF_LINES,
    };
  }
  return { is: IS_LINES, bs: BS_LINES, cf: CF_LINES };
}
