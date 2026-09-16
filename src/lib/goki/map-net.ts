import {
  checksum,
  makeSoftmax,
  softmaxArgmax,
  softmaxForward,
  softmaxParamCount,
  softmaxSgdStep,
  type SoftmaxNet,
} from "./nn";
import { mergeNotes } from "./note-rules";
import { mulberry32, shuffleInPlace } from "./rng";
import type { Issuer, NoteBooks, RulePack, YearBooks } from "./types";
import { RULE_PACKS } from "./types";

export const MAP_SEED = 53;

export const MAP_SECTIONS = ["bs", "is", "cf", "note"] as const;
export type MapSection = (typeof MAP_SECTIONS)[number];

export type MapSink =
  | { book: "year"; key: keyof YearBooks }
  | { book: "note"; key: keyof NoteBooks }
  | { book: "none" };

export interface MapTarget {
  id: string;
  label: string;
  labelEn: string;
  packs: RulePack[];
  section: MapSection;
  sink: MapSink;
}

export const MAP_TARGETS: MapTarget[] = [
  { id: "cash", label: "货币资金 / 央行结余", labelEn: "cash", packs: [...RULE_PACKS], section: "bs", sink: { book: "year", key: "cash" } },
  { id: "loans_net", label: "客户贷款净额", labelEn: "net loans", packs: ["bank"], section: "bs", sink: { book: "year", key: "ar" } },
  { id: "loans_gross", label: "贷款总额", labelEn: "gross loans", packs: ["bank"], section: "note", sink: { book: "note", key: "loansGross" } },
  { id: "ecl", label: "ECL 准备", labelEn: "ECL allowance", packs: ["bank"], section: "note", sink: { book: "note", key: "ecl" } },
  { id: "ecl_charge", label: "ECL 计提", labelEn: "ECL charge", packs: ["bank"], section: "note", sink: { book: "note", key: "eclCharge" } },
  { id: "deposits", label: "客户存款", labelEn: "customer deposits", packs: ["bank"], section: "bs", sink: { book: "note", key: "deposits" } },
  { id: "ar", label: "应收账款", labelEn: "trade receivables", packs: ["generic", "platform", "energy", "realty", "telco"], section: "bs", sink: { book: "year", key: "ar" } },
  { id: "inv", label: "存货 / 待售物业", labelEn: "inventory / properties for sale", packs: ["generic", "realty", "platform"], section: "bs", sink: { book: "year", key: "inv" } },
  { id: "ip", label: "投资物业", labelEn: "investment property", packs: ["realty"], section: "note", sink: { book: "note", key: "ip" } },
  { id: "ip_fv", label: "投资物业公允变动", labelEn: "IP fair-value change", packs: ["realty"], section: "note", sink: { book: "note", key: "ipFv" } },
  { id: "ip_add", label: "投资物业购置/转入", labelEn: "IP additions", packs: ["realty"], section: "note", sink: { book: "note", key: "ipAdd" } },
  { id: "dev_cost", label: "开发成本", labelEn: "development cost", packs: ["realty"], section: "note", sink: { book: "note", key: "devCost" } },
  { id: "ppe", label: "固定资产 / 油气资产", labelEn: "PPE", packs: ["generic", "energy", "platform", "realty", "telco"], section: "bs", sink: { book: "year", key: "ppe" } },
  { id: "ppe_add", label: "资本开支 / 购置", labelEn: "capex / additions", packs: [...RULE_PACKS], section: "note", sink: { book: "note", key: "ppeAdd" } },
  { id: "aro", label: "弃置准备", labelEn: "decommissioning provision", packs: ["energy"], section: "note", sink: { book: "note", key: "prov" } },
  { id: "aro_charge", label: "弃置新井/修订", labelEn: "ARO additions / revisions", packs: ["energy"], section: "note", sink: { book: "note", key: "provCharge" } },
  { id: "aro_unwind", label: "弃置折现释放", labelEn: "ARO accretion", packs: ["energy"], section: "note", sink: { book: "note", key: "abandonUnwind" } },
  { id: "rou", label: "使用权资产", labelEn: "right-of-use asset", packs: ["generic", "platform", "energy", "telco"], section: "note", sink: { book: "note", key: "rou" } },
  { id: "margin_cash", label: "保证金现金", labelEn: "margin cash", packs: ["exchange"], section: "note", sink: { book: "note", key: "marginCash" } },
  { id: "own_cash", label: "公司自有现金", labelEn: "own cash", packs: ["exchange"], section: "note", sink: { book: "note", key: "ownCash" } },
  { id: "st_invest", label: "定期 / 理财", labelEn: "term deposits / ST investments", packs: ["platform", "generic", "telco"], section: "note", sink: { book: "note", key: "stInvest" } },
  { id: "buyback", label: "股份回购", labelEn: "share buyback", packs: ["platform", "generic", "bank"], section: "note", sink: { book: "note", key: "buyback" } },
  { id: "oci", label: "其他综合收益", labelEn: "OCI", packs: [...RULE_PACKS], section: "note", sink: { book: "note", key: "oci" } },
  { id: "revenue", label: "营业收入 / 净经营收入", labelEn: "revenue", packs: [...RULE_PACKS], section: "is", sink: { book: "year", key: "revenue" } },
  { id: "ni", label: "净利润", labelEn: "net profit", packs: [...RULE_PACKS], section: "is", sink: { book: "year", key: "ni" } },
  { id: "cfo", label: "经营现金流", labelEn: "operating cash flow", packs: [...RULE_PACKS], section: "cf", sink: { book: "year", key: "cfo" } },
  { id: "fuel", label: "燃料条款", labelEn: "fuel clause", packs: ["energy"], section: "note", sink: { book: "note", key: "fuelClause" } },
  { id: "cl", label: "合同负债", labelEn: "contract liabilities", packs: ["platform", "telco"], section: "note", sink: { book: "note", key: "cl" } },
  { id: "cl_release", label: "合同负债结转收入", labelEn: "CL recognised as revenue", packs: ["platform", "telco"], section: "note", sink: { book: "note", key: "clRelease" } },
  { id: "cl_add", label: "本年预收 / 合同负债增加", labelEn: "CL additions / billings", packs: ["platform", "telco"], section: "note", sink: { book: "note", key: "clAdd" } },
  { id: "cip", label: "在建工程", labelEn: "construction in progress", packs: ["telco", "energy", "generic"], section: "note", sink: { book: "note", key: "cip" } },
  { id: "ca", label: "合同资产", labelEn: "contract assets", packs: ["telco"], section: "note", sink: { book: "note", key: "contractAsset" } },
  { id: "intan", label: "无形资产 / 频谱", labelEn: "intangibles / spectrum", packs: ["telco", "platform"], section: "note", sink: { book: "note", key: "intan" } },
  { id: "sbp", label: "股份支付（权益结算）", labelEn: "share-based payment", packs: ["platform", "generic"], section: "note", sink: { book: "note", key: "sbp" } },
  { id: "other", label: "其他 / 不进规范科目", labelEn: "other", packs: [...RULE_PACKS], section: "bs", sink: { book: "none" } },
];

