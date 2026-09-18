/** Professional heads: synth train, FY2025 holdout, never gate. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildHkIssuers } from "../src/lib/goki/hk-bluechips.ts";
import { evaluateGate } from "../src/lib/goki/verdict.ts";
import { esgDeskOf } from "../src/lib/goki/esg-desk.ts";
import { esgSet } from "../src/lib/goki/esg.ts";
import { scoreEsgNet, trainEsgNet } from "../src/lib/goki/esg-net.ts";
import { scoreTitle, trainTitleNet, titleHoldout } from "../src/lib/goki/title-net.ts";
import { FILINGS } from "../src/lib/goki/filings.ts";
import { trainDeskOf } from "../src/lib/goki/train-desk.ts";

const issuers = buildHkIssuers();

describe("ESG-Net", () => {
  test("training does not change the annual gate or esgSet", () => {
    const beforeGate = issuers.map((i) => evaluateGate(i).verdict);
    const beforeEsg = issuers.map((i) => esgSet(i).map((c) => c.status).join());
    trainEsgNet(71);
    assert.deepEqual(
      issuers.map((i) => evaluateGate(i).verdict),
      beforeGate,
    );
    assert.deepEqual(
      issuers.map((i) => esgSet(i).map((c) => c.status).join()),
      beforeEsg,
    );
  });

  test("holdout never predicts files_ok when the catalog is a file hold", () => {
    trainEsgNet(71);
    for (const iss of issuers) {
      const s = scoreEsgNet(iss);
      if (s.truth === "hold") assert.notEqual(s.label, "files_ok", iss.ticker);
    }
  });

  test("desk decision is independent of the net", () => {
    const a = esgDeskOf(issuers.find((i) => i.ticker === "00700"));
    const b = esgDeskOf(issuers.find((i) => i.ticker === "01810"));
    assert.equal(a.decision, "hold");
    assert.equal(b.decision, "not_ready");
    assert.ok(a.advisory);
  });
});

describe("Title-Net", () => {
  test("real catalog titles are the holdout, not the train set", () => {
    const m = trainTitleNet(73);
    const h = titleHoldout();
    assert.ok(h.n === FILINGS.length);
    assert.ok(m.nTrain > 0);
    assert.equal(h.falseKind, 0);
  });

  test("Xiaomi contained ESG title is not classified as results", () => {
    const f = FILINGS.find((x) => x.ticker === "01810" && x.kind === "esg");
    const s = scoreTitle(f.essTitle, f.filename, f.kind);
    assert.notEqual(s.pred, "annual_results");
  });
});

describe("train desk", () => {
  test("materiality-net is never usable", () => {
    const d = trainDeskOf("materiality-net");
    assert.equal(d.holdout.usable, false);
    assert.equal(d.decision, "hold");
  });

  test("release sign does not clear an unusable head", () => {
    const d = trainDeskOf("materiality-net", {
      modelId: "materiality-net",
      by: "测试",
      kind: "release",
      note: "",
      at: "2026-09-18T00:00:00Z",
      checksum: "deadbeef",
    });
    assert.equal(d.decision, "hold");
  });

  test("esg-net snapshot is deterministic", () => {
    const a = trainDeskOf("esg-net");
    const b = trainDeskOf("esg-net");
    assert.equal(a.head.checksum, b.head.checksum);
  });
});
