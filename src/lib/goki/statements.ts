import { mulberry32, randn } from "./rng";
import type { ErrorKind, Industry, InjectKind, Issuer, SizeTier, YearBooks } from "./types";
import { INDUSTRIES } from "./types";

const PREFIX = [
  "华泰", "中信", "东方", "南方", "北辰", "西岭", "东海", "昆仑", "长江", "珠江",
  "瀚海", "天成", "瑞丰", "嘉禾", "金鼎", "银汉", "青云", "赤诚", "墨轩", "白鹭",
  "星河", "凌云", "弘毅", "致远", "清源", "安泰", "永盛", "鼎信", "和光", "同尘",
];

const MID = [
  "恒", "盛", "远", "博", "嘉", "瑞", "泰", "康", "正", "明",
  "启", "鸿", "骏", "泽", "安", "宁", "和", "昌", "新", "元",
];

const SUFFIX: Record<Industry, string[]> = {
  bank: ["银行", "商行", "金控"],
  realty: ["置地", "发展", "地产"],
  mfg: ["制造", "装备", "工业"],
  pharma: ["医药", "生物", "制药"],
  cons: ["食品", "零售", "百货"],
  energy: ["能源", "电力", "矿业"],
  tech: ["科技", "信息", "半导体"],
  trans: ["物流", "港口", "航空"],
};

const GP: Record<Industry, number> = {
  bank: 0.58, realty: 0.28, mfg: 0.22, pharma: 0.54,
  cons: 0.34, energy: 0.18, tech: 0.41, trans: 0.21,
};

const AR_D: Record<Industry, number> = {
  bank: 0.06, realty: 0.22, mfg: 0.18, pharma: 0.16,
  cons: 0.08, energy: 0.14, tech: 0.2, trans: 0.12,
};

const INV_D: Record<Industry, number> = {
  bank: 0.002, realty: 0.45, mfg: 0.22, pharma: 0.14,
  cons: 0.16, energy: 0.1, tech: 0.12, trans: 0.04,
};

const PPE_D: Record<Industry, number> = {
  bank: 0.08, realty: 0.15, mfg: 0.7, pharma: 0.35,
  cons: 0.25, energy: 1.4, tech: 0.28, trans: 1.1,
};

function tickerOf(i: number, industry: Industry): string {
  const seq = Math.floor(i / 8);
  const board: Record<Industry, number> = {
    bank: 600000,
    tech: 300000,
    pharma: 688000,
    realty: 0,
    mfg: 2000,
    cons: 6000,
    energy: 9000,
    trans: 8000,
  };
  return String(board[industry] + seq).padStart(6, "0");
}

