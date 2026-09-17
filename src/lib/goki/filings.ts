import {
  UNITS_PER_TICK,
  WAN_UNITS,
  MINOR_PER_UNIT,
  halfTickMinor,
  closedMinor,
  type SourceScaleName,
} from "./amount";
import type { Issuer } from "./types";

/** Filing kinds the P4 release set can actually reconcile. */
export const FILING_KINDS = ["annual_report", "annual_results", "esg", "clarification"] as const;
export type FilingKind = (typeof FILING_KINDS)[number];

export const FILING_KIND_LABEL: Record<FilingKind, string> = {
  annual_report: "年报",
  annual_results: "业绩公告",
  esg: "ESG",
  clarification: "澄清公告",
};

export const FILING_LANGS = ["en", "zh", "bilingual"] as const;
export type FilingLang = (typeof FILING_LANGS)[number];

export const FILING_LANG_LABEL: Record<FilingLang, string> = {
  en: "英",
  zh: "中",
  bilingual: "中英",
};

/** Headline ticks in the announcement's own presentation scale. */
export interface Headline {
  ticks: number;
  scale: SourceScaleName;
}

export interface Filing {
  ticker: string;
  kind: FilingKind;
  lang: FilingLang;
  /** ESS / HKEX headline. */
  essTitle: string;
  /** ESS document category, when known. */
  essCategory?: string;
  filename: string;
  /** ISO date. Empty only when the file is on IR but the posting day is not in the catalog. */
  published: string;
  yearEnd: string;
  url: string;
  headlines?: { revenue?: Headline; ni?: Headline };
  /** ESG chapter lives inside the annual report PDF. */
  containedIn?: "annual_report";
}

const YE = "2025-12-31";
const YE_JUN = "2025-06-30";

/**
 * Wired FY2025 files. Only rows with a real URL / ESS title.
 * Model still does not read PDFs — this is the release-set catalog the
 * checks reconcile against. Missing rows stay 待核, never 通过.
 */
