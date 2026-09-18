import { evalExpr } from "./expr";
import { parseTcl, substWord, type TclCommand, type TclWord } from "./parse";
import type { Issuer } from "../types";
import type { Gate } from "../verdict";
import type { PubCheck } from "../pub";
import type { VouchCheck } from "../vouch";
import type { Filing } from "../filings";

export type StepStatus = "pass" | "fail" | "unable" | "pending" | "skip" | "review";

export interface ProvenanceSource {
  kind: "mapping" | "filing" | "note" | "model" | "gate" | "pub";
  label: string;
  ticker?: string;
  url?: string;
}

export interface Step {
  id: string;
  t: number;
  line: number;
  cmd: string;
  args: string[];
  impl: string;
  status: StepStatus;
  note: string;
  group?: string;
  parent?: string;
  sources: ProvenanceSource[];
  extracted?: Record<string, string | number>;
  compared?: Record<string, string | number>;
  model?: { name: string; output: string };
}

export interface Finding {
  id: string;
  title: string;
  status: StepStatus;
  note: string;
  leftover?: number;
  leftoverUb?: number;
  steps: string[];
  sources: ProvenanceSource[];
}

export interface TclRuntime {
  issuer: Issuer;
  vars: Map<string, string>;
  steps: Step[];
  findings: Finding[];
  sources: ProvenanceSource[];
  gate?: Gate;
  pub?: PubCheck[];
  vouch?: VouchCheck[];
  filings?: Filing[];
  advisory?: { name: string; band: string };
  awaitingReview: boolean;
  escalations: string[];
  clock: number;
  group?: string;
  parent?: string;
  judged?: string;
  reported: boolean;
  commands: CommandTable;
}

export type CommandFn = (rt: TclRuntime, args: string[], cmd: TclCommand) => void;
export type CommandTable = Record<string, CommandFn>;

export class TclRuntimeError extends Error {
  line: number;
  constructor(line: number, message: string) {
    super(`line ${line}: ${message}`);
    this.line = line;
    this.name = "TclRuntimeError";
  }
}

export function createRuntime(issuer: Issuer, commands: CommandTable): TclRuntime {
  return {
    issuer,
    vars: new Map<string, string>([
      ["ticker", issuer.ticker],
      ["name", issuer.name],
      ["anomalies", "0"],
      ["blocking", "0"],
      ["confidence", "1"],
      ["verdict", "pass"],
      ["specialist", "none"],
    ]),
    steps: [],
    findings: [],
    sources: [],
    awaitingReview: false,
    escalations: [],
    clock: 0,
    reported: false,
    commands,
  };
}

export function addStep(
  rt: TclRuntime,
  rec: Omit<Step, "id" | "t" | "group" | "parent"> & { group?: string; parent?: string },
): Step {
  rt.clock += 1;
  const step: Step = {
    ...rec,
    id: `s${String(rt.clock).padStart(2, "0")}`,
    t: rt.clock,
    group: rec.group ?? rt.group,
    parent: rec.parent ?? rt.parent,
  };
  rt.steps.push(step);
  return step;
}

export function evalScript(src: string, rt: TclRuntime, startLine = 1): void {
  const cmds = parseTcl(src, startLine);
  for (const c of cmds) evalCommand(c, rt);
}

export function evalCommand(cmd: TclCommand, rt: TclRuntime): void {
  if (cmd.words.length === 0) return;
  const name = substWord(cmd.words[0]!, rt.vars);
  const args = cmd.words.slice(1).map((w) => substWord(w, rt.vars));
  if (name === "if") {
    builtinIf(rt, cmd.words.slice(1), cmd.line);
    return;
  }
  if (name === "set") {
    if (args.length < 2) throw new TclRuntimeError(cmd.line, "set needs a name and a value");
    rt.vars.set(args[0]!, args.slice(1).join(" "));
    return;
  }
  const fn = rt.commands[name];
  if (!fn) throw new TclRuntimeError(cmd.line, `unknown command ${name}`);
  fn(rt, args, cmd);
}

function builtinIf(rt: TclRuntime, words: TclWord[], line: number): void {
  if (words.length < 2) throw new TclRuntimeError(line, "if needs a condition and a body");
  const cond = substWord(
    { raw: words[0]!.raw, kind: words[0]!.kind === "brace" ? "quote" : words[0]!.kind, line: words[0]!.line },
    rt.vars,
  );
  let ok: boolean;
  try {
    ok = evalExpr(cond, rt.vars);
  } catch (e) {
    throw new TclRuntimeError(line, e instanceof Error ? e.message : "bad if");
  }
  const thenBody = words[1]!;
  if (ok) {
    evalScript(thenBody.raw, rt, thenBody.line);
    return;
  }
  if (words.length >= 4 && substWord(words[2]!, rt.vars) === "else") {
    evalScript(words[3]!.raw, rt, words[3]!.line);
  }
}