function nameOf(i: number, industry: Industry): string {
  const p = PREFIX[i % PREFIX.length]!;
  const m = MID[Math.floor(i / PREFIX.length) % MID.length]!;
  const s = SUFFIX[industry][i % SUFFIX[industry].length]!;
  return `${p}${m}${s}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function emptyBooks(): YearBooks {
  return {
    revenue: 0, cogs: 0, gp: 0, opex: 0, da: 0, ebit: 0, interest: 0,
    pretax: 0, tax: 0, ni: 0, dividends: 0, cash: 0, ar: 0, inv: 0, ppe: 0,
    otherCa: 0, otherNca: 0, ap: 0, stDebt: 0, taxPay: 0, ltDebt: 0, otherL: 0,
    shareCap: 0, re: 0, cfo: 0, cfi: 0, cff: 0, netCf: 0, capex: 0, taxPaid: 0,
  };
}

function buildYear(
  rng: () => number,
  industry: Industry,
  scale: number,
  prior: YearBooks | null,
): YearBooks {
  const g = prior ? clamp(1 + 0.04 + randn(rng) * 0.08, 0.82, 1.28) : 1;
  const revenue = (prior ? prior.revenue * g : scale * (0.75 + rng() * 0.5));
  const gpM = clamp(GP[industry] + randn(rng) * 0.02, 0.05, 0.8);
  const gp = revenue * gpM;
  const cogs = revenue - gp;
  const opex = revenue * clamp(0.09 + randn(rng) * 0.02, 0.04, 0.22);
  const ppeTarget = revenue * PPE_D[industry] * (0.85 + rng() * 0.3);
  const ppeBeg = prior ? prior.ppe : ppeTarget * 0.92;
  const daRate = clamp(0.055 + randn(rng) * 0.01, 0.03, 0.1);
  const da = ppeBeg * daRate;
  const capex = da * (1.05 + rng() * 0.55);
  const ppe = ppeBeg + capex - da;
  const ebit = gp - opex - da;
  const stDebt = (prior ? prior.stDebt : revenue * 0.08) * (0.9 + rng() * 0.2);
  const ltDebt = (prior ? prior.ltDebt : ppe * 0.35) * (0.92 + rng() * 0.18);
  const interest = (stDebt + ltDebt) * 0.045;
  const pretax = ebit - interest;
  const taxRate = clamp(0.25 + randn(rng) * 0.015, 0.12, 0.32);
  const tax = Math.max(0, pretax * taxRate);
  const ni = pretax - tax;
  const dividends = Math.max(0, ni * (0.18 + rng() * 0.22));
  const ar = revenue * AR_D[industry] * (0.85 + rng() * 0.3);
  const inv = cogs * INV_D[industry] * (0.8 + rng() * 0.35);
  const ap = cogs * (0.1 + rng() * 0.08);
  const taxPayBeg = prior ? prior.taxPay : tax * 0.45;
  const taxPaid = Math.max(0, tax * (0.7 + rng() * 0.25));
  const taxPay = taxPayBeg + tax - taxPaid;
  const cashBeg = prior ? prior.cash : revenue * (0.1 + rng() * 0.08);
  const dAr = prior ? ar - prior.ar : 0;
  const dInv = prior ? inv - prior.inv : 0;
  const dAp = prior ? ap - prior.ap : 0;
  const cfo = ni + da - dAr - dInv + dAp;
  const cfi = -capex;
  const dDebt = prior ? stDebt + ltDebt - prior.stDebt - prior.ltDebt : 0;
  const cff = dDebt - dividends;
  const netCf = cfo + cfi + cff;
  const cash = cashBeg + netCf;
  const shareCap = prior ? prior.shareCap : revenue * (0.35 + rng() * 0.15);
  const reBeg = prior ? prior.re : revenue * (0.2 + rng() * 0.1);
  const re = reBeg + ni - dividends;
  const otherCa = revenue * (0.05 + rng() * 0.04);
  const otherNca = revenue * (0.08 + rng() * 0.06);
  const otherL = revenue * (0.04 + rng() * 0.03);

  const y: YearBooks = {
    revenue, cogs, gp, opex, da, ebit, interest, pretax, tax, ni, dividends,
    cash, ar, inv, ppe, otherCa, otherNca, ap, stDebt, taxPay, ltDebt, otherL,
    shareCap, re, cfo, cfi, cff, netCf, capex, taxPaid,
  };

  // Plug otherCa so A = L+E exactly on clean books.
  const assets =
    y.cash + y.ar + y.inv + y.ppe + y.otherCa + y.otherNca;
  const le =
    y.ap + y.stDebt + y.taxPay + y.ltDebt + y.otherL + y.shareCap + y.re;
  y.otherCa += le - assets;
  return y;
}

function injectTrueError(rng: () => number, curr: YearBooks, prior: YearBooks): ErrorKind[] {
  const kinds: ErrorKind[] = ["cash_hole", "bs_gap", "re_break", "fake_rev", "ppe_over", "tax_break"];
  const n = rng() < 0.3 ? 2 : 1;
  const chosen: ErrorKind[] = [];
  const pool = kinds.slice();
  for (let k = 0; k < n && pool.length; k++) {
    const idx = Math.floor(rng() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]!);
  }
  const assets = Math.abs(
    curr.cash + curr.ar + curr.inv + curr.ppe + curr.otherCa + curr.otherNca,
  );
  const mag = (0.06 + rng() * 0.12) * Math.max(assets, 100);

  for (const kind of chosen) {
    switch (kind) {
      case "cash_hole":
        curr.cash += rng() < 0.5 ? mag : -mag;
        break;
      case "bs_gap":
        curr.otherL -= mag;
        break;
      case "re_break":
        curr.re += mag * 0.7;
        break;
      case "fake_rev": {
        const bump = curr.revenue * (0.08 + rng() * 0.12);
        curr.revenue += bump;
        curr.gp += bump * 0.6;
        curr.ar += bump * 0.85;
        curr.ni += bump * 0.45;
        curr.pretax += bump * 0.55;
        break;
      }
      case "ppe_over":
        curr.ppe += mag;
        curr.da *= 0.55;
        break;
      case "tax_break":
        curr.tax *= 0.4;
        curr.taxPay *= 1.8;
        curr.ni = curr.pretax - curr.tax;
        break;
    }
  }
  void prior;
  return chosen;
}

function injectRounding(curr: YearBooks, step: number) {
  const keys = Object.keys(curr) as (keyof YearBooks)[];
  for (const k of keys) curr[k] = roundTo(curr[k], step);
}

function injectReclass(rng: () => number, curr: YearBooks) {
  const move = Math.abs(curr.otherCa) * (0.15 + rng() * 0.25);
  if (rng() < 0.5) {
    curr.otherCa -= move;
    curr.otherNca += move;
  } else {
    const d = Math.min(curr.stDebt, Math.abs(curr.ltDebt) * 0.2 + 1) * (0.3 + rng() * 0.4);
    curr.stDebt -= d;
    curr.ltDebt += d;
  }
  if (rng() < 0.4) {
    const x = curr.opex * (0.04 + rng() * 0.06);
    curr.opex -= x;
    curr.cogs += x;
    curr.gp = curr.revenue - curr.cogs;
  }
}

export const N_ISSUERS = 1000;
export const INIT_SEED = 3;

export const EMPTY_BOOKS: YearBooks = {
  revenue: 0, cogs: 0, gp: 0, opex: 0, da: 0, ebit: 0, interest: 0,
  pretax: 0, tax: 0, ni: 0, dividends: 0, cash: 0, ar: 0, inv: 0, ppe: 0,
  otherCa: 0, otherNca: 0, ap: 0, stDebt: 0, taxPay: 0, ltDebt: 0, otherL: 0,
  shareCap: 0, re: 0, cfo: 0, cfi: 0, cff: 0, netCf: 0, capex: 0, taxPaid: 0,
};

let cachedIssuers: Issuer[] | null = null;

export function generateIssuers(seed = INIT_SEED, n = N_ISSUERS, forceIndustry?: Industry): Issuer[] {
  const rng = mulberry32(seed);
  const out: Issuer[] = [];
  for (let i = 0; i < n; i++) {
    const industry = forceIndustry ?? INDUSTRIES[i % INDUSTRIES.length]!;
    const sizeRoll = rng();
    const size: SizeTier =
      sizeRoll < 0.08 ? "mega" : sizeRoll < 0.28 ? "large" : sizeRoll < 0.7 ? "mid" : "small";
    const scale =
      size === "mega" ? 4e7 + rng() * 6e7
      : size === "large" ? 4e6 + rng() * 8e6
      : size === "mid" ? 5e5 + rng() * 2e6
      : 6e4 + rng() * 3e5;

    const u = rng();
    let inject: InjectKind;
    if (u < 0.09) inject = "true_error";
    else if (u < 0.3) inject = "rounding";
    else if (u < 0.42) inject = "reclass";
    else inject = "clean";

    const prior = buildYear(rng, industry, scale, null);
    const curr = buildYear(rng, industry, scale, prior);
    let errorKinds: ErrorKind[] = [];
    if (inject === "true_error") errorKinds = injectTrueError(rng, curr, prior);
    else if (inject === "rounding") {
      const step = size === "mega" || size === "large" ? 100 : 10;
      injectRounding(curr, step);
      injectRounding(prior, step);
    } else if (inject === "reclass") injectReclass(rng, curr);

    out.push({
      id: `goki-${String(i).padStart(4, "0")}`,
      ticker: tickerOf(i, industry),
      name: nameOf(i, industry),
      industry,
      pack: industry === "bank" ? "bank" : "generic",
      size,
      inject,
      errorKinds,
      prior,
      curr,
    });
  }
  return out;
}

export function getIssuers(): Issuer[] {
  if (!cachedIssuers) cachedIssuers = generateIssuers();
  return cachedIssuers;
}
