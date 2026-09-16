import { mulberry32, randn } from "./rng";
import { EMPTY_NOTES, mergeNotes } from "./note-rules";
import { generateIssuers } from "./statements";
import { totalAssets } from "./rules";
import type { ErrorKind, Issuer, NoteBooks, RulePack } from "./types";

function closeNotes(issuer: Issuer, rng: () => number): { prior: NoteBooks; curr: NoteBooks } {
  const { curr, prior } = issuer;
  const oci = curr.ni * randn(rng) * 0.12;
  const buyback = Math.max(0, curr.ni * (rng() * 0.35));
  const sbp = Math.max(0, curr.ni * rng() * 0.04);
  const nci = curr.ni * randn(rng) * 0.05;
  const dRe = curr.re - prior.re;
  const otherEq = dRe - (curr.ni - curr.dividends + oci - buyback + sbp + nci);

  const ppeDisp = Math.max(0, curr.ppe * rng() * 0.04);
  const ppeImpair = Math.max(0, curr.ppe * rng() * 0.02);
  const ppeFx = curr.ppe * randn(rng) * 0.02;
  const ppeReval = curr.ppe * randn(rng) * 0.015;
  const ppeCip = curr.capex * rng() * 0.25;
  const ppeAdd =
    curr.ppe - (prior.ppe + ppeCip - curr.da - ppeDisp - ppeImpair + ppeFx + ppeReval);

  const fxCash = curr.cash - prior.cash - curr.netCf;
  const fxDebt = (curr.stDebt + curr.ltDebt) * randn(rng) * 0.02;
  const borrowRepay = Math.max(0, (curr.stDebt + curr.ltDebt) * rng() * 0.12);
  const borrowDraw =
    curr.stDebt + curr.ltDebt - (prior.stDebt + prior.ltDebt - borrowRepay + fxDebt);
  const deferredTaxAdj = curr.taxPay - (prior.taxPay + curr.tax - curr.taxPaid);

  const intanPrior = Math.max(0, curr.revenue * (0.04 + rng() * 0.08));
  const intanAdd = intanPrior * (0.08 + rng() * 0.2);
  const intanAmort = intanPrior * (0.08 + rng() * 0.06);
  const intanImpair = rng() < 0.15 ? intanPrior * rng() * 0.08 : 0;
  const intan = intanPrior + intanAdd - intanAmort - intanImpair;

  const rouPrior = Math.max(0, curr.revenue * (0.03 + rng() * 0.05));
  const rouAdd = rouPrior * (0.1 + rng() * 0.2);
  const rouDep = rouPrior * (0.12 + rng() * 0.06);
  const rouTerm = rng() < 0.2 ? rouPrior * rng() * 0.08 : 0;
  const rou = rouPrior + rouAdd - rouDep - rouTerm;

  const provPrior = Math.max(0, curr.revenue * (0.01 + rng() * 0.03));
  const provCharge = provPrior * (0.2 + rng() * 0.4);
  const provUse = provPrior * (0.15 + rng() * 0.35);
  const prov = provPrior + provCharge - provUse;

  const currNotes: NoteBooks = {
    ...EMPTY_NOTES,
    oci,
    buyback,
    sbp,
    nci,
    otherEq,
    ppeAdd,
    ppeCip,
    ppeDisp,
    ppeImpair,
    ppeFx,
    ppeReval,
    fxCash,
    borrowDraw,
    borrowRepay,
    fxDebt,
    deferredTaxAdj,
    intan,
    intanAdd,
    intanAmort,
    intanImpair,
    rou,
    rouAdd,
    rouDep,
    rouTerm,
    prov,
    provCharge,
    provUse,
  };
  const priorNotes: NoteBooks = {
    ...EMPTY_NOTES,
    intan: intanPrior,
    rou: rouPrior,
    prov: provPrior,
  };
  return { prior: priorNotes, curr: currNotes };
}

