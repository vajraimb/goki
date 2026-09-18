import { COMMANDS } from "./commands";
import { PROGRAM_ID, PROGRAM_TCL } from "./program";
import { createRuntime, evalScript, type Finding, type Step, type StepStatus } from "./runtime";
import { publicationSet } from "../pub";
import { evaluateGate } from "../verdict";
import type { Issuer } from "../types";

export { PROGRAM_ID, PROGRAM_TCL, PROGRAM_PRIMITIVES } from "./program";
export type { Step, Finding, StepStatus, ProvenanceSource } from "./runtime";
export { parseTcl, TclParseError } from "./parse";
export { TclRuntimeError } from "./runtime";

export type Specialist = "accounting_specialist" | "disclosure_specialist" | "none";

export interface ProgramRun {
  programId: string;
  procedureHash: string;
  traceHash: string;
  runHash: string;
  ticker: string;
  name: string;
  specialist: Specialist;
  verdict: string;
  confidence: string;
  awaitingReview: boolean;
  escalations: string[];
  steps: Step[];
  findings: Finding[];
  reviewedBy?: string;
  reviewNote?: string;
}

export interface JsonToolCall {
  tool: string;
  args: Record<string, string>;
  impl: string;
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)!) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function procedureHash(src = PROGRAM_TCL): string {
  return djb2(src);
}

/** Planner may only pick a registered specialist. It cannot rewrite the program. */
export function planSpecialist(issuer: Issuer): Specialist {
  const gate = evaluateGate(issuer);
  if (gate.blocking) return "accounting_specialist";
  const pub = publicationSet(issuer);
  if (pub.some((c) => c.status === "mismatch")) return "disclosure_specialist";
  return "none";
}

function canonicalSteps(steps: Step[], includeReview: boolean): string {
  const rows = steps
    .filter((s) => includeReview || s.cmd !== "review")
    .map((s) => ({
      cmd: s.cmd,
      args: s.args,
      impl: s.impl,
      status: s.status,
      note: s.note,
      group: s.group ?? "",
      extracted: s.extracted ?? {},
      compared: s.compared ?? {},
      model: s.model ?? null,
    }));
  return JSON.stringify({ program: PROGRAM_ID, rows });
}

export function runProgram(issuer: Issuer, opts?: { specialist?: Specialist; source?: string }): ProgramRun {
  const source = opts?.source ?? PROGRAM_TCL;
  const specialist = opts?.specialist ?? planSpecialist(issuer);
  const rt = createRuntime(issuer, COMMANDS);
  rt.vars.set("specialist", specialist);
  evalScript(source, rt);
  const steps = rt.steps;
  const proc = procedureHash(source);
  const trace = djb2(canonicalSteps(steps, false));
  return {
    programId: PROGRAM_ID,
    procedureHash: proc,
    traceHash: trace,
    runHash: djb2(canonicalSteps(steps, true) + proc),
    ticker: issuer.ticker,
    name: issuer.name,
    specialist,
    verdict: rt.vars.get("verdict") ?? "pass",
    confidence: rt.vars.get("confidence") ?? "1",
    awaitingReview: rt.awaitingReview,
    escalations: rt.escalations,
    steps,
    findings: rt.findings,
  };
}

export function signReview(run: ProgramRun, by: string, note: string): ProgramRun {
  const t = run.steps.length + 1;
  const step: Step = {
    id: `s${String(t).padStart(2, "0")}`,
    t,
    line: 0,
    cmd: "review",
    args: [by],
    impl: "human",
    status: "pass",
    note: note || "已签核",
    sources: [],
  };
  const steps = [...run.steps, step];
  return {
    ...run,
    awaitingReview: false,
    reviewedBy: by,
    reviewNote: note,
    steps,
    runHash: djb2(canonicalSteps(steps, true) + run.procedureHash),
  };
}

export function asToolCalls(run: ProgramRun): JsonToolCall[] {
  return run.steps
    .filter((s) => s.cmd !== "parallel" && s.cmd !== "annual_report")
    .map((s) => ({
      tool: s.cmd,
      args: Object.fromEntries(s.args.map((a, i) => [i === 0 ? "target" : `arg${i}`, a])),
      impl: s.impl,
    }));
}