export const LEXICON = [
  "cash", "equivalent", "central", "央行", "货币资金", "现金",
  "loan", "advance", "贷款", "垫款", "gross", "总额",
  "expected credit", "ecl", "预期信用",
  "deposit", "存款", "customer", "客户",
  "investment property", "投资物业", "fair value", "公允",
  "inventor", "存货", "for sale", "待售",
  "plant and equipment", "固定资产", "物业及设备", "油气", "fixed asset",
  "decommission", "dismantlement", "弃置", "provision for",
  "right-of-use", "right of use", "使用权",
  "margin", "保证金", "clearing", "clearing house", "结算",
  "term deposit", "定期", "理财", "short-term invest", "短期投资", "短期理财",
  "buy-back", "buyback", "repurchase", "回购",
  "other comprehensive", "oci", "其他综合",
  "net operating", "营业收入", "revenue", "净经营",
  "profit after", "净利润", "除税后",
  "operating cash", "经营活动",
  "capital expend", "资本开支", "capex", "购置",
  "charge", "计提", "allowance",
  "unwind", "accretion", "折现",
  "fuel", "燃料", "条款",
  "contract liab", "合同负债", "deferred revenue", "递延收入", "virtual item", "预收",
  "结转", "recognised from opening", "carried-forward",
  "share-based", "share based", "股份支付", "股份酬金", "equity-settled",
  "construction in progress", "在建工程", "在建",
  "contract asset", "合同资产",
  "spectrum", "频谱", "土地使用权", "intangible",
  "development cost", "开发成本", "additions to investment", "addition", "开发转入",
  "转入", "transfer from",
  "receivable", "应收", "participant", "参与者",
  "corporate funds", "公司资金", "准备", "financial invest",
  "goodwill", "商誉", "derivative", "衍生",
] as const;