function closeBankNotes(issuer: Issuer, rng: () => number): { prior: NoteBooks; curr: NoteBooks } {
  const base = closeNotes(issuer, rng);
  const net = Math.max(issuer.curr.ar, 1);
  const priorNet = Math.max(issuer.prior.ar, 1);
  const coverage = 0.008 + rng() * 0.018;
  const ecl = net * coverage;
  const priorCov = coverage * (0.85 + rng() * 0.3);
  const eclBeg = priorNet * priorCov;
  const eclCharge = ecl * (0.2 + rng() * 0.45);
  const eclWriteoff = eclCharge * (0.35 + rng() * 0.5);
  const eclRecover = eclWriteoff * rng() * 0.12;
  const eclFx = ecl * randn(rng) * 0.04;
  const eclClosed = eclBeg + eclCharge - eclWriteoff + eclRecover + eclFx;
  const loansGross = net + eclClosed;
  const priorGross = priorNet + eclBeg;
  const adr = 0.55 + rng() * 0.18;
  const deposits = net / adr;
  const priorAdr = adr * (0.96 + rng() * 0.08);
  const priorDeposits = priorNet / priorAdr;
  const nii = issuer.curr.revenue * (0.45 + rng() * 0.2);

  return {
    prior: {
      ...base.prior,
      ecl: eclBeg,
      loansGross: priorGross,
      deposits: priorDeposits,
    },
    curr: {
      ...base.curr,
      ecl: eclClosed,
      eclCharge,
      eclWriteoff,
      eclRecover,
      eclFx,
      loansGross,
      deposits,
      nii,
      ppeAdd: 0,
      ppeCip: 0,
      ppeDisp: 0,
      ppeImpair: 0,
      ppeFx: 0,
      ppeReval: 0,
    },
  };
}

function closeRealtyNotes(issuer: Issuer, rng: () => number): { prior: NoteBooks; curr: NoteBooks } {
  const base = closeNotes(issuer, rng);
  const a = Math.max(totalAssets(issuer.curr), 1);
  const ipBeg = a * (0.45 + rng() * 0.08);
  const ipFv = issuer.curr.ni * randn(rng) * 0.2;
  const ipAdd = Math.max(0, ipBeg * (0.01 + rng() * 0.04));
  const ipDisp = Math.max(0, ipBeg * rng() * 0.01);
  const ipTransfer = issuer.curr.inv * rng() * 0.04;
  const ip = ipBeg + ipAdd + ipTransfer + ipFv - ipDisp;
  const devCost = issuer.curr.inv - (issuer.prior.inv - issuer.curr.cogs - ipTransfer);
  return {
    prior: { ...base.prior, ip: ipBeg },
    curr: { ...base.curr, ip, ipAdd, ipFv, ipDisp, ipTransfer, devCost },
  };
}

function closeEnergyNotes(issuer: Issuer, rng: () => number): { prior: NoteBooks; curr: NoteBooks } {
  const base = closeNotes(issuer, rng);
  const provBeg = issuer.curr.ppe * (0.12 + rng() * 0.06);
  const abandonUnwind = provBeg * (0.03 + rng() * 0.03);
  const provCharge = provBeg * rng() * 0.08;
  const provUse = provBeg * rng() * 0.04;
  const prov = provBeg + provCharge + abandonUnwind - provUse;
  const fuelClause = issuer.curr.revenue * randn(rng) * 0.02;
  return {
    prior: { ...base.prior, prov: provBeg, rou: base.prior.rou },
    curr: { ...base.curr, prov, provCharge, abandonUnwind, provUse, fuelClause },
  };
}

function closePlatformNotes(issuer: Issuer, rng: () => number): { prior: NoteBooks; curr: NoteBooks } {
  const base = closeNotes(issuer, rng);
  const stInvest = issuer.curr.cash * (0.8 + rng() * 1.4);
  return {
    prior: base.prior,
    curr: { ...base.curr, stInvest, buyback: Math.max(base.curr.buyback, Math.abs(issuer.curr.ni) * 0.15) },
  };
}

