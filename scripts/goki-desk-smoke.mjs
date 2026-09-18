/** Company-secretary desk: origin overlay, models live audit, sign cannot flip a hold. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildHkIssuers } from "../src/lib/goki/hk-bluechips.ts";
import { deskOf } from "../src/lib/goki/desk.ts";
import { classifyGaps } from "../src/lib/goki/gaps.ts";
import { evaluateGate } from "../src/lib/goki/verdict.ts";
import { publicationSet } from "../src/lib/goki/pub.ts";
import { bandIssuer } from "../src/lib/goki/materiality-net.ts";
import { evaluateMainRules } from "../src/lib/goki/packs.ts";
import { PROGRAM_ID, procedureHash } from "../src/lib/goki/tcl/index.ts";
import { auditModelsLive } from "../src/lib/goki/model-audit.ts";
import { workCases } from "../src/lib/goki/workflow.ts";

const issuers = buildHkIssuers();
const byTicker = (t) => issuers.find((i) => i.ticker === t);

describe("secretary desk", () => {
  test("procedure is annual-report@2 and hash is issuer-independent", () => {
    const a = deskOf(byTicker("00005"));
    const b = deskOf(byTicker("00700"));
    assert.equal(a.procedureId, PROGRAM_ID);
    assert.equal(PROGRAM_ID, "annual-report@2");
    assert.equal(a.procedureHash, procedureHash());
    assert.equal(a.procedureHash, b.procedureHash);
    assert.notEqual(a.run.traceHash, b.run.traceHash);
  });

  test("classifier does not change the gate", () => {
    for (const iss of issuers) {
      const before = evaluateGate(iss).verdict;
      classifyGaps(iss);
      assert.equal(evaluateGate(iss).verdict, before);
    }
  });

  test("HSBC P06 mismatch is a file origin; ack sign does not clear", () => {
    const hsbc = byTicker("00005");
    const d = deskOf(hsbc);
    const p06 = d.gaps.gaps.find((g) => g.id === "P06");
    assert.ok(p06);
    assert.equal(p06.origin, "file");
    assert.equal(d.decision, "hold");
    const signed = deskOf(hsbc, {
      ticker: "00005",
      by: "测试董秘",
      role: "secretary",
      kind: "ack",
      note: "已知悉",
      at: "2026-09-18T00:00:00Z",
      procedureHash: d.procedureHash,
      traceHash: d.run.traceHash,
    });
    assert.equal(signed.decision, "hold");
    const released = deskOf(hsbc, {
      ticker: "00005",
      by: "测试董秘",
      role: "secretary",
      kind: "release",
      note: "强行签",
      at: "2026-09-18T00:00:00Z",
      procedureHash: d.procedureHash,
      traceHash: d.run.traceHash,
    });
    assert.equal(released.decision, "hold");
  });

  test("MLP advisory never matches a pass decision when gate blocks", () => {
    for (const iss of issuers) {
      const d = deskOf(iss);
      const gate = evaluateGate(iss);
      const adv = bandIssuer(iss, evaluateMainRules(iss));
      if (d.decision === "clear" || d.decision === "awaiting_sign") {
        assert.equal(gate.verdict, "pass");
      }
      assert.equal(d.advisoryBand, adv);
      assert.ok(d.advisoryNote.includes("不用于发刊") || d.advisoryNote.includes("咨询"));
    }
  });

  test("unwired publication checks stay pending and never count as file origin", () => {
    for (const iss of issuers) {
      const pub = publicationSet(iss);
      const report = classifyGaps(iss);
      for (const c of pub.filter((x) => x.status === "pending")) {
        const g = report.gaps.find((x) => x.id === c.id);
        if (!g) continue;
        assert.equal(g.origin, "unwired", `${iss.ticker} ${c.id}`);
      }
    }
  });

  test("stale sign does not count", () => {
    const iss = byTicker("00016");
    const d = deskOf(iss, {
      ticker: "00016",
      by: "旧签",
      role: "secretary",
      kind: "release",
      note: "",
      at: "2025-01-01T00:00:00Z",
      procedureHash: "deadbeef",
      traceHash: "deadbeef",
    });
    assert.equal(d.signStale, true);
    assert.notEqual(d.decision, "clear");
  });

  test("Materiality-Net is not usable on this queue", () => {
    const audit = auditModelsLive(issuers);
    const mat = audit.cards.find((c) => c.id === "materiality-net");
    assert.equal(mat.usable, false);
  });

  test("every blocking case has a department and at least one link", () => {
    for (const iss of issuers) {
      const cases = workCases(iss, []);
      assert.ok(cases.length > 0, iss.ticker);
      for (const c of cases) {
        assert.ok(c.deptLabel, `${iss.ticker} ${c.gap.id} dept`);
        assert.ok(c.links.length > 0, `${iss.ticker} ${c.gap.id} links`);
      }
    }
  });

  test("HSBC P06 links to both language annual reports", () => {
    const hsbc = byTicker("00005");
    const p06 = workCases(hsbc, []).find((c) => c.gap.id === "P06");
    assert.ok(p06);
    assert.equal(p06.dept, "ir");
    const hrefs = p06.links.filter((l) => l.external).map((l) => l.href);
    assert.ok(hrefs.some((h) => h.includes("260225-annual-report")));
    assert.ok(hrefs.some((h) => h.includes("260325-annual-report")));
  });

  test("returning a case does not flip a hold", () => {
    const hsbc = byTicker("00005");
    const d0 = deskOf(hsbc);
    const d1 = deskOf(hsbc, undefined, [
      {
        ticker: "00005",
        gapId: "P06",
        dept: "ir",
        kind: "return",
        by: "核验人",
        note: "请IR核对中英发布日",
        at: "2026-09-18T00:00:00Z",
      },
    ]);
    assert.equal(d0.decision, "hold");
    assert.equal(d1.decision, "hold");
    const p06 = d1.tonight.find((x) => x.id === "P06");
    assert.equal(p06.caseState, "returned");
    assert.equal(p06.deptLabel, "投资者关系");
  });
});
