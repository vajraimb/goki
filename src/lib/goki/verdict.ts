import { boundOf, closedWan, ctxOf, type AmountCtx } from "./amount";
import { mergeNotes } from "./note-rules";
import { evaluateMainRules, noteFieldsFor, noteRulesFor, packNoteFeatures, packOf } from "./packs";
import { RULES } from "./rules";
import type { Issuer, NoteBooks, RuleResult, YearBooks } from "./types";

/** P0 gate. MLP bands stay advisory. unresolved / unable block. */
export const VERDICTS = ["pass", "incomplete", "unresolved", "unable"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: "通过",
  incomplete: "不全",
  unresolved: "未解释",
  unable: "不能评",
};

export const VERDICT_RANK: Record<Verdict, number> = {
  pass: 0,
  incomplete: 1,
  unresolved: 2,
  unable: 3,
};

/** Slot-empty threshold in 万元. Gate close uses n × half-tick instead. */
export const RESIDUAL_EPS = 0.5;

export function isBlocking(v: Verdict): boolean {
  return v === "unresolved" || v === "unable";
}

export function worstVerdict(a: Verdict, b: Verdict): Verdict {
  return VERDICT_RANK[b] > VERDICT_RANK[a] ? b : a;
}

export interface SlotHint {
  key: string;
  label: string;
  book: "year" | "note";
  value: number;
  coef: number;
  needed: number;
}

export interface MappingResidual {
  ruleId: string;
  code: string;
  name: string;
  kind: "identity" | "analytic";
  residual: number;
  leftover: number;
  leftoverUb: number;
  rel: number;
  scale: number;
  verdict: Verdict;
  blocking: boolean;
  skipReason?: string;
  unableReason?: string;
  knownMissing: SlotHint[];
  explainers: SlotHint[];
}

export interface Gate {
  verdict: Verdict;
  blocking: boolean;
  residuals: MappingResidual[];
  blockingRules: MappingResidual[];
}

type Term = {
  key: string;
  label: string;
  book: "year" | "note";
  coef: number;
};

const EQUITY_OMITTED: Term[] = [
  { key: "tci", label: "综合收益总额", book: "note", coef: 1 },
  { key: "oci", label: "OCI", book: "note", coef: 1 },
  { key: "buyback", label: "回购", book: "note", coef: -1 },
  { key: "sbp", label: "股份支付", book: "note", coef: 1 },
  { key: "nci", label: "少数股东", book: "note", coef: 1 },
  { key: "otherEq", label: "其他权益", book: "note", coef: 1 },
  { key: "ownerTx", label: "与所有者交易", book: "note", coef: 1 },
  { key: "eqTransfer", label: "权益转拨", book: "note", coef: 1 },
];

const MAIN_OMITTED: Record<string, Term[]> = {
  r1: [{ key: "fxCash", label: "现金汇兑", book: "note", coef: 1 }],
  r2: [],
  r6: [],
  r7: [{ key: "deferredTaxAdj", label: "递延调节", book: "note", coef: 1 }],
};

const MAIN_REQUIRED_YEAR: Record<string, { key: keyof YearBooks; label: string }[]> = {
  r1: [{ key: "netCf", label: "现金净增加额" }],
  r5: [{ key: "cfo", label: "经营现金流" }],
};

const NOTE_REQUIRED: Record<string, { key: keyof NoteBooks; label: string }[]> = {
  b1: [{ key: "ecl", label: "ECL 准备" }],
  b2: [{ key: "loansGross", label: "贷款总额" }],
  p1: [{ key: "ip", label: "投资物业" }],
  p2: [{ key: "devCost", label: "开发成本" }],
  e2: [{ key: "prov", label: "弃置准备" }],
  t3: [{ key: "cl", label: "合同负债" }],
  c4: [{ key: "cl", label: "合同负债" }],
  x1: [{ key: "ownCash", label: "公司自有现金" }],
};

const NOTE_DUP_MAIN: Record<string, string> = {
  n0: "r2",
  n1: "r6",
};

function disclosed(v: number): boolean {
  return Math.abs(v) >= RESIDUAL_EPS;
}

function readTerm(issuer: Issuer, notes: NoteBooks, t: Term): number {
  if (t.book === "year") return issuer.curr[t.key as keyof YearBooks] ?? 0;
  return notes[t.key as keyof NoteBooks] ?? 0;
}