export const FILINGS: Filing[] = [
  /* ── 00005 汇丰控股 ── */
  {
    ticker: "00005",
    kind: "annual_results",
    lang: "en",
    essTitle: "2025 results announcement made to the HK Stock Exchange",
    essCategory: "Announcements and Notices - [Final Results]",
    filename: "sea-260225-e-2025-results-announcement-made-to-the-hk-stock-exchange.pdf",
    published: "2026-02-25",
    yearEnd: YE,
    url: "https://www.hsbc.com/-/files/hsbc/investors/hsbc-results/2025/annual/pdfs/hsbc-holdings-plc/sea-260225-e-2025-results-announcement-made-to-the-hk-stock-exchange.pdf",
    headlines: {
      revenue: { ticks: 68274, scale: "million" },
      ni: { ticks: 23131, scale: "million" },
    },
  },
  {
    ticker: "00005",
    kind: "annual_report",
    lang: "en",
    essTitle: "Annual Report and Accounts 2025",
    essCategory: "Financial Statements/ESG Information - [Annual Report]",
    filename: "260225-annual-report-and-accounts-2025.pdf",
    published: "2026-02-25",
    yearEnd: YE,
    url: "https://www.hsbc.com/-/files/hsbc/investors/hsbc-results/2025/annual/pdfs/hsbc-holdings-plc/260225-annual-report-and-accounts-2025.pdf",
    headlines: {
      revenue: { ticks: 68274, scale: "million" },
      ni: { ticks: 23131, scale: "million" },
    },
  },
  {
    ticker: "00005",
    kind: "annual_report",
    lang: "zh",
    essTitle: "2025年年度報告與賬目",
    essCategory: "Financial Statements/ESG Information - [Annual Report]",
    filename: "260325-annual-report-and-accounts-2025-chinese.pdf",
    published: "2026-03-25",
    yearEnd: YE,
    url: "https://www.hsbc.com/-/files/hsbc/investors/hsbc-results/2025/annual/pdfs/hsbc-holdings-plc/260325-annual-report-and-accounts-2025-chinese.pdf",
  },

  /* ── 00011 恒生银行 ── */
  {
    ticker: "00011",
    kind: "annual_report",
    lang: "en",
    essTitle: "Annual Report 2025",
    essCategory: "Financial Statements/ESG Information - [Annual Report]",
    filename: "260311-annual-report-and-accounts-2025-en.pdf",
    published: "2026-03-11",
    yearEnd: YE,
    url: "https://www.hsbc.com/-/files/hsbc/investors/hsbc-results/2025/annual/pdfs/hang-seng-bank-limited/260311-annual-report-and-accounts-2025-en.pdf",
    headlines: {
      revenue: { ticks: 42254, scale: "million" },
      ni: { ticks: 15762, scale: "million" },
    },
  },

  /* ── 00388 香港交易所 ── */
  {
    ticker: "00388",
    kind: "esg",
    lang: "en",
    essTitle: "Sustainability Report 2025",
    essCategory: "Financial Statements/ESG Information - [Environmental, Social and Governance Information/Report]",
    filename: "260316sr_e_WCAG.pdf",
    published: "2026-03-16",
    yearEnd: YE,
    url: "https://www.hkexgroup.com/-/media/HKEX-Group-Site/ssd/Investor-Relations/Regulatory-Reports/documents/2026/260316sr_e_WCAG.pdf",
  },
  {
    ticker: "00388",
    kind: "esg",
    lang: "zh",
    essTitle: "2025年可持續發展報告",
    essCategory: "Financial Statements/ESG Information - [Environmental, Social and Governance Information/Report]",
    filename: "260316sr_c_WCAG.pdf",
    published: "2026-03-16",
    yearEnd: YE,
    url: "https://www.hkexgroup.com/-/media/HKEX-Group-Site/ssd/Investor-Relations/Regulatory-Reports/documents/2026/260316sr_c_WCAG.pdf",
  },

  /* ── 00700 腾讯 ── */
  {
    ticker: "00700",
    kind: "annual_results",
    lang: "en",
    essTitle: "ANNOUNCEMENT OF THE ANNUAL RESULTS FOR THE YEAR ENDED 31 DECEMBER 2025",
    essCategory: "Announcements and Notices - [Final Results]",
    filename: "",
    published: "2026-03-18",
    yearEnd: YE,
    url: "",
    headlines: {
      revenue: { ticks: 7518, scale: "yi" },
      ni: { ticks: 2298, scale: "yi" },
    },
  },
  {
    ticker: "00700",
    kind: "annual_report",
    lang: "en",
    essTitle: "ANNUAL REPORT 2025",
    essCategory: "Financial Statements/ESG Information - [Annual Report]",
    filename: "",
    published: "2026-04-08",
    yearEnd: YE,
    url: "",
    headlines: {
      revenue: { ticks: 751766, scale: "million" },
      ni: { ticks: 229801, scale: "million" },
    },
  },
  {
    ticker: "00700",
    kind: "esg",
    lang: "en",
    essTitle: "ENVIRONMENTAL, SOCIAL AND GOVERNANCE REPORT 2025",
    essCategory: "Financial Statements/ESG Information - [Environmental, Social and Governance Information/Report]",
    filename: "",
    published: "2026-04-09",
    yearEnd: YE,
    url: "",
  },

  /* ── 00941 中国移动 ── */
  {
    ticker: "00941",
    kind: "annual_results",
    lang: "en",
    essTitle: "CHINA MOBILE ANNOUNCES 2025 ANNUAL RESULTS",
    essCategory: "Announcements and Notices - [Final Results]",
    filename: "p260326.pdf",
    published: "2026-03-26",
    yearEnd: YE,
    url: "https://www.chinamobileltd.com/en/media/press/p260326.pdf",
    headlines: {
      revenue: { ticks: 10502, scale: "yi" },
      ni: { ticks: 1371, scale: "yi" },
    },
  },
  {
    ticker: "00941",
    kind: "annual_results",
    lang: "zh",
    essTitle: "海外監管公告 — 2025年年度報告摘要",
    essCategory: "Announcements and Notices - [Overseas Regulatory Announcement]",
    filename: "2026032602020_c.pdf",
    published: "2026-03-26",
    yearEnd: YE,
    url: "https://www.hkexnews.hk/listedco/listconews/sehk/2026/0326/2026032602020_c.pdf",
    headlines: {
      revenue: { ticks: 10502, scale: "yi" },
      ni: { ticks: 1371, scale: "yi" },
    },
  },

  /* ── 00883 中国海洋石油 ── */
  {
    ticker: "00883",
    kind: "esg",
    lang: "zh",
    essTitle: "海外監管公告 — 2025年度環境、社會及管治（ESG）報告",
    essCategory: "Announcements and Notices - [Overseas Regulatory Announcement]",
    filename: "2026032601742_c.pdf",
    published: "2026-03-26",
    yearEnd: YE,
    url: "https://www.hkexnews.hk/listedco/listconews/sehk/2026/0326/2026032601742_c.pdf",
  },
  {
    ticker: "00883",
    kind: "esg",
    lang: "en",
    essTitle: "2025 Environmental, Social and Governance Report",
    essCategory: "Financial Statements/ESG Information - [Environmental, Social and Governance Information/Report]",
    filename: "",
    published: "2026-04-09",
    yearEnd: YE,
    url: "https://www.cnoocltd.com/english/presscenter/pressreleases/2026/202604/t20260409_120810.html",
  },

  /* ── 01810 小米 ── */
  {
    ticker: "01810",
    kind: "annual_results",
    lang: "zh",
    essTitle: "截至2025年12月31日止年度之全年業績公告",
    essCategory: "Announcements and Notices - [Final Results]",
    filename: "2026032400609_c.pdf",
    published: "2026-03-24",
    yearEnd: YE,
    url: "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0324/2026032400609_c.pdf",
    headlines: {
      revenue: { ticks: 457286.7, scale: "million" },
      ni: { ticks: 41566.4, scale: "million" },
    },
  },
  {
    ticker: "01810",
    kind: "annual_report",
    lang: "bilingual",
    essTitle: "2025 ANNUAL REPORT",
    essCategory: "Financial Statements/ESG Information - [Annual Report]",
    filename: "2026042800526.pdf",
    published: "2026-04-28",
    yearEnd: YE,
    url: "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0428/2026042800526.pdf",
    headlines: {
      revenue: { ticks: 457287, scale: "million" },
      ni: { ticks: 41566, scale: "million" },
    },
  },
  {
    ticker: "01810",
    kind: "esg",
    lang: "bilingual",
    essTitle: "ENVIRONMENTAL, SOCIAL AND GOVERNANCE REPORT (in Annual Report 2025)",
    essCategory: "Financial Statements/ESG Information - [Environmental, Social and Governance Information/Report]",
    filename: "2026042800526.pdf",
    published: "2026-04-28",
    yearEnd: YE,
    url: "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0428/2026042800526.pdf",
    containedIn: "annual_report",
  },

  /* ── 00016 新鸿基地产 FY2025/06 ── */
  {
    ticker: "00016",
    kind: "annual_results",
    lang: "en",
    essTitle: "ANNOUNCEMENT OF FINAL RESULTS FOR THE YEAR ENDED 30 JUNE 2025",
    essCategory: "Announcements and Notices - [Final Results]",
    filename: "2025090400537.pdf",
    published: "2025-09-04",
    yearEnd: YE_JUN,
    url: "https://www1.hkexnews.hk/listedco/listconews/sehk/2025/0904/2025090400537.pdf",
    headlines: {
      revenue: { ticks: 79721, scale: "million" },
      ni: { ticks: 19884, scale: "million" },
    },
  },
  {
    ticker: "00016",
    kind: "annual_report",
    lang: "en",
    essTitle: "Annual Report 2024/25",
    essCategory: "Financial Statements/ESG Information - [Annual Report]",
    filename: "SHKPAR_EN_2024_25.pdf",
    published: "",
    yearEnd: YE_JUN,
    url: "https://www.shkp.com/Content/Uploads/FinReports/SHKPAR_EN_2024_25.pdf",
    headlines: {
      revenue: { ticks: 79721, scale: "million" },
      ni: { ticks: 19884, scale: "million" },
    },
  },

  /* ── 00002 中电控股 ── */
  {
    ticker: "00002",
    kind: "annual_results",
    lang: "en",
    essTitle: "CLP Announces 2025 Annual Results",
    essCategory: "Announcements and Notices - [Final Results]",
    filename: "20260226a_en.pdf",
    published: "2026-02-26",
    yearEnd: YE,
    url: "https://www.clpgroup.com/content/dam/clp-group/channels/media/document/2026/20260226a_en.pdf.coredownload.pdf",
    headlines: {
      revenue: { ticks: 88018, scale: "million" },
    },
  },
  {
    ticker: "00002",
    kind: "annual_report",
    lang: "en",
    essTitle: "CLP Holdings 2025 Annual Report",
    essCategory: "Financial Statements/ESG Information - [Annual Report]",
    filename: "e_2025E102.pdf",
    published: "2026-03-12",
    yearEnd: YE,
    url: "https://www.clpgroup.com/content/dam/clp-group/channels/investor/document/3-3-financial-reports/2025/e_2025E102.pdf.coredownload.pdf",
    headlines: {
      revenue: { ticks: 88018, scale: "million" },
    },
  },

  /* ── 00001 长江和记 ── */
  {
    ticker: "00001",
    kind: "annual_results",
    lang: "en",
    essTitle: "2025 Annual Results Operations Analysis",
    essCategory: "Announcements and Notices - [Final Results]",
    filename: "e_AR_2025_Operations_Analysis_20260319.pdf",
    published: "2026-03-19",
    yearEnd: YE,
    url: "https://www.ckh.com.hk/upload/assets/downloads/en/e_AR_2025_Operations_Analysis_20260319.pdf",
    headlines: {
      revenue: { ticks: 507297, scale: "million" },
    },
  },

  /* ── 03690 美团 ── */
  {
    ticker: "03690",
    kind: "annual_report",
    lang: "bilingual",
    essTitle: "2025 Annual Report",
    essCategory: "Financial Statements/ESG Information - [Annual Report]",
    filename: "2026042400179.pdf",
    published: "2026-04-24",
    yearEnd: YE,
    url: "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0424/2026042400179.pdf",
    headlines: {
      revenue: { ticks: 3649, scale: "yi" },
      ni: { ticks: -234, scale: "yi" },
    },
  },
  {
    ticker: "03690",
    kind: "esg",
    lang: "bilingual",
    essTitle: "ENVIRONMENTAL, SOCIAL AND GOVERNANCE REPORT (in Annual Report 2025)",
    essCategory: "Financial Statements/ESG Information - [Environmental, Social and Governance Information/Report]",
    filename: "2026042400179.pdf",
    published: "2026-04-24",
    yearEnd: YE,
    url: "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0424/2026042400179.pdf",
    containedIn: "annual_report",
  },
];

