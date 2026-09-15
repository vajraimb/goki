import { issuerFeatures } from "./features";
import { maxSoftAbsRel, maxStrictAbsRel, RULES, totalAssets } from "./rules";
import { EMPTY_NOTES } from "./note-rules";
import { evaluateMainRules, packOf } from "./packs";
import { EMPTY_BOOKS } from "./statements";
import type { Industry, Issuer, NoteBooks, RulePack, ScoredIssuer, YearBooks } from "./types";

/** Millions of reporting currency → 万元. */
function m(n: number): number {
  return Math.round(n * 100);
}

type Raw = {
  revenue: number;
  cogs?: number;
  gp?: number;
  opex?: number;
  da?: number;
  ebit?: number;
  interest?: number;
  pretax: number;
  tax: number;
  ni: number;
  dividends?: number;
  cash: number;
  ar?: number;
  inv?: number;
  ppe?: number;
  currentAssets?: number;
  totalAssets: number;
  ap?: number;
  stDebt?: number;
  taxPay?: number;
  ltDebt?: number;
  shareCap?: number;
  re?: number;
  totalLiab: number;
  totalEquity: number;
  cfo?: number;
  cfi?: number;
  cff?: number;
  netCf?: number;
  capex?: number;
  taxPaid?: number;
};

function books(raw: Raw): YearBooks {
  const revenue = m(raw.revenue);
  const cogs = m(raw.cogs ?? 0);
  const gp = raw.gp != null ? m(raw.gp) : revenue - cogs;
  const da = m(raw.da ?? 0);
  const ebit = raw.ebit != null ? m(raw.ebit) : m(raw.opex != null ? raw.revenue - (raw.cogs ?? 0) - raw.opex - (raw.da ?? 0) : raw.pretax);
  const opex = raw.opex != null ? m(raw.opex) : Math.max(0, gp - ebit - da);
  const pretax = m(raw.pretax);
  const tax = m(raw.tax);
  const ni = m(raw.ni);
  const interest = raw.interest != null ? m(raw.interest) : Math.max(0, ebit - pretax);
  const dividends = m(raw.dividends ?? 0);

  const cash = m(raw.cash);
  const ar = m(raw.ar ?? 0);
  const inv = m(raw.inv ?? 0);
  const ppe = m(raw.ppe ?? 0);
  const totalA = m(raw.totalAssets);
  const ca = raw.currentAssets != null ? m(raw.currentAssets) : cash + ar + inv;
  let otherCa = ca - cash - ar - inv;
  let otherNca = totalA - ca - ppe;
  if (otherNca < 0) {
    otherCa += otherNca;
    otherNca = 0;
  }
  otherNca += totalA - (cash + ar + inv + ppe + otherCa + otherNca);

  const ap = m(raw.ap ?? 0);
  const stDebt = m(raw.stDebt ?? 0);
  const taxPay = m(raw.taxPay ?? 0);
  const ltDebt = m(raw.ltDebt ?? 0);
  const totalL = m(raw.totalLiab);
  const totalE = m(raw.totalEquity);
  let otherL = totalL - ap - stDebt - taxPay - ltDebt;
  let shareCap = m(raw.shareCap ?? 0);
  let re = m(raw.re ?? 0);
  if (!raw.shareCap && !raw.re) {
    shareCap = Math.round(totalE * 0.12);
    re = totalE - shareCap;
  } else if (!raw.re) {
    re = totalE - shareCap;
  } else if (!raw.shareCap) {
    shareCap = totalE - re;
  }
  const namedL = ap + stDebt + taxPay + ltDebt + otherL + shareCap + re;
  otherL += totalL + totalE - namedL;

  const cfo = m(raw.cfo ?? 0);
  const capex = m(raw.capex ?? 0);
  const taxPaid = raw.taxPaid != null ? m(raw.taxPaid) : tax;
  const netCf = raw.netCf != null ? m(raw.netCf) : 0;
  let cfi = raw.cfi != null ? m(raw.cfi) : -capex;
  let cff = raw.cff != null ? m(raw.cff) : 0;
  if (raw.netCf != null && raw.cfi == null && raw.cff == null) {
    cff = netCf - cfo - cfi;
  }

  return {
    ...EMPTY_BOOKS,
    revenue, cogs, gp, opex, da, ebit, interest, pretax, tax, ni, dividends,
    cash, ar, inv, ppe, otherCa, otherNca,
    ap, stDebt, taxPay, ltDebt, otherL, shareCap, re,
    cfo, cfi, cff, netCf, capex, taxPaid,
  };
}