function closeExchangeNotes(issuer: Issuer, rng: () => number): { prior: NoteBooks; curr: NoteBooks } {
  const base = closeNotes(issuer, rng);
  const cash = Math.max(issuer.curr.cash, 1);
  const ownCash = cash * (0.08 + rng() * 0.06);
  const marginCash = cash * (0.65 + rng() * 0.1);
  const clearingCash = cash * (0.14 + rng() * 0.04);
  const asharesCash = cash - ownCash - marginCash - clearingCash;
  const marginFunds = marginCash * (1.7 + rng() * 0.4);
  const marginLiab = marginFunds * (1.02 + rng() * 0.08);
  const clearingFunds = clearingCash * (1.15 + rng() * 0.1);
  const clearingLiab = clearingFunds * (0.92 + rng() * 0.06);
  const priorMargin = marginLiab * (0.7 + rng() * 0.2);
  return {
    prior: { ...base.prior, marginLiab: priorMargin, ownCash: ownCash * 0.9 },
    curr: {
      ...base.curr,
      ownCash,
      marginCash,
      clearingCash,
      asharesCash,
      marginFunds,
      marginLiab,
      clearingFunds,
      clearingLiab,
    },
  };
}

function injectNoteBreak(rng: () => number, issuer: Issuer): ErrorKind {
  const kinds: ErrorKind[] = [
    "note_eq",
    "note_ppe",
    "note_cash",
    "note_debt",
    "note_intan",
    "note_rou",
  ];
  const kind = kinds[Math.floor(rng() * kinds.length)]!;
  const notes = mergeNotes(issuer.currNotes);
  const mag = Math.max(Math.abs(issuer.curr.ni) * (0.08 + rng() * 0.14), 80);
  switch (kind) {
    case "note_eq":
      issuer.curr.re += rng() < 0.5 ? mag : -mag;
      break;
    case "note_ppe":
      issuer.curr.ppe += mag;
      notes.ppeAdd *= 0.4;
      break;
    case "note_cash":
      issuer.curr.cash += mag;
      notes.fxCash = 0;
      break;
    case "note_debt":
      issuer.curr.ltDebt += mag;
      notes.borrowDraw = 0;
      break;
    case "note_intan":
      notes.intan += mag;
      break;
    case "note_rou":
      notes.rou += mag * 0.6;
      notes.rouAdd = 0;
      break;
    default:
      break;
  }
  issuer.currNotes = notes;
  return kind;
}

function injectBankBreak(rng: () => number, issuer: Issuer): ErrorKind {
  const kinds: ErrorKind[] = ["note_ecl", "note_loan", "note_eq", "note_cash", "note_debt"];
  const kind = kinds[Math.floor(rng() * kinds.length)]!;
  const notes = mergeNotes(issuer.currNotes);
  const mag = Math.max(Math.abs(issuer.curr.ni) * (0.08 + rng() * 0.14), 80);
  switch (kind) {
    case "note_ecl":
      notes.ecl += rng() < 0.5 ? mag : -mag;
      notes.eclCharge *= 0.3;
      break;
    case "note_loan":
      issuer.curr.ar += mag;
      notes.loansGross *= 0.85;
      break;
    case "note_eq":
      issuer.curr.re += rng() < 0.5 ? mag : -mag;
      break;
    case "note_cash":
      issuer.curr.cash += mag;
      notes.fxCash = 0;
      break;
    case "note_debt":
      issuer.curr.ltDebt += mag;
      notes.borrowDraw = 0;
      break;
    default:
      break;
  }
  issuer.currNotes = notes;
  return kind;
}

function injectPackBreak(rng: () => number, issuer: Issuer, pack: RulePack): ErrorKind {
  if (pack === "bank") return injectBankBreak(rng, issuer);
  const notes = mergeNotes(issuer.currNotes);
  const mag = Math.max(Math.abs(issuer.curr.ni) * (0.08 + rng() * 0.14), 80);
  if (pack === "realty") {
    notes.ip += mag;
    notes.ipFv = 0;
    issuer.currNotes = notes;
    return "note_ip";
  }
  if (pack === "energy") {
    notes.prov += mag;
    notes.abandonUnwind = 0;
    issuer.currNotes = notes;
    return "note_aro";
  }
  if (pack === "exchange") {
    notes.ownCash += mag;
    issuer.currNotes = notes;
    return "note_margin";
  }
  return injectNoteBreak(rng, issuer);
}

