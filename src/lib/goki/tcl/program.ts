/** Fixed annual-report audit program. Planner may bind $specialist only. */
export const PROGRAM_ID = "annual-report@2";

export const PROGRAM_TCL = `# GOKI annual-report audit program
# version 2
# Core path is fixed. Planner binds $specialist only.
# Commands dispatch to existing engines. This file does not compute identities.
# v2: classify leftover origin so mapping gaps are not labelled as issuer errors.

annual_report {
    extract mapping
    extract filings

    parallel {
        verify balance_sheet
        verify income_statement
        verify cash_flow
        verify notes
        verify publication_set
    }

    reconcile identities
    classify gaps
    collect evidence

    if {$anomalies > 0} {
        investigate anomalies {
            delegate $specialist
        }
    }

    judge

    if {$confidence < 0.9} {
        escalate low_confidence
        checkpoint human_review
    }

    report
}
`;

export const PROGRAM_PRIMITIVES = [
  "extract",
  "calculate",
  "verify",
  "compare",
  "reconcile",
  "classify",
  "evidence",
  "delegate",
  "parallel",
  "if",
  "checkpoint",
  "escalate",
  "judge",
  "report",
] as const;
