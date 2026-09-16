import type { Issuer, NoteBooks, RuleDef, RuleResult, YearBooks } from "./types";

export const EMPTY_NOTES: NoteBooks = {
  oci: 0,
  tci: 0,
  buyback: 0,
  sbp: 0,
  nci: 0,
  otherEq: 0,
  ownerTx: 0,
  eqTransfer: 0,
  ppeAdd: 0,
  ppeAcq: 0,
  ppeHfs: 0,
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
