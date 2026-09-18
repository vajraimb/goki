/** ESG desk: separate program, file checks from catalog, KPIs stay unmapped. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildHkIssuers } from "../src/lib/goki/hk-bluechips.ts";
import { esgSet, classifyEsg } from "../src/lib/goki/esg.ts";
import { esgDeskOf } from "../src/lib/goki/esg-desk.ts";
import { evaluateGate } from "../src/lib/goki/verdict.ts";
import { ESG_PROGRAM_ID, esgProcedureHash, runEsgProgram } from "../src/lib/goki/tcl/esg-program.ts";
import { PROGRAM_ID, runProgram } from "../src/lib/goki/tcl/index.ts";
import { parseTcl } from "../src/lib/goki/tcl/parse.ts";
import { ESG_PROGRAM_TCL } from "../src/lib/goki/tcl/esg-program.ts";

const issuers = buildHkIssuers();
const byTicker = (t) => issuers.find((i) => i.ticker === t);

describe("ESG file set", () => {
  test("Xiaomi bilingual ESG inside the annual report passes file and language", () => {
    const checks = esgSet(byTicker("01810"));
    assert.equal(checks.find((c) => c.id === "E01").status, "pass");
    assert.equal(checks.find((c) => c.id === "E02").status, "pass");
    assert.equal(checks.find((c) => c.id === "E03").status, "pass");
    assert.equal(checks.find((c) => c.id === "E12").status, "pass");
  });

  test("HSBC has no ESG file in the catalog so E01 is pending not a silent pass", () => {
    const e01 = esgSet(byTicker("00005")).find((c) => c.id === "E01");
    assert.notEqual(e01.status, "pass");
  });

  test("Tencent English-only ESG is missing the other language", () => {
    const e02 = esgSet(byTicker("00700")).find((c) => c.id === "E02");
    assert.equal(e02.status, "missing");
  });

  test("KPI slots stay unmapped and never pass", () => {
    for (const iss of issuers) {
      for (const id of ["E06", "E07", "E08", "E09", "E10", "E11"]) {
        assert.equal(esgSet(iss).find((c) => c.id === id).status, "unmapped", `${iss.ticker} ${id}`);
      }
    }
  });

  test("classifier does not change the annual gate", () => {
    for (const iss of issuers) {
      const before = evaluateGate(iss).verdict;
      classifyEsg(iss);
      assert.equal(evaluateGate(iss).verdict, before);
    }
  });
});

describe("esg-report@1", () => {
  test("inner commands are the ESG path", () => {
    const cmds = parseTcl(ESG_PROGRAM_TCL);
    assert.equal(cmds[0].words[0].raw, "esg_report");
    const inner = parseTcl(cmds[0].words[1].raw, cmds[0].words[1].line);
    assert.deepEqual(
      inner.map((c) => c.words[0].raw),
      ["extract", "parallel", "classify", "collect", "if", "judge", "if", "report"],
    );
  });

  test("procedure hash is issuer-independent and distinct from annual-report@2", () => {
    const a = runEsgProgram(byTicker("00005"));
    const b = runEsgProgram(byTicker("01810"));
    assert.equal(a.programId, ESG_PROGRAM_ID);
    assert.equal(a.procedureHash, esgProcedureHash());
    assert.equal(a.procedureHash, b.procedureHash);
    assert.notEqual(a.traceHash, b.traceHash);
    assert.notEqual(PROGRAM_ID, ESG_PROGRAM_ID);
    const annual = runProgram(byTicker("00005"));
    assert.notEqual(annual.procedureHash, a.procedureHash);
  });

  test("Xiaomi ESG desk is not_ready because KPIs are unmapped, not hold on files", () => {
    const d = esgDeskOf(byTicker("01810"));
    assert.equal(d.gaps.file, 0);
    assert.ok(d.gaps.unmapped > 0);
    assert.equal(d.decision, "not_ready");
  });

  test("Tencent ESG desk holds on the language pair", () => {
    const d = esgDeskOf(byTicker("00700"));
    assert.equal(d.decision, "hold");
    assert.ok(d.gaps.file > 0);
  });

  test("ack sign does not clear a hold", () => {
    const d = esgDeskOf(byTicker("00700"));
    const signed = esgDeskOf(byTicker("00700"), {
      ticker: "00700",
      by: "测试董秘",
      role: "secretary",
      kind: "release",
      note: "强行签",
      at: "2026-09-18T00:00:00Z",
      procedureHash: d.procedureHash,
      traceHash: d.run.traceHash,
    });
    assert.equal(signed.decision, "hold");
  });
});
