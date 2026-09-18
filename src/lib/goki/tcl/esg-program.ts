import { COMMANDS } from "./commands";
import { createRuntime, evalScript, type Step } from "./runtime";
import { esgSet } from "../esg";
import type { Issuer } from "../types";
import type { ProgramRun, Specialist } from "./index";

export const ESG_PROGRAM_ID = "esg-report@1";

export const ESG_PROGRAM_TCL = `# GOKI ESG report program
# version 1
# Separate from annual-report. Planner binds $specialist only.
# File checks read the catalog. KPI slots stay unmapped until mapped.

esg_report {
    extract filings

    parallel {
        verify file_set
        verify language
        verify sync
        verify climate
        verify social
        verify governance
    }

    classify esg
    collect evidence

    if {$anomalies > 0} {
        investigate anomalies {
            delegate $specialist
        }
    }

    judge esg

    if {$confidence < 0.9} {
        escalate low_confidence
        checkpoint human_review
    }

    report
}
`;

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)!) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function esgProcedureHash(src = ESG_PROGRAM_TCL): string {
  return djb2(src);
}

export function planEsgSpecialist(issuer: Issuer): Specialist {
  const checks = esgSet(issuer);
  if (checks.some((c) => c.status === "mismatch" || c.status === "missing")) return "disclosure_specialist";
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
  return JSON.stringify({ program: ESG_PROGRAM_ID, rows });
}

export function runEsgProgram(issuer: Issuer, opts?: { specialist?: Specialist }): ProgramRun {
  const specialist = opts?.specialist ?? planEsgSpecialist(issuer);
  const rt = createRuntime(issuer, COMMANDS);
  rt.vars.set("specialist", specialist);
  evalScript(ESG_PROGRAM_TCL, rt);
  const steps = rt.steps;
  const proc = esgProcedureHash();
  const trace = djb2(canonicalSteps(steps, false));
  return {
    programId: ESG_PROGRAM_ID,
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
