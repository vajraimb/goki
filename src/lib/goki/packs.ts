import { EMPTY_NOTES, equityGap, mergeNotes, ppeGap } from "./note-rules";
import { PACK_SPECS } from "./pack-defs";
import { evaluateRules, RULES } from "./rules";
import type {
  Industry,
  Issuer,
  NoteBooks,
  RulePack,
  RuleResult,
} from "./types";
import { INDUSTRY_LABEL, PACK_LABEL } from "./types";

export { PACK_LABEL };
export { BANK_NOTE_FIELDS, BANK_NOTE_RULES, PACK_SPECS } from "./pack-defs";

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
  const t = issuer.ticker;
  if (t === "00388") return "exchange";
  if (t === "00700" || t === "03690") return "platform";
  if (t === "00941") return "telco";
  if (issuer.industry === "bank") return "bank";
  if (issuer.industry === "realty") return "realty";
  if (issuer.industry === "energy") return "energy";
  return "generic";
}

export function specOf(pack: RulePack) {
  return PACK_SPECS[pack];
}

export function evaluateMainRules(issuer: Issuer): RuleResult[] {
  const rules = evaluateRules(issuer.prior, issuer.curr);
  const spec = specOf(packOf(issuer));
  return rules.map((r, i) => {
    const def = RULES[i]!;
    const out: RuleResult = { ...r, kind: def.kind };
    const notes = mergeNotes(issuer.currNotes);
    if (r.ruleId === "r2") {
      const complete = equityGap(issuer.prior, issuer.curr, notes);
      out.residual = complete;
      out.scale = Math.max(Math.abs(issuer.curr.ni), 10);
      out.rel = complete / out.scale;
    }
    if (r.ruleId === "r6" && !spec.skipMain.r6) {
      const complete = ppeGap(issuer.prior, issuer.curr, notes);
      out.residual = complete;
      out.scale = Math.max(issuer.curr.ppe, 10);
      out.rel = complete / out.scale;
    }
    const reason = spec.skipMain[r.ruleId];
    if (reason) {
      out.skipped = true;
      out.skipReason = reason;
    }
    return out;
  });
}

export function noteRulesFor(pack: RulePack) {
  return specOf(pack).noteRules;
}

export function noteFieldsFor(pack: RulePack) {
  return specOf(pack).noteFields;
}

export function packNoteFeatures(
  issuer: Issuer,
  overlay?: Partial<NoteBooks>,
): { features: number[]; rules: RuleResult[]; notes: NoteBooks; names: string[] } {
  const notes = mergeNotes(issuer.currNotes, overlay);
  const priorNotes = mergeNotes(issuer.priorNotes);
  const pack = packOf(issuer);
  const spec = specOf(pack);
  const rules = spec.evaluate(issuer.prior, issuer.curr, priorNotes, notes);
  const feats: number[] = [];
  for (const r of rules) {
    const rel = r.skipped ? 0 : r.rel;
    const resid = r.skipped ? 0 : r.residual;
    feats.push(Math.sign(resid) * Math.log1p(Math.abs(resid)));
    feats.push(rel);
  }
  return { features: feats, rules, notes, names: spec.featureNames };
}

export function plugPackTruncation(issuer: Issuer, notes: NoteBooks): NoteBooks {
  return specOf(packOf(issuer)).plug(issuer, notes);
}

export const BANK_FEATURE_NAMES = PACK_SPECS.bank.featureNames;

export { EMPTY_NOTES };