function finishIssuer(issuer: Issuer, rng: () => number, pack: RulePack): Issuer {
  if (issuer.inject === "true_error") {
    issuer.errorKinds = [injectPackBreak(rng, issuer, pack)];
  } else if (issuer.inject === "rounding") {
    const step = issuer.size === "mega" || issuer.size === "large" ? 100 : 10;
    const keys = Object.keys(issuer.currNotes!) as (keyof NoteBooks)[];
    for (const k of keys) {
      issuer.currNotes![k] = Math.round(issuer.currNotes![k] / step) * step;
    }
  } else if (issuer.inject === "reclass") {
    const n = issuer.currNotes!;
    if (pack === "bank") {
      const move = n.eclCharge * 0.35;
      n.eclCharge -= move;
      n.eclWriteoff += move;
    } else {
      const move = n.buyback * 0.4;
      n.buyback -= move;
      n.otherEq += move;
    }
  }
  return issuer;
}

function closerOf(pack: RulePack, issuer: Issuer, rng: () => number) {
  if (pack === "bank") return closeBankNotes(issuer, rng);
  if (pack === "realty") return closeRealtyNotes(issuer, rng);
  if (pack === "energy") return closeEnergyNotes(issuer, rng);
  if (pack === "platform") return closePlatformNotes(issuer, rng);
  if (pack === "exchange") return closeExchangeNotes(issuer, rng);
  return closeNotes(issuer, rng);
}

export const N_CLOSER = 480;
export const N_PACK_CLOSER = 240;
export const CLOSER_SEED = 7;
export const BANK_CLOSER_SEED = 11;

export const PACK_CLOSER_SEED: Record<RulePack, number> = {
  generic: 7,
  bank: 11,
  exchange: 23,
  realty: 13,
  energy: 17,
  platform: 19,
};

export function generateCloserIssuers(seed = CLOSER_SEED, n = N_CLOSER): Issuer[] {
  return generatePackCloserIssuers("generic", seed, n);
}

export function generateBankCloserIssuers(seed = BANK_CLOSER_SEED, n = N_CLOSER): Issuer[] {
  return generatePackCloserIssuers("bank", seed, n);
}

export function generatePackCloserIssuers(
  pack: RulePack,
  seed = PACK_CLOSER_SEED[pack],
  n = pack === "generic" || pack === "bank" ? N_CLOSER : N_PACK_CLOSER,
): Issuer[] {
  const industry =
    pack === "bank" || pack === "exchange"
      ? "bank"
      : pack === "realty"
        ? "realty"
        : pack === "energy"
          ? "energy"
          : pack === "platform"
            ? "tech"
            : undefined;
  const base = generateIssuers(seed, n, industry);
  const rng = mulberry32(seed + 99);
  return base.map((iss, i) => {
    const closed = closerOf(pack, iss, rng);
    const issuer: Issuer = {
      ...iss,
      id: `${pack}-${String(i).padStart(4, "0")}`,
      pack,
      industry: industry ?? iss.industry,
      priorNotes: closed.prior,
      currNotes: closed.curr,
      inject: iss.inject === "true_error" ? "true_error" : iss.inject,
      errorKinds: [],
    };
    return finishIssuer(issuer, rng, pack);
  });
}

/** Clean closed notes only — used to teach Completeness-Net what “齐” looks like. */
export function generateClosedPackIssuers(pack: RulePack, seed: number, n = 80): Issuer[] {
  const industry =
    pack === "bank" || pack === "exchange"
      ? "bank"
      : pack === "realty"
        ? "realty"
        : pack === "energy"
          ? "energy"
          : pack === "platform"
            ? "tech"
            : undefined;
  const base = generateIssuers(seed, n, industry);
  const rng = mulberry32(seed + 77);
  return base.map((iss, i) => {
    const closed = closerOf(pack, iss, rng);
    return {
      ...iss,
      id: `closed-${pack}-${String(i).padStart(4, "0")}`,
      pack,
      industry: industry ?? iss.industry,
      priorNotes: closed.prior,
      currNotes: closed.curr,
      inject: "clean" as const,
      errorKinds: [],
    };
  });
}