function hintOf(t: Term, value: number, leftover: number): SlotHint {
  const coef = t.coef === 0 ? 1 : t.coef;
  return { key: t.key, label: t.label, book: t.book, value, coef, needed: leftover / coef };
}

function decide(args: {
  leftover: number;
  leftoverUb: number;
  knownMissing: SlotHint[];
  unableReason?: string;
}): Pick<MappingResidual, "verdict" | "blocking" | "unableReason"> {
  if (args.unableReason) return { verdict: "unable", blocking: true, unableReason: args.unableReason };
  if (!closedWan(args.leftover, args.leftoverUb)) return { verdict: "unresolved", blocking: true };
  if (args.knownMissing.length) return { verdict: "incomplete", blocking: false };
  return { verdict: "pass", blocking: false };
}

function scaleUnable(issuer: Issuer): string | undefined {
  if (issuer.source === "hkex" && !issuer.sourceScale && !issuer.unitLabel) {
    return "刻度不明：年报未标注金额单位。";
  }
  return undefined;
}

function periodUnable(issuer: Issuer, rollforward: boolean): string | undefined {
  if (!rollforward) return undefined;
  if (issuer.source === "hkex" && !issuer.periodLabel) return "期间标签不匹配：缺少可比期间。";
  return undefined;
}

function judgeMain(issuer: Issuer, r: RuleResult, ctx: AmountCtx): MappingResidual {
  const def = RULES.find((d) => d.id === r.ruleId)!;
  const notes = mergeNotes(issuer.currNotes);
  const leftoverUb = boundOf(issuer, r.ruleId);
  const base = {
    ruleId: r.ruleId,
    code: def.code,
    name: def.name,
    kind: (r.kind ?? def.kind) as "identity" | "analytic",
    residual: r.residual,
    leftover: r.residual,
    leftoverUb,
    rel: r.rel,
    scale: r.scale,
    knownMissing: [] as SlotHint[],
    explainers: [] as SlotHint[],
  };
  if (r.skipped) {
    return { ...base, verdict: "pass", blocking: false, skipReason: r.skipReason };
  }
  if (def.kind === "analytic") {
    return { ...base, verdict: "pass", blocking: false };
  }
  const unable = scaleUnable(issuer) ?? periodUnable(issuer, r.ruleId !== "r0" && r.ruleId !== "r3" && r.ruleId !== "r4");
  const required = MAIN_REQUIRED_YEAR[r.ruleId] ?? [];
  for (const req of required) {
    if (!disclosed(issuer.curr[req.key]) && disclosed(r.residual)) {
      const d = decide({ leftover: r.residual, leftoverUb, knownMissing: [], unableReason: `映射缺项：${req.label}` });
      return {
        ...base,
        leftover: r.residual,
        explainers: [hintOf({ key: req.key, label: req.label, book: "year", coef: 1 }, issuer.curr[req.key], r.residual)],
        ...d,
      };
    }
  }
  const omitted = MAIN_OMITTED[r.ruleId] ?? [];
  const knownMissing: SlotHint[] = [];
  let leftover = r.residual;
  for (const t of omitted) {
    const v = readTerm(issuer, notes, t);
    if (disclosed(v)) {
      knownMissing.push(hintOf(t, v, leftover));
      leftover -= v * t.coef;
    }
  }
  const explainers = omitted
    .filter((t) => !disclosed(readTerm(issuer, notes, t)))
    .map((t) => hintOf(t, readTerm(issuer, notes, t), leftover));
  if (r.ruleId === "r2") {
    for (const t of EQUITY_OMITTED) {
      if (!disclosed(readTerm(issuer, notes, t))) explainers.push(hintOf(t, 0, leftover));
    }
  }
  if (r.ruleId === "r0") {
    explainers.push(
      hintOf({ key: "otherCa", label: "其他流动资产", book: "year", coef: 1 }, issuer.curr.otherCa, leftover),
      hintOf({ key: "otherNca", label: "其他非流动资产", book: "year", coef: 1 }, issuer.curr.otherNca, leftover),
      hintOf({ key: "otherL", label: "其他负债", book: "year", coef: -1 }, issuer.curr.otherL, leftover),
    );
  }
  const d = decide({ leftover, leftoverUb, knownMissing, unableReason: unable });
  return { ...base, leftover, leftoverUb, knownMissing, explainers, ...d };
}