type Spec = {
  ticker: string;
  name: string;
  industry: Industry;
  currency: NonNullable<Issuer["currency"]>;
  periodLabel: string;
  unitLabel: string;
  filingNote: string;
  caveats: string[];
  curr: Raw;
  prior: Raw;
};

const SPECS: Spec[] = [
  {
    ticker: "00005",
    name: "汇丰控股",
    industry: "bank",
    currency: "USD",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万元美元",
    filingNote: "HSBC Holdings plc 2025 Annual Results（港交所公告，美元）",
    caveats: [
      "贷款进应收账款（净额），投资证券进其他资产（不进存货），客户存款进其他负债。",
      "银行包关掉毛利、存货周转、PPE 滚存、简化间接法 CFO。改测 ECL 滚存与贷款净额恒等。",
      "R02 用中央银行结余；与中国底稿「货币资金」不是同一口径。",
      "2024 年末客户贷款 ECL 存量按年报「恒定汇率下增加 6 亿美元」倒推，不是比较栏原文。核销 36 亿为集团口径。",
    ],
    curr: {
      revenue: 68274, opex: 36428, da: 4916, ebit: 27996, pretax: 29907, tax: 6776, ni: 23131,
      dividends: 13350,
      cash: 242859, ar: 988399, inv: 0, ppe: 12000, currentAssets: 1800000, totalAssets: 3233034,
      ap: 40000, stDebt: 80000, ltDebt: 200000, totalLiab: 3034809, totalEquity: 198225,
      capex: 3500, netCf: -24815,
    },
    prior: {
      revenue: 65854, opex: 33043, da: 4080, ebit: 29397, pretax: 32309, tax: 7310, ni: 24999,
      dividends: 15500,
      cash: 267674, ar: 930658, inv: 0, ppe: 11500, currentAssets: 1700000, totalAssets: 3017048,
      ap: 38000, stDebt: 75000, ltDebt: 190000, totalLiab: 2833071, totalEquity: 183977,
      capex: 3200,
    },
  },
  {
    ticker: "00011",
    name: "恒生银行",
    industry: "bank",
    currency: "HKD",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万港元",
    filingNote: "Hang Seng Bank 2025 Annual Report（港元）",
    caveats: [
      "净经营收入映射为营业收入。客户贷款改为年报净额 7,873.49 亿，差额进其他资产。",
      "银行包关掉毛利、存货、PPE、简化 CFO。ECL、贷款总额、存款按 2025 年报信贷附注填入。",
      "贷存比 61.4%（上年 64.7%）与年报一致。ECL 滚存仍可能剩未单列的阶段迁徙/其他。",
    ],
    curr: {
      revenue: 42254, opex: 15590, da: 1800, ebit: 18608, interest: 700, pretax: 17908, tax: 2146, ni: 15762,
      dividends: 13000,
      cash: 95000, ar: 787349, inv: 0, ppe: 28000, currentAssets: 720000, totalAssets: 1819113,
      ap: 18000, stDebt: 45000, ltDebt: 80000, shareCap: 9659, re: 162995,
      totalLiab: 1646459, totalEquity: 172654,
      capex: 2200,
    },
    prior: {
      revenue: 41537, opex: 14200, da: 1700, ebit: 21558, interest: 544, pretax: 21014, tax: 2635, ni: 18379,
      dividends: 13000,
      cash: 91000, ar: 819136, inv: 0, ppe: 27000, currentAssets: 700000, totalAssets: 1795196,
      ap: 17000, stDebt: 42000, ltDebt: 78000, shareCap: 9659, re: 159863,
      totalLiab: 1625674, totalEquity: 169522,
      capex: 2000,
    },
  },
  {
    ticker: "00388",
    name: "香港交易所",
    industry: "bank",
    currency: "HKD",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万港元",
    filingNote: "HKEX 2025 Annual Results（港元）。保证金存款把现金和总资产同时做大。",
    caveats: [
      "结算所保证金、现金抵押品计入货币资金与其他负债，R02 的「现金」口径大于公司自有资金。",
      "收入用「收入及其他收益」23,745；投资收益净额未并入营业收入。",
      "交易所包：X01 四段现金加总应对上报表现金。保证金基金资产 vs 参与者负债允许投资时点差。",
    ],
    curr: {
      revenue: 23745, opex: 6068, da: 1568, ebit: 21228, interest: 96, pretax: 21158, tax: 3321, ni: 17837,
      dividends: 15825,
      cash: 182724, ar: 67958, inv: 0, ppe: 1822, currentAssets: 547221, totalAssets: 580775,
      ap: 50846, stDebt: 200, ltDebt: 198, shareCap: 31955, re: 25653,
      totalLiab: 522046, totalEquity: 58729,
      capex: 4296, netCf: 48359,
    },
    prior: {
      revenue: 17346, opex: 5761, da: 1402, ebit: 14879, interest: 114, pretax: 14853, tax: 1698, ni: 13155,
      dividends: 11706,
      cash: 134365, ar: 54478, inv: 0, ppe: 1504, currentAssets: 353576, totalAssets: 381629,
      ap: 37584, stDebt: 230, ltDebt: 222, shareCap: 31955, re: 21890,
      totalLiab: 327222, totalEquity: 54407,
      capex: 1517, netCf: 8000,
    },
  },
  {
    ticker: "00700",
    name: "腾讯控股",
    industry: "tech",
    currency: "RMB",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万元人民币",
    filingNote: "腾讯控股 2025 年报（人民币百万元）港交所 2026-04-09",
    caveats: [
      "R01 按资产=负债+权益轧平；其他流动/非流动是合并后的塞入项。",
      "R02：货币资金用现金及现金等价物（不含定期存款 2,368 亿）。",
      "R03 会断：股份回购 734 亿、OCI、少数股东都不在「净利润−分红」里。",
      "使用权资产附注闭合：期初 176.79 + 增加 69.12 − 折旧 62.19 − 终止 10.05 = 173.67。",
    ],
    curr: {
      revenue: 751766, cogs: 329173, gp: 422593, opex: 177854, ebit: 241562,
      interest: 15130, pretax: 277249, tax: 47448, ni: 229801,
      cash: 141041, ar: 111270, inv: 530, ppe: 149905, currentAssets: 595460, totalAssets: 2038986,
      ap: 121127, stDebt: 42618, ltDebt: 250000, shareCap: 63796, re: 1010436,
      totalLiab: 797921, totalEquity: 1241065,
      cfo: 303052, cfi: -87482, netCf: 10165, capex: 87482, taxPaid: 44699,
    },
    prior: {
      revenue: 660257, cogs: 311011, gp: 349246, opex: 149149, ebit: 208099,
      interest: 11981, pretax: 241485, tax: 45018, ni: 196467,
      cash: 132519, ar: 101044, inv: 440, ppe: 80185, currentAssets: 496180, totalAssets: 1780995,
      ap: 118712, stDebt: 52885, ltDebt: 220000, shareCap: 43079, re: 892030,
      totalLiab: 727099, totalEquity: 1053896,
      cfo: 258521, cfi: -62927, netCf: -40160, capex: 62927, taxPaid: 46184,
    },
  },
  {
    ticker: "00941",
    name: "中国移动",
    industry: "tech",
    currency: "RMB",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万元人民币",
    filingNote: "中国移动 2025 年度业绩（人民币百万元）",
    caveats: [
      "年报未按「营业成本」单列，毛利勾稽把其他业务收入近似为成本，R05 不是严格恒等。",
      "折旧由 EBITDA−营运利润反推。",
      "货币资金用现金及现金等价物（年初 1,673.09 亿 + 净减少），定期存款在其他流动资产。",
    ],
    curr: {
      revenue: 1050187, cogs: 154657, opex: 556599, da: 189999, ebit: 148932,
      pretax: 185000, tax: 47905, ni: 137095,
      dividends: 80000,
      cash: 97682, ar: 45000, inv: 8000, ppe: 720000, currentAssets: 497646, totalAssets: 2128182,
      ap: 180000, stDebt: 20000, ltDebt: 40000, totalLiab: 695331, totalEquity: 1432851,
      cfo: 232919, cfi: -190403, cff: -112143, netCf: -69627, capex: 150878, taxPaid: 40000,
    },
    prior: {
      revenue: 1040759, cogs: 151291, opex: 555777, da: 191101, ebit: 142590,
      pretax: 186000, tax: 47627, ni: 138373,
      dividends: 78000,
      cash: 167309, ar: 43000, inv: 7500, ppe: 700000, currentAssets: 568559, totalAssets: 2108127,
      ap: 175000, stDebt: 22000, ltDebt: 38000, totalLiab: 711588, totalEquity: 1396539,
      cfo: 315741, cfi: -185194, cff: -105167, netCf: 25380, capex: 164021, taxPaid: 42000,
    },
  },
  {
    ticker: "00883",
    name: "中国海洋石油",
    industry: "energy",
    currency: "RMB",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万元人民币",
    filingNote: "中国海洋石油 2025 年报（人民币百万元）",
    caveats: [
      "营业成本用原油及油品采购；作业费、勘探、特别收益金进期间费用。",
      "能源包：PPE 加资本开支 1,188 亿、减值 38 亿；弃置准备 1,160 亿，折现释放 38 亿，新井 ARO 未单列。",
      "分红按派息率约 45% 估算，R03 仍会因储备与少数股东断裂。",
    ],
    curr: {
      revenue: 398220, cogs: 47646, opex: 97592, da: 79771, ebit: 173211,
      pretax: 169639, tax: 47491, ni: 122148, dividends: 55000,
      cash: 180000, ar: 28000, inv: 12000, ppe: 666370, currentAssets: 295383, totalAssets: 1098559,
      ap: 22000, stDebt: 11000, ltDebt: 58832, shareCap: 75180, re: 727570,
      totalLiab: 293375, totalEquity: 805184,
      cfo: 209042, capex: 122000, netCf: 30774,
    },
    prior: {
      revenue: 420506, cogs: 50035, opex: 103084, da: 74606, ebit: 192781,
      pretax: 189976, tax: 51994, ni: 137982, dividends: 62000,
      cash: 149226, ar: 26000, inv: 11000, ppe: 632410, currentAssets: 264609, totalAssets: 1056281,
      ap: 21000, stDebt: 30700, ltDebt: 61243, shareCap: 75180, re: 672368,
      totalLiab: 306845, totalEquity: 749436,
      cfo: 220891, capex: 128000, netCf: 18000,
    },
  },
  {
    ticker: "01810",
    name: "小米集团",
    industry: "mfg",
    currency: "RMB",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万元人民币",
    filingNote: "小米集团 2025 年报（人民币千元，已换成百万元）",
    caveats: [
      "汽车业务把存货和资本开支同时抬高，R10、R07 会显著。",
      "现金用现金及现金等价物，不含短期投资与定期存款。",
      "R03：储备、回购、少数股东不在公式里。",
    ],
    curr: {
      revenue: 457287, cogs: 355481, gp: 101806, opex: 73000, ebit: 47901,
      interest: 3635, pretax: 49647, tax: 8080, ni: 41566,
      cash: 26914, ar: 15240, inv: 80989, ppe: 27950, currentAssets: 254811, totalAssets: 508096,
      ap: 110699, stDebt: 13202, ltDebt: 40000, shareCap: 0.4, re: 266218,
      totalLiab: 241878, totalEquity: 266218,
      capex: 18000, netCf: -6747,
    },
    prior: {
      revenue: 365906, cogs: 289346, gp: 76560, opex: 55041, ebit: 24503,
      interest: 212, pretax: 28127, tax: 4548, ni: 23578,
      cash: 33661, ar: 15844, inv: 62510, ppe: 18088, currentAssets: 225709, totalAssets: 403155,
      ap: 98281, stDebt: 13327, ltDebt: 28000, shareCap: 0.4, re: 190000,
      totalLiab: 213155, totalEquity: 190000,
      capex: 12000, netCf: 30,
    },
  },
  {
    ticker: "00016",
    name: "新鸿基地产",
    industry: "realty",
    currency: "HKD",
    periodLabel: "FY2025/06 vs FY2024/06",
    unitLabel: "万港元",
    filingNote: "新鸿基地产截至 2025-06-30 年报（港元）。地产年结不是日历年。",
    caveats: [
      "投资物业 4,170.45 亿，公允变动 −27.3 亿。P01 未填购置/转入时残差就是未映射的开发转入。",
      "待售物业放入存货。P02 未填开发成本时残差是在建投入，不是造假。",
      "R07 关掉：投资物业不按成本滚折旧。",
    ],
    curr: {
      revenue: 79721, cogs: 45531, opex: 8400, da: 2500, ebit: 26078,
      interest: 2485, pretax: 24753, tax: 4869, ni: 19884, dividends: 10867,
      cash: 16919, ar: 20060, inv: 197869, ppe: 50689, currentAssets: 235712, totalAssets: 816893,
      ap: 32412, stDebt: 14384, ltDebt: 95833, shareCap: 70703, re: 547148,
      totalLiab: 194519, totalEquity: 622374,
      capex: 4000, netCf: 698,
    },
    prior: {
      revenue: 71506, cogs: 39292, opex: 7228, da: 2400, ebit: 26752,
      interest: 3567, pretax: 23583, tax: 3978, ni: 19605, dividends: 10867,
      cash: 16221, ar: 17115, inv: 214579, ppe: 50190, currentAssets: 248663, totalAssets: 818094,
      ap: 32412, stDebt: 10498, ltDebt: 116589, shareCap: 70703, re: 536014,
      totalLiab: 207023, totalEquity: 611071,
      capex: 3800, netCf: 941,
    },
  },
  {
    ticker: "00002",
    name: "中电控股",
    industry: "energy",
    currency: "HKD",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万港元",
    filingNote: "CLP Holdings 2025 Annual Report（港元）",
    caveats: [
      "受管制业务（SoC）的燃料条款从 2024 年资产 3.7 亿翻成 2025 年负债 10.43 亿，是关税机制。",
      "固定资产含管制资产。资本开支用 169.23 亿（按资产类型资本投入）。",
    ],
    curr: {
      revenue: 88018, cogs: 28950, opex: 35538, da: 9718, ebit: 14272,
      interest: 1666, pretax: 14201, tax: 2655, ni: 11546, dividends: 8085,
      cash: 4200, ar: 8500, inv: 2800, ppe: 166094, currentAssets: 22838, totalAssets: 238644,
      ap: 18598, stDebt: 9673, ltDebt: 45000, totalLiab: 127162, totalEquity: 111482,
      capex: 12000, netCf: -1500,
    },
    prior: {
      revenue: 90964, cogs: 31871, opex: 34914, da: 9276, ebit: 14903,
      interest: 2019, pretax: 15539, tax: 2821, ni: 12718, dividends: 7958,
      cash: 5700, ar: 9000, inv: 3000, ppe: 158532, currentAssets: 26839, totalAssets: 233713,
      ap: 19788, stDebt: 15849, ltDebt: 42000, totalLiab: 125786, totalEquity: 107927,
      capex: 11500, netCf: 800,
    },
  },
  {
    ticker: "00001",
    name: "长江和记",
    industry: "cons",
    currency: "HKD",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万港元",
    filingNote: "CK Hutchison Holdings 2025 Annual Report（港元，Post-IFRS 16）",
    caveats: [
      "综合零售/港口/基建/电信。营业成本按收入约 55% 估，R05/R10 只作周转参考。",
      "使用权资产、租赁负债不在简化 PPE/借款科目。",
      "一次性项目 104.69 亿进利润，R04 用集团除税前/税/税后利润，含少数股东。",
    ],
    curr: {
      revenue: 507297, cogs: 279000, opex: 99200, da: 71509, ebit: 57596,
      interest: 24972, pretax: 32624, tax: 13391, ni: 19233, dividends: 8860,
      cash: 143748, ar: 42307, inv: 26688, ppe: 100080, currentAssets: 212743, totalAssets: 1155673,
      ap: 40000, stDebt: 30000, ltDebt: 225506, shareCap: 3830, re: 315970,
      totalLiab: 467281, totalEquity: 688392,
      capex: 28000, netCf: 22445,
    },
    prior: {
      revenue: 476682, cogs: 262000, opex: 89700, da: 66350, ebit: 58758,
      interest: 24050, pretax: 34708, tax: 10924, ni: 23784, dividends: 8430,
      cash: 121303, ar: 45967, inv: 24923, ppe: 111777, currentAssets: 192193, totalAssets: 1112542,
      ap: 38000, stDebt: 28000, ltDebt: 225436, shareCap: 3830, re: 287913,
      totalLiab: 459950, totalEquity: 652592,
      capex: 26000, netCf: -6020,
    },
  },
  {
    ticker: "03690",
    name: "美团",
    industry: "cons",
    currency: "RMB",
    periodLabel: "FY2025 vs FY2024",
    unitLabel: "万元人民币",
    filingNote: "美团 2025 年报（人民币千元，已换成百万元）。补贴战年份。",
    caveats: [
      "2025 由盈转亏，经营现金流转负，R06 简化间接法会严重断裂——这是商业模式不是账错。",
      "短期理财约 600.6 亿不在货币资金里，进 T01 流动性结构。",
    ],
    curr: {
      revenue: 364855, cogs: 253846, gp: 111009, opex: 128000, da: 12000, ebit: -17000,
      pretax: -22000, tax: 1400, ni: -23400,
      cash: 106771, ar: 3323, inv: 3013, ppe: 38705, currentAssets: 225057, totalAssets: 346910,
      ap: 35000, stDebt: 15000, ltDebt: 71619, totalLiab: 195922, totalEquity: 150988,
      cfo: -13815, capex: 12000, netCf: 35937, taxPaid: 695,
    },
    prior: {
      revenue: 337592, cogs: 207807, gp: 129785, opex: 84685, da: 11000, ebit: 45100,
      pretax: 38000, tax: 2200, ni: 35800,
      cash: 70834, ar: 2653, inv: 1734, ppe: 30239, currentAssets: 209735, totalAssets: 324355,
      ap: 30000, stDebt: 12000, ltDebt: 49510, totalLiab: 151751, totalEquity: 172604,
      cfo: 57147, capex: 9000, netCf: 15000, taxPaid: 790,
    },
  },
];