const K = MAP_TARGETS.length;
const PACK_N = RULE_PACKS.length;
const SEC_N = MAP_SECTIONS.length;
export const MAP_IN = LEXICON.length + PACK_N + SEC_N + 1;
const HID = 40;

export interface MapLine {
  ticker: string;
  issuer: string;
  pack: RulePack;
  section: MapSection;
  label: string;
  target: string;
}

/** Holdout: real FY2025 bilingual line names. Not used in training. */
export const HK_LINES: MapLine[] = [
  { ticker: "00005", issuer: "汇丰控股", pack: "bank", section: "bs", label: "Cash and balances at central banks", target: "cash" },
  { ticker: "00005", issuer: "汇丰控股", pack: "bank", section: "bs", label: "央行结余及现金", target: "cash" },
  { ticker: "00005", issuer: "汇丰控股", pack: "bank", section: "bs", label: "Loans and advances to customers", target: "loans_net" },
  { ticker: "00005", issuer: "汇丰控股", pack: "bank", section: "note", label: "Gross loans and advances to customers", target: "loans_gross" },
  { ticker: "00005", issuer: "汇丰控股", pack: "bank", section: "note", label: "Expected credit losses on customer loans", target: "ecl" },
  { ticker: "00005", issuer: "汇丰控股", pack: "bank", section: "note", label: "Change in expected credit losses", target: "ecl_charge" },
  { ticker: "00005", issuer: "汇丰控股", pack: "bank", section: "bs", label: "Customer accounts", target: "deposits" },
  { ticker: "00005", issuer: "汇丰控股", pack: "bank", section: "bs", label: "Financial investments", target: "other" },
  { ticker: "00011", issuer: "恒生银行", pack: "bank", section: "is", label: "Net operating income", target: "revenue" },
  { ticker: "00011", issuer: "恒生银行", pack: "bank", section: "bs", label: "Loans and advances to customers", target: "loans_net" },
  { ticker: "00011", issuer: "恒生银行", pack: "bank", section: "note", label: "客户贷款总额", target: "loans_gross" },
  { ticker: "00011", issuer: "恒生银行", pack: "bank", section: "note", label: "预期信用损失准备", target: "ecl" },
  { ticker: "00011", issuer: "恒生银行", pack: "bank", section: "bs", label: "Customer deposits", target: "deposits" },
  { ticker: "00388", issuer: "香港交易所", pack: "exchange", section: "bs", label: "Cash and cash equivalents", target: "cash" },
  { ticker: "00388", issuer: "香港交易所", pack: "exchange", section: "note", label: "Margin deposits from Clearing Participants — cash", target: "margin_cash" },
  { ticker: "00388", issuer: "香港交易所", pack: "exchange", section: "note", label: "Corporate funds — cash", target: "own_cash" },
  { ticker: "00388", issuer: "香港交易所", pack: "exchange", section: "note", label: "Clearing House Funds", target: "margin_cash" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "bs", label: "Cash and cash equivalents", target: "cash" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "note", label: "Term deposits", target: "st_invest" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "note", label: "定期存款", target: "st_invest" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "note", label: "Right-of-use assets", target: "rou" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "note", label: "Payments for repurchase of shares", target: "buyback" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "note", label: "Other comprehensive income", target: "oci" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "bs", label: "Property, plant and equipment", target: "ppe" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "Capital expenditure", target: "ppe_add" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "bs", label: "Cash and cash equivalents", target: "cash" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "bs", label: "Property, plant and equipment", target: "ppe" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "Construction in progress", target: "cip" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "在建工程", target: "cip" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "Contract assets", target: "ca" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "合同负债", target: "cl" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "Right-of-use assets", target: "rou" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "使用权资产", target: "rou" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "Other intangible assets", target: "intan" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "其他无形资产", target: "intan" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "Bank deposits", target: "st_invest" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "note", label: "银行存款", target: "st_invest" },
  { ticker: "00941", issuer: "中国移动", pack: "telco", section: "is", label: "Operating revenue", target: "revenue" },
  { ticker: "00883", issuer: "中国海洋石油", pack: "energy", section: "bs", label: "Property, plant and equipment", target: "ppe" },
  { ticker: "00883", issuer: "中国海洋石油", pack: "energy", section: "note", label: "Provision for dismantlement", target: "aro" },
  { ticker: "00883", issuer: "中国海洋石油", pack: "energy", section: "note", label: "弃置义务准备", target: "aro" },
  { ticker: "00883", issuer: "中国海洋石油", pack: "energy", section: "note", label: "Accretion expense of dismantlement", target: "aro_unwind" },
  { ticker: "00883", issuer: "中国海洋石油", pack: "energy", section: "note", label: "弃置义务折现值转回", target: "aro_unwind" },
  { ticker: "00883", issuer: "中国海洋石油", pack: "energy", section: "note", label: "Additions to dismantlement provision", target: "aro_charge" },
  { ticker: "00883", issuer: "中国海洋石油", pack: "energy", section: "note", label: "Capital expenditure", target: "ppe_add" },
  { ticker: "01810", issuer: "小米集团", pack: "generic", section: "bs", label: "Inventories", target: "inv" },
  { ticker: "01810", issuer: "小米集团", pack: "generic", section: "bs", label: "存货", target: "inv" },
  { ticker: "01810", issuer: "小米集团", pack: "generic", section: "note", label: "Payments for repurchase of shares", target: "buyback" },
  { ticker: "00016", issuer: "新鸿基地产", pack: "realty", section: "note", label: "Investment properties", target: "ip" },
  { ticker: "00016", issuer: "新鸿基地产", pack: "realty", section: "note", label: "投资物业", target: "ip" },
  { ticker: "00016", issuer: "新鸿基地产", pack: "realty", section: "note", label: "Fair value changes of investment properties", target: "ip_fv" },
  { ticker: "00016", issuer: "新鸿基地产", pack: "realty", section: "bs", label: "Properties for sale", target: "inv" },
  { ticker: "00016", issuer: "新鸿基地产", pack: "realty", section: "bs", label: "待售物业", target: "inv" },
  { ticker: "00016", issuer: "新鸿基地产", pack: "realty", section: "note", label: "Additions to investment properties", target: "ip_add" },
  { ticker: "00016", issuer: "新鸿基地产", pack: "realty", section: "note", label: "Transfer from properties for sale", target: "ip_add" },
  { ticker: "00016", issuer: "新鸿基地产", pack: "realty", section: "note", label: "Development costs incurred", target: "dev_cost" },
  { ticker: "00016", issuer: "新鸿基地产", pack: "realty", section: "note", label: "开发成本", target: "dev_cost" },
  { ticker: "00002", issuer: "中电控股", pack: "energy", section: "bs", label: "Fixed assets", target: "ppe" },
  { ticker: "00002", issuer: "中电控股", pack: "energy", section: "note", label: "Fuel clause recovery account", target: "fuel" },
  { ticker: "00002", issuer: "中电控股", pack: "energy", section: "note", label: "燃料条款账", target: "fuel" },
  { ticker: "00001", issuer: "长江和记", pack: "generic", section: "bs", label: "Cash and cash equivalents", target: "cash" },
  { ticker: "00001", issuer: "长江和记", pack: "generic", section: "bs", label: "Property, plant and equipment", target: "ppe" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "note", label: "Contract liabilities", target: "cl" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "note", label: "合同负债", target: "cl" },
  { ticker: "00700", issuer: "腾讯控股", pack: "platform", section: "note", label: "Share-based compensation expenses", target: "sbp" },
  { ticker: "03690", issuer: "美团", pack: "platform", section: "note", label: "Short-term investments", target: "st_invest" },
  { ticker: "03690", issuer: "美团", pack: "platform", section: "note", label: "短期理财", target: "st_invest" },
  { ticker: "03690", issuer: "美团", pack: "platform", section: "note", label: "Payments for repurchase of shares", target: "buyback" },
  { ticker: "03690", issuer: "美团", pack: "platform", section: "note", label: "Contract liabilities", target: "cl" },
  { ticker: "03690", issuer: "美团", pack: "platform", section: "note", label: "Equity-settled share-based payments", target: "sbp" },
];