export function issuerYearEnd(issuer: Issuer): string | undefined {
  const label = issuer.periodLabel;
  if (!label) return undefined;
  const fyMonth = label.match(/FY(\d{4})\/(\d{2})/);
  if (fyMonth) {
    const y = Number(fyMonth[1]);
    const m = Number(fyMonth[2]);
    const last = new Date(Date.UTC(y, m, 0));
    return last.toISOString().slice(0, 10);
  }
  const m = label.match(/FY(\d{4})/);
  if (!m) return undefined;
  return `${m[1]}-12-31`;
}

/** Listing-rule 13.46: last day of the month four months after year end. */
export function reportDeadline(yearEnd: string): string {
  const [y, m] = yearEnd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + 4 + 1, 0));
  return last.toISOString().slice(0, 10);
}

export function filingsFor(ticker: string, yearEnd?: string): Filing[] {
  return FILINGS.filter((f) => f.ticker === ticker && (!yearEnd || f.yearEnd === yearEnd));
}

export function langsOf(files: Filing[]): Set<"en" | "zh"> {
  const out = new Set<"en" | "zh">();
  for (const f of files) {
    if (f.lang === "bilingual") {
      out.add("en");
      out.add("zh");
    } else {
      out.add(f.lang);
    }
  }
  return out;
}