/** Filing-sourced note lines, millions of reporting currency. Unmapped stays 0. */
const DISCLOSED: Record<
  string,
  { curr?: Partial<Raw>; notes?: Partial<NoteBooks>; priorNotes?: Partial<NoteBooks> }
> = {
  "00005": {
    notes: {
      loansGross: 999091,
      ecl: 10692,
      eclCharge: 3850,
      eclWriteoff: 3600,
      deposits: 1800000,
      nii: 34794,
    },
    priorNotes: {
      loansGross: 940750,
      ecl: 10092,
      deposits: 1668100,
    },
  },
  "00011": {
    notes: {
      loansGross: 806538,
      ecl: 19189,
      eclCharge: 8049,
      eclWriteoff: 2766,
      deposits: 1283341,
      buyback: 1076,
      nii: 28844,
    },
    priorNotes: {
      loansGross: 832109,
      ecl: 12973,
      deposits: 1267021,
    },
  },
  "00388": {
    curr: { cfo: 25627, cfi: -5565, cff: -14635 },
    notes: {
      ppeAdd: 1863,
      ppeCip: 2433,
      ownCash: 20676,
      marginCash: 130052,
      clearingCash: 29447,
      asharesCash: 2549,
      marginFunds: 247555,
      marginLiab: 269243,
      clearingFunds: 35808,
      clearingLiab: 33991,
    },
    priorNotes: {
      marginFunds: 168455,
      marginLiab: 188857,
      clearingFunds: 28727,
      clearingLiab: 27124,
      ownCash: 36880,
    },
  },
  "00700": {
    curr: { dividends: 41900, capex: 79198 },
    notes: {
      buyback: 73400,
      oci: 45550,
      nci: 6565,
      ppeAdd: 79198,
      intan: 205999,
      rou: 17367,
      rouAdd: 6912,
      rouDep: 6219,
      rouTerm: 1005,
      stInvest: 236801,
    },
    priorNotes: {
      intan: 196127,
      rou: 17679,
    },
  },
  "01810": {
    curr: { cfo: 34142, cfi: -71679, capex: 18200 },
    notes: {
      buyback: 6173,
      otherEq: 39226,
      ppeAdd: 12769,
      ppeDisp: 13,
      borrowDraw: 30378,
      borrowRepay: 25081,
    },
  },
  "03690": {
    curr: { cfi: 29773, cff: 21243, netCf: 37201, capex: 13271 },
    notes: { buyback: 365, ppeAdd: 13271, borrowDraw: 42232, borrowRepay: 16064, stInvest: 60060 },
  },
  "00941": {
    curr: { dividends: 102821 },
    notes: { ppeAdd: 150878 },
  },
  "00883": {
    notes: {
      ppeAdd: 118829,
      ppeImpair: 3809,
      rou: 11834,
      rouDep: 2635,
      intan: 16522,
      prov: 116039,
      abandonUnwind: 3846,
    },
    priorNotes: {
      rou: 12755,
      intan: 16961,
      prov: 99740,
    },
  },
  "00001": {
    curr: { capex: 20945 },
    notes: { ppeAdd: 20945 },
  },
  "00016": {
    notes: {
      ip: 417045,
      ipFv: -2730,
      ppeAdd: 4000,
    },
    priorNotes: { ip: 408424 },
  },
  "00002": {
    curr: { cash: 3905, ar: 12856, inv: 3717, capex: 16923 },
    notes: {
      ppeAdd: 16923,
      rou: 10034,
      fuelClause: -1043,
    },
    priorNotes: {
      rou: 10183,
      fuelClause: 370,
    },
  },
};