type Alias = { target: string; labels: string[]; section: MapSection; packs: RulePack[] };

const ALIASES: Alias[] = [
  { target: "cash", section: "bs", packs: [...RULE_PACKS], labels: ["现金及现金等价物", "货币资金", "cash and cash equivalents", "cash at bank and in hand", "balances with central banks", "央行结余"] },
  { target: "loans_net", section: "bs", packs: ["bank"], labels: ["客户贷款净额", "customer loans net", "net loans and advances", "loans to customers net of ECL", "垫款净额"] },
  { target: "loans_gross", section: "note", packs: ["bank"], labels: ["贷款总额", "gross loans and advances", "customer loans before ECL", "垫款总额", "loans outstanding gross"] },
  { target: "ecl", section: "note", packs: ["bank"], labels: ["预期信用损失准备", "ECL allowance", "loss allowance on loans", "expected credit loss stock", "减值准备 — 贷款", "expected credit losses relating to loans"] },
  { target: "ecl_charge", section: "note", packs: ["bank"], labels: ["本年计提预期信用损失", "ECL charge for the year", "charge for expected credit losses", "credit impairment charges", "减值计提", "movement in expected credit losses", "changes in expected credit loss"] },
  { target: "deposits", section: "bs", packs: ["bank"], labels: ["客户存款", "customer deposits", "deposits from customers", "客户账", "accounts due to customers", "customer account balances"] },
  { target: "ar", section: "bs", packs: ["generic", "platform", "realty", "telco"], labels: ["应收账款", "trade receivables", "accounts receivable", "应收贸易款项", "amounts due from customers"] },
  { target: "inv", section: "bs", packs: ["generic", "realty"], labels: ["存货", "inventories", "properties for sale", "待售物业", "properties held for sale", "发展中待售物业"] },
  { target: "ip", section: "note", packs: ["realty"], labels: ["投资物业", "investment properties", "investment property", "investment property portfolio", "公允计量投资物业"] },
  { target: "ip_fv", section: "note", packs: ["realty"], labels: ["投资物业公允变动", "fair value gain on investment properties", "fair value changes of investment properties", "revaluation of investment properties", "公允变动损益 — 投资物业"] },
  { target: "ip_add", section: "note", packs: ["realty"], labels: ["投资物业购置", "additions to investment property", "IP additions for the year", "transfer from properties for sale", "transfer in from properties for sale", "开发转入", "capitalised IP additions"] },
  { target: "dev_cost", section: "note", packs: ["realty"], labels: ["开发成本", "development costs incurred", "property development expenditure", "在建物业投入", "capitalised development costs"] },
  { target: "ppe", section: "bs", packs: ["generic", "energy", "platform", "telco"], labels: ["固定资产", "property, plant and equipment", "plant and equipment", "物业及设备", "oil and gas properties", "油气资产", "fixed assets"] },
  { target: "ppe_add", section: "note", packs: [...RULE_PACKS], labels: ["资本开支", "capital expenditure", "additions to PPE", "购置物业设备", "purchase of property plant"] },
  { target: "aro", section: "note", packs: ["energy"], labels: ["弃置准备", "decommissioning provision", "provision for dismantlement", "asset retirement obligation", "弃置义务"] },
  { target: "aro_charge", section: "note", packs: ["energy"], labels: ["弃置新增", "弃置重估", "additions to dismantlement provision", "additions to decommissioning", "revision of dismantlement", "new wells ARO", "ARO revisions"] },
  { target: "aro_unwind", section: "note", packs: ["energy"], labels: ["弃置义务折现值转回", "折现释放", "unwinding of discount on provision", "accretion expense of dismantlement", "accretion of decommissioning"] },
  { target: "rou", section: "note", packs: ["generic", "platform", "energy", "telco"], labels: ["使用权资产", "right-of-use assets", "right of use assets", "租赁使用权", "ROU assets"] },
  { target: "margin_cash", section: "note", packs: ["exchange"], labels: ["保证金现金", "margin deposits cash", "clearing participants margin cash", "结算所保证金存款", "margin funds cash", "clearing fund deposits", "clearing house fund balances"] },
  { target: "own_cash", section: "note", packs: ["exchange"], labels: ["公司资金现金", "corporate funds cash", "own cash of the group", "自有资金"] },
  { target: "st_invest", section: "note", packs: ["platform", "generic", "telco"], labels: ["定期存款", "term deposits", "short-term investments", "短期理财", "wealth management products", "定期及理财", "银行存款", "bank deposits", "流动银行定期"] },
  { target: "buyback", section: "note", packs: ["platform", "generic", "bank"], labels: ["股份回购", "share buy-backs", "repurchase of shares", "purchase of shares for cancellation", "回购股份付款"] },
  { target: "oci", section: "note", packs: [...RULE_PACKS], labels: ["其他综合收益", "other comprehensive income", "OCI for the year", "fair value through OCI", "其他全面收益"] },
  { target: "revenue", section: "is", packs: [...RULE_PACKS], labels: ["营业收入", "revenue", "net operating income", "收入及其他收益", "turnover", "净经营收入"] },
  { target: "ni", section: "is", packs: [...RULE_PACKS], labels: ["净利润", "profit for the year", "profit after tax", "除税后溢利", "net profit"] },
  { target: "cfo", section: "cf", packs: [...RULE_PACKS], labels: ["经营活动现金流", "cash generated from operations", "operating cash flow", "经营业务之现金流量"] },
  { target: "fuel", section: "note", packs: ["energy"], labels: ["燃料条款", "fuel clause account", "fuel cost recovery", "关税燃料账"] },
  { target: "cl", section: "note", packs: ["platform", "telco"], labels: ["合同负债", "contract liabilities", "contract liability", "deferred revenue", "unamortised virtual items", "预收合同负债", "Contract liabilities"] },
  { target: "cl_release", section: "note", packs: ["platform", "telco"], labels: ["结转收入", "revenue recognised from opening balance", "年初余额转入收入", "carried-forward recognised as revenue", "opening balance recognised as revenue"] },
  { target: "cl_add", section: "note", packs: ["platform", "telco"], labels: ["本年预收", "new contract billings", "billings in excess of revenue", "本年合同预收", "new prepaid tokens"] },
  { target: "cip", section: "note", packs: ["telco", "energy", "generic"], labels: ["在建工程", "construction in progress", "CIP", "construction work in progress"] },
  { target: "ca", section: "note", packs: ["telco"], labels: ["合同资产", "contract assets", "unbilled revenue", "合同资产净额"] },
  { target: "intan", section: "note", packs: ["telco", "platform"], labels: ["无形资产", "other intangible assets", "spectrum licences", "电信服务频谱", "土地使用权"] },
  { target: "sbp", section: "note", packs: ["platform", "generic"], labels: ["股份支付", "share-based compensation", "share-based payments", "equity-settled share-based", "股份酬金", "value of employee services"] },
  { target: "other", section: "bs", packs: [...RULE_PACKS], labels: ["商誉", "goodwill", "derivative financial instruments", "衍生金融工具", "deferred tax assets", "递延税项", "interests in associates", "联营公司权益", "financial investments"] },
];