const TITLE_KIND: Record<FilingKind, RegExp> = {
  annual_report: /annual report|年报|年報|annual report and accounts|年報及賬目|年度報告/i,
  annual_results: /results|業績|业绩|results announcement|年度報告摘要/i,
  esg: /esg|sustainability|可持续|可持續|環境、社會|environmental, social/i,
  clarification: /clarif|澄清/i,
};

/** YYMMDD or YYYYMMDD stamped in the filename, if any. */
export function filenameDate(name: string): string | undefined {
  if (!name) return undefined;
  const m8 = name.match(/(20\d{2})(\d{2})(\d{2})/);
  if (m8) return `${m8[1]}-${m8[2]}-${m8[3]}`;
  const m6 = name.match(/(?:^|[^0-9])(\d{2})(\d{2})(\d{2})(?:[^0-9]|$)/);
  if (!m6) return undefined;
  const y = Number(m6[1]);
  if (y < 20 || y > 30) return undefined;
  return `20${m6[1]}-${m6[2]}-${m6[3]}`;
}

export function titleMatchesKind(filing: Filing): boolean {
  return TITLE_KIND[filing.kind].test(filing.essTitle);
}

export function essFilenameOk(filing: Filing): boolean | "skip" {
  if (!titleMatchesKind(filing)) return false;
  if (!filing.filename || !filing.published) return "skip";
  const stamped = filenameDate(filing.filename);
  if (!stamped) return "skip";
  return stamped === filing.published;
}

function headlineMinor(h: Headline): bigint {
  return BigInt(Math.round(h.ticks)) * UNITS_PER_TICK[h.scale] * MINOR_PER_UNIT;
}

function booksMinor(wan: number): bigint {
  return BigInt(Math.round(wan)) * WAN_UNITS * MINOR_PER_UNIT;
}

/** Compare an announcement headline to a 万元 mapping using the announcement's own tick. */
export function headlineClosed(h: Headline, wan: number): boolean {
  return closedMinor(headlineMinor(h) - booksMinor(wan), halfTickMinor(h.scale));
}

export function headlinesClosed(a: Headline, b: Headline): boolean {
  const coarser = UNITS_PER_TICK[a.scale] >= UNITS_PER_TICK[b.scale] ? a.scale : b.scale;
  return closedMinor(headlineMinor(a) - headlineMinor(b), halfTickMinor(coarser));
}
