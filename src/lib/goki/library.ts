import { RULES } from "./rules";
import { PACK_SPECS } from "./pack-defs";
import { NOTE_RULES } from "./note-rules";
import type { RuleDef, RulePack } from "./types";

export interface RuleVersion extends RuleDef {
  effectiveFrom: string;
  appliesIf: string;
  authority: string;
  pack?: RulePack;
}

export const RULE_LIB_VERSION = "hkfrs-fy2025.1";
export const ENGINE_VERSION = "goki-p4.0";

function withMeta(def: RuleDef, extra?: Partial<RuleVersion>): RuleVersion {
  return {
    ...def,
    effectiveFrom: extra?.effectiveFrom ?? def.effectiveFrom ?? "2018-01-01",
    appliesIf: extra?.appliesIf ?? def.appliesIf ?? "always",
    authority: extra?.authority ?? def.authority ?? "HKAS 1",
    pack: extra?.pack,
  };
}

export const LIBRARY_MAIN: RuleVersion[] = RULES.map((r) =>
  withMeta(r, {
    authority: r.authority ?? (r.id === "r5" || r.id === "r1" ? "HKAS 7" : r.id === "r6" ? "HKAS 16" : "HKAS 1"),
  }),
);

export const LIBRARY_NOTES: RuleVersion[] = [
  ...NOTE_RULES.map((r) => withMeta(r, { pack: "generic", authority: "HKAS 1 / HKAS 16 / HKFRS 16" })),
  ...Object.values(PACK_SPECS).flatMap((spec) =>
    spec.noteRules.map((r) => withMeta(r, { pack: spec.id, authority: spec.id === "bank" ? "HKFRS 9" : "HKFRS" })),
  ),
];

export const LIBRARY: RuleVersion[] = [...LIBRARY_MAIN, ...LIBRARY_NOTES];

export function applies(entry: RuleVersion, periodStart: string): boolean {
  if (entry.appliesIf.startsWith("period_start >=")) {
    const cut = entry.appliesIf.replace("period_start >=", "").trim();
    return periodStart >= cut;
  }
  if (entry.appliesIf !== "always" && entry.appliesIf.startsWith("pack=")) {
    return true;
  }
  return entry.appliesIf === "always" || !entry.appliesIf;
}

export interface RuleConfig {
  id: string;
  label: string;
  ruleLibVersion: string;
  engineVersion: string;
  periodStart: string;
  entries: RuleVersion[];
}

export const RC_FY2025: RuleConfig = {
  id: "rc-hkfrs-fy2025",
  label: "现行 · HKAS 1 / FY2025",
  ruleLibVersion: RULE_LIB_VERSION,
  engineVersion: ENGINE_VERSION,
  periodStart: "2025-01-01",
  entries: LIBRARY.filter((e) => applies(e, "2025-01-01")),
};

/** HKFRS 18 replaces HKAS 1 presentation for periods beginning on or after 1 Jan 2027. */
export const RC_HKFRS18: RuleConfig = {
  id: "rc-hkfrs-18",
  label: "预演 · HKFRS 18 / 2027+",
  ruleLibVersion: "hkfrs-18.0",
  engineVersion: ENGINE_VERSION,
  periodStart: "2027-01-01",
  entries: LIBRARY.map((e) => ({
    ...e,
    effectiveFrom: "2027-01-01",
    appliesIf: "period_start >= 2027-01-01",
    authority: e.authority === "HKAS 1" ? "HKFRS 18" : e.authority,
  })),
};

export const RULE_CONFIGS: RuleConfig[] = [RC_FY2025, RC_HKFRS18];