function haystack(label: string): string {
  return `${label} ${label.toLowerCase()}`;
}

export function lexiconHits(label: string): number[] {
  const h = haystack(label);
  return LEXICON.map((k) => (h.includes(k) || h.includes(k.toLowerCase()) ? 1 : 0));
}

export function mapFeatures(label: string, pack: RulePack, section: MapSection): number[] {
  const hits = lexiconHits(label);
  const oh = RULE_PACKS.map((p) => (p === pack ? 1 : 0));
  const sec = MAP_SECTIONS.map((s) => (s === section ? 1 : 0));
  return [...hits, ...oh, ...sec, Math.min(label.trim().length / 48, 1)];
}

function noise(rng: () => number, s: string): string {
  const u = rng();
  if (u < 0.18) return `Note ${1 + Math.floor(rng() * 28)} ${s}`;
  if (u < 0.3) return `${s} (HK$ million)`;
  if (u < 0.4) return `Group — ${s}`;
  if (u < 0.48) return `${s} 集团`;
  if (u < 0.56) return s.replace(/,/g, " ");
  return s;
}

export interface MapGuess {
  target: string;
  p: number;
  top: { id: string; label: string; p: number }[];
  assigned?: string;
  match?: boolean;
  features: number[];
}

export interface MapModel {
  net: SoftmaxNet;
  acc: number;
  hkAcc: number;
  paramCount: number;
  checksum: string;
  trainMs: number;
  nTrain: number;
}

