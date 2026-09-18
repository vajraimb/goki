/** Tcl audit-program smoke. The DSL orchestrates; engines still compute. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildHkIssuers, getHkScored } from "../src/lib/goki/hk-bluechips.ts";
import { evaluateGate } from "../src/lib/goki/verdict.ts";
import { parseTcl } from "../src/lib/goki/tcl/parse.ts";
import { evalExpr } from "../src/lib/goki/tcl/expr.ts";
import {
  asToolCalls,
  planSpecialist,
  procedureHash,
  PROGRAM_ID,
  PROGRAM_TCL,
  runProgram,
  signReview,
} from "../src/lib/goki/tcl/index.ts";

const issuers = buildHkIssuers();
const byTicker = (t) => issuers.find((i) => i.ticker === t);

describe("Tcl subset", () => {
  test("parses nested braces and comments", () => {
    const cmds = parseTcl(PROGRAM_TCL);
    assert.equal(cmds.length, 1);
    assert.equal(cmds[0].words[0].raw, "annual_report");
    assert.equal(cmds[0].words[1].kind, "brace");
    const inner = parseTcl(cmds[0].words[1].raw, cmds[0].words[1].line);
    const names = inner.map((c) => c.words[0].raw);
    assert.deepEqual(names, [
      "extract",
      "extract",
      "parallel",
      "reconcile",
      "collect",
      "if",
      "judge",
      "if",
      "report",
    ]);
  });

  test("if expr after subst", () => {
    const vars = new Map([
      ["anomalies", "3"],
      ["confidence", "0.38"],
      ["verdict", "unresolved"],
    ]);
    assert.equal(evalExpr("$anomalies > 0", vars), true);
    assert.equal(evalExpr("$confidence < 0.9", vars), true);
    assert.equal(evalExpr("$verdict eq unresolved", vars), true);
    assert.equal(evalExpr("$verdict eq pass", vars), false);
  });

  test("unknown command is rejected", () => {
    const iss = byTicker("00005");
    assert.throws(() => runProgram(iss, { source: "invent_numbers\n" }), /unknown command/);
  });
});

describe("program vs trace", () => {
  test("procedure hash is independent of issuer", () => {
    const a = runProgram(byTicker("00005"));
    const b = runProgram(byTicker("00700"));
    assert.equal(a.procedureHash, b.procedureHash);
    assert.equal(a.procedureHash, procedureHash());
    assert.notEqual(a.traceHash, b.traceHash);
    assert.equal(a.programId, PROGRAM_ID);
  });

  test("same issuer twice is byte-identical", () => {
    for (const iss of issuers) {
      const a = runProgram(iss);
      const b = runProgram(iss);
      assert.equal(a.traceHash, b.traceHash, iss.ticker);
      assert.deepEqual(a.steps, b.steps);
    }
  });

  test("rewriting the program changes the procedure hash", () => {
    const src = PROGRAM_TCL.replace("report\n}", "report\n    # extra\n}");
    assert.notEqual(procedureHash(src), procedureHash());
  });

  test("JSON tool calls are a log, not a program", () => {
    const run = runProgram(byTicker("00005"));
    const json = asToolCalls(run);
    assert.ok(json.length >= 8);
    assert.ok(json.every((c) => c.tool && c.impl));
    assert.equal(json.some((c) => c.tool === "if" || c.tool === "parallel"), false);
  });
});

describe("capabilities stay in the engines", () => {
  test("all eleven issuers run", () => {
    for (const iss of issuers) {
      const run = runProgram(iss);
      assert.equal(run.ticker, iss.ticker);
      assert.ok(run.steps.some((s) => s.cmd === "extract" && s.args[0] === "mapping"));
      assert.ok(run.steps.some((s) => s.cmd === "judge"));
      assert.ok(run.steps.some((s) => s.cmd === "report"));
    }
  });

  test("00005 gate is unresolved and MLP does not override", () => {
    const iss = byTicker("00005");
    const gate = evaluateGate(iss);
    const run = runProgram(iss);
    assert.equal(gate.verdict, "unresolved");
    assert.equal(run.verdict, "unresolved");
    assert.equal(run.specialist, "accounting_specialist");
    const spec = run.steps.find((s) => s.cmd === "delegate");
    assert.ok(spec);
    assert.equal(spec.impl, "materiality-net (advisory)");
    assert.match(spec.note, /不进门禁/);
    assert.equal(run.awaitingReview, true);
  });

  test("00011 cash rollforward unable is in the trail", () => {
    const run = runProgram(byTicker("00011"));
    const cash = run.steps.find((s) => s.cmd === "verify" && s.args[0] === "cash_flow");
    assert.ok(cash);
    assert.equal(cash.status, "unable");
    assert.match(cash.note, /现金净增加额/);
  });

  test("planner cannot pick an unregistered specialist", () => {
    const iss = byTicker("00005");
    assert.throws(
      () => runProgram(iss, { specialist: "invented_specialist" }),
      /not a registered specialist/,
    );
    assert.equal(planSpecialist(iss), "accounting_specialist");
  });

  test("sign-off appends a review step and keeps the engine trace", () => {
    const run = runProgram(byTicker("00005"));
    const signed = signReview(run, "复核甲", "已看开口");
    assert.equal(signed.traceHash, run.traceHash);
    assert.notEqual(signed.runHash, run.runHash);
    assert.equal(signed.awaitingReview, false);
    assert.equal(signed.steps.at(-1).cmd, "review");
    assert.equal(run.steps.some((s) => s.cmd === "review"), false);
  });

  test("parallel verify steps share a group", () => {
    const run = runProgram(byTicker("00005"));
    const ver = run.steps.filter((s) => s.cmd === "verify");
    assert.equal(ver.length, 5);
    const g = ver[0].group;
    assert.ok(g);
    assert.ok(ver.every((s) => s.group === g));
  });

  test("queue score still matches the program verdict", () => {
    const scored = getHkScored();
    for (const s of scored) {
      const run = runProgram(s.issuer);
      assert.equal(run.verdict, s.verdict, s.issuer.ticker);
    }
  });
});