function notesOf(raw?: Partial<NoteBooks>): NoteBooks {
  if (!raw) return { ...EMPTY_NOTES };
  const n = { ...EMPTY_NOTES };
  (Object.keys(raw) as (keyof NoteBooks)[]).forEach((k) => {
    const v = raw[k];
    if (v != null && Number.isFinite(v)) n[k] = m(v);
  });
  return n;
}

function bandHk(maxHard: number, maxSoft: number): ScoredIssuer["band"] {
  if (maxHard >= 0.01) return "exception";
  if (maxSoft >= 0.01) return "review";
  return "pass";
}

export function buildHkIssuers(): Issuer[] {
  return SPECS.map((s) => {
    const patch = DISCLOSED[s.ticker];
    const currRaw = { ...s.curr, ...patch?.curr };
    const prior = books(s.prior);
    const curr = books(currRaw);
    if (currRaw.cfo == null) {
      const dAr = curr.ar - prior.ar;
      const dInv = curr.inv - prior.inv;
      const dAp = curr.ap - prior.ap;
      curr.cfo = curr.ni + curr.da - dAr - dInv + dAp;
      if (currRaw.cfi == null && currRaw.cff == null) {
        curr.cfi = -curr.capex;
        curr.cff = curr.netCf - curr.cfo - curr.cfi;
      }
    }
    if (currRaw.netCf == null) {
      curr.netCf = curr.cash - prior.cash;
      if (currRaw.cff == null) curr.cff = curr.netCf - curr.cfo - curr.cfi;
    }
    const currNotes = notesOf(patch?.notes);
    if (currRaw.netCf != null) {
      currNotes.fxCash = curr.cash - prior.cash - curr.netCf;
    }
    const pack: RulePack = packOf({ industry: s.industry, ticker: s.ticker });
    if (pack === "bank") {
      curr.gp = 0;
      curr.cogs = 0;
      prior.gp = 0;
      prior.cogs = 0;
    }
    return {
      id: `hk-${s.ticker}`,
      ticker: s.ticker,
      name: s.name,
      industry: s.industry,
      pack,
      size: "mega" as const,
      inject: "clean" as const,
      errorKinds: [],
      prior,
      curr,
      priorNotes: notesOf(patch?.priorNotes),
      currNotes,
      source: "hkex" as const,
      currency: s.currency,
      periodLabel: s.periodLabel,
      unitLabel: s.unitLabel,
      caveats: [
        ...s.caveats,
        s.filingNote,
        pack === "bank"
          ? "银行包：主表关掉毛利/存货/PPE/简化 CFO。附注测 ECL 滚存、贷款净额、贷存比。"
          : pack === "realty"
            ? "地产包：关掉固定资产成本滚存。改测投资物业公允、待售物业滚存、净负债率。"
            : pack === "energy"
              ? "能源包：PPE 按折耗+减值+弃置准备。中电另看燃料条款。"
              : pack === "exchange"
                ? "交易所包：现金拆成公司资金/保证金/结算所/沪深股通。保证金资产负债允许投资时点差。"
                : pack === "platform"
                  ? "平台包：存货周转关掉。看回购、使用权、定期存款占流动性。"
                  : "附注行只填年报已披露的数字。未披露的在建、处置、准备保持 0，完整式残差就是未映射缺口。",
      ],
    };
  });
}