function isMovementLabel(s: string): boolean {
  return /addition|transfer|fair value|charge|购置|转入|公允|结转|增加|recognised|capitali|accretion|unwind|revision|billing|incurred|expend/.test(
    s.toLowerCase(),
  );
}

function generateRows(seed: number): { x: number[]; y: number }[] {
  const rng = mulberry32(seed);
  const buckets: { x: number[]; y: number }[][] = Array.from({ length: K }, () => []);
  const indexOf = (id: string) => MAP_TARGETS.findIndex((t) => t.id === id);
  for (const a of ALIASES) {
    const y = indexOf(a.target);
    if (y < 0) continue;
    for (const lab of a.labels) {
      for (let n = 0; n < 6; n++) {
        const pack = a.packs[Math.floor(rng() * a.packs.length)]!;
        const label = n === 0 ? lab : noise(rng, lab);
        buckets[y]!.push({ x: mapFeatures(label, pack, a.section), y });
      }
      if (lab.trim().length <= 24 && !isMovementLabel(lab)) {
        for (let e = 0; e < 4; e++) {
          const pack = a.packs[Math.floor(rng() * a.packs.length)]!;
          buckets[y]!.push({ x: mapFeatures(lab, pack, a.section), y });
        }
      }
    }
  }
  const max = Math.max(...buckets.map((b) => b.length), 1);
  const rows: { x: number[]; y: number }[] = [];
  for (const b of buckets) {
    if (b.length === 0) continue;
    for (let i = 0; i < max; i++) rows.push(b[i % b.length]!);
  }
  return rows;
}