function judgeNote(issuer: Issuer, r: RuleResult): MappingResidual {
  const pack = packOf(issuer);
  const def = noteRulesFor(pack).find((d) => d.id === r.ruleId);
  const notes = mergeNotes(issuer.currNotes);
  const leftoverUb = boundOf(issuer, r.ruleId);
  const code = def?.code ?? r.ruleId;
  const name = def?.name ?? r.ruleId;
  const kind = (r.kind ?? def?.kind ?? "identity") as "identity" | "analytic";
  const base = {
    ruleId: r.ruleId,
    code,
    name,
    kind,
    residual: r.residual,
    leftover: r.residual,
    leftoverUb,
    rel: r.rel,
    scale: r.scale,
    knownMissing: [] as SlotHint[],
    explainers: [] as SlotHint[],
  };
  if (r.skipped) return { ...base, verdict: "pass", blocking: false, skipReason: r.skipReason };
  if (kind === "analytic") return { ...base, verdict: "pass", blocking: false };

  const unable = scaleUnable(issuer) ?? periodUnable(issuer, true);
  const required = NOTE_REQUIRED[r.ruleId] ?? [];
  for (const req of required) {
    if (!disclosed(notes[req.key]) && disclosed(r.residual)) {
      const d = decide({
        leftover: r.residual,
        leftoverUb,
        knownMissing: [],
        unableReason: `映射缺项：${req.label}`,
      });
      return {
        ...base,
        explainers: [hintOf({ key: req.key, label: req.label, book: "note", coef: 1 }, notes[req.key], r.residual)],
        ...d,
      };
    }
  }

  const group = noteFieldsFor(pack).filter((f) => f.group === r.ruleId);
  const extra = r.ruleId === "n0" || r.ruleId === "b0" ? EQUITY_OMITTED : [];
  const terms: Term[] =
    group.length > 0
      ? group.map((f) => ({ key: f.key, label: f.label, book: "note" as const, coef: 1 }))
      : extra;
  const leftover = r.residual;
  const explainers = terms
    .filter((t) => !disclosed(readTerm(issuer, notes, t)))
    .map((t) => hintOf(t, readTerm(issuer, notes, t), leftover));
  const d = decide({ leftover, leftoverUb, knownMissing: [], unableReason: unable });
  return { ...base, leftover, leftoverUb, explainers, ...d };
}

export function evaluateGate(issuer: Issuer): Gate {
  const ctx = ctxOf(issuer);
  const main = evaluateMainRules(issuer);
  const { rules: note } = packNoteFeatures(issuer);
  const residuals = [
    ...main.map((r) => judgeMain(issuer, r, ctx)),
    ...note
      .filter((r) => {
        const dup = NOTE_DUP_MAIN[r.ruleId];
        if (!dup) return true;
        const mainHit = main.find((m) => m.ruleId === dup);
        return Boolean(mainHit?.skipped);
      })
      .map((r) => judgeNote(issuer, r)),
  ];
  let verdict: Verdict = "pass";
  for (const r of residuals) {
    if (r.skipReason || r.kind === "analytic") continue;
    verdict = worstVerdict(verdict, r.verdict);
  }
  const blockingRules = residuals.filter((r) => r.blocking && !r.skipReason && r.kind === "identity");
  return { verdict, blocking: isBlocking(verdict), residuals, blockingRules };
}

export function gateToBand(v: Verdict): "exception" | "review" | "pass" {
  if (v === "pass") return "pass";
  if (v === "incomplete") return "review";
  return "exception";
}

export function verdictTone(v: Verdict): "exception" | "review" | "pass" {
  return gateToBand(v);
}

export function hardIdentityCount(issuer: Issuer): number {
  return evaluateGate(issuer).residuals.filter((r) => r.kind === "identity" && !r.skipReason).length;
}

export function canonicalizeGate(issuer: Issuer): string {
  const gate = evaluateGate(issuer);
  const rows = gate.residuals
    .filter((r) => r.kind === "identity" && !r.skipReason)
    .map((r) => ({
      code: r.code,
      leftover: Math.round(r.leftover),
      ub: Math.round(r.leftoverUb),
      verdict: r.verdict,
      missing: r.knownMissing.map((k) => k.key).sort(),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return JSON.stringify({ verdict: gate.verdict, rows });
}