export function scoreHk(issuer: Issuer): ScoredIssuer {
  const { features } = issuerFeatures(issuer);
  const rules = evaluateMainRules(issuer);
  const maxHard = maxStrictAbsRel(rules);
  const maxSoft = maxSoftAbsRel(rules);
  const pError = 1 / (1 + Math.exp(-12 * (maxHard - 0.008)));
  const aeErr = rules.slice(0, 8).reduce((a, r) => a + Math.abs(r.rel), 0) / 8;
  const assets = Math.max(totalAssets(issuer.curr), 1);
  const cashPred = issuer.curr.cash / assets;
  const cashResidual = (issuer.curr.cash - issuer.prior.cash - issuer.curr.netCf) / assets;
  const attribution = rules
    .map((r) => {
      const def = RULES.find((d) => d.id === r.ruleId)!;
      return { name: `${def.code}_rel`, value: r.rel };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 6);
  return {
    issuer,
    rules,
    features,
    pError,
    aeErr,
    cashPred,
    cashResidual,
    attribution,
    band: bandHk(maxHard, maxSoft),
    maxRel: maxSoft,
  };
}

export function getHkScored(): ScoredIssuer[] {
  return buildHkIssuers().map(scoreHk).sort((a, b) => (b.maxRel ?? 0) - (a.maxRel ?? 0));
}

export function findHk(id: string): ScoredIssuer | undefined {
  return getHkScored().find((s) => s.issuer.id === id);
}