let cached: MapModel | null = null;

export function trainMapNet(seed = MAP_SEED): MapModel {
  const t0 = performance.now();
  const rng = mulberry32(seed);
  const rows = generateRows(seed);
  const idx = rows.map((_, i) => i);
  shuffleInPlace(rng, idx);
  const nTrain = Math.floor(idx.length * 0.85);
  const trainIdx = idx.slice(0, nTrain);
  const testIdx = idx.slice(nTrain);
  const xs = rows.map((r) => Float32Array.from(r.x));
  const ys = rows.map((r) => r.y);
  const net = makeSoftmax(rng, MAP_IN, HID, K);
  const BATCH = 32;
  const EPOCHS = 32;
  const nBatches = Math.max(1, Math.floor(trainIdx.length / BATCH));
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = trainIdx.slice();
    shuffleInPlace(rng, order);
    const lr = 0.22 * (1 - epoch / EPOCHS) + 0.03;
    for (let b = 0; b < nBatches; b++) {
      softmaxSgdStep(net, xs, ys, order.slice(b * BATCH, (b + 1) * BATCH), lr, 1e-4);
    }
  }
  let hit = 0;
  for (const i of testIdx) {
    if (softmaxArgmax(softmaxForward(net, xs[i]!).p) === ys[i]) hit++;
  }
  cached = {
    net,
    acc: hit / Math.max(testIdx.length, 1),
    hkAcc: 0,
    paramCount: softmaxParamCount(net),
    checksum: checksum([net.w1, net.b1, net.w2, net.b2]),
    trainMs: performance.now() - t0,
    nTrain: trainIdx.length,
  };
  cached.hkAcc = scoreHkAcc();
  return cached;
}

export function getMapNet(): MapModel {
  return cached ?? trainMapNet();
}

export function guessLine(label: string, pack: RulePack, section: MapSection, assigned?: string): MapGuess {
  const mdl = getMapNet();
  const features = mapFeatures(label, pack, section);
  const { p } = softmaxForward(mdl.net, Float32Array.from(features));
  const ranked = MAP_TARGETS.map((t, i) => ({ id: t.id, label: t.label, p: p[i]! })).sort((a, b) => b.p - a.p);
  const best = ranked[0]!;
  return {
    target: best.id,
    p: best.p,
    top: ranked.slice(0, 3),
    assigned,
    match: assigned ? best.id === assigned : undefined,
    features,
  };
}

function scoreHkAcc(): number {
  let hit = 0;
  for (const line of HK_LINES) {
    const g = guessLine(line.label, line.pack, line.section, line.target);
    if (g.match) hit++;
  }
  return hit / Math.max(HK_LINES.length, 1);
}

export function mapLinesFor(ticker: string): (MapLine & { guess: MapGuess })[] {
  getMapNet();
  return HK_LINES.filter((l) => l.ticker === ticker).map((l) => ({
    ...l,
    guess: guessLine(l.label, l.pack, l.section, l.target),
  }));
}

export function ensureMapNet() {
  return getMapNet();
}

export function targetLabel(id: string): string {
  return MAP_TARGETS.find((t) => t.id === id)?.label ?? id;
}

export function targetOf(id: string): MapTarget | undefined {
  return MAP_TARGETS.find((t) => t.id === id);
}

export function sinkOf(id: string): MapSink {
  return targetOf(id)?.sink ?? { book: "none" };
}

export function readTargetValue(issuer: Issuer, targetId: string): number {
  const sink = sinkOf(targetId);
  if (sink.book === "year") return issuer.curr[sink.key] ?? 0;
  if (sink.book === "note") return mergeNotes(issuer.currNotes)[sink.key] ?? 0;
  return 0;
}

export function isEmptyValue(n: number): boolean {
  return Math.abs(n) < 0.5;
}

/** million of reporting currency → 万元. */
export function millionToWan(million: number): number {
  return Math.round(million * 100);
}

export function applyTargetWrite(issuer: Issuer, targetId: string, million: number): Issuer {
  const sink = sinkOf(targetId);
  const wan = millionToWan(million);
  if (sink.book === "none" || !Number.isFinite(wan)) return issuer;
  if (sink.book === "year") {
    return { ...issuer, curr: { ...issuer.curr, [sink.key]: wan } };
  }
  const notes = mergeNotes(issuer.currNotes);
  return { ...issuer, currNotes: { ...notes, [sink.key]: wan } };
}

export function applyTargetWrites(
  issuer: Issuer,
  writes: { ticker: string; target: string; million: number }[],
): Issuer {
  let next = issuer;
  for (const w of writes) {
    if (w.ticker !== issuer.ticker) continue;
    next = applyTargetWrite(next, w.target, w.million);
  }
  return next;
}
