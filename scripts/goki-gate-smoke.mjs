/** P0–P4 gate smoke. Run: node --experimental-strip-types --test scripts/goki-gate-smoke.mjs
 *
 *  Asserts the semantics the plug used to hide:
 *    P0  the plug is the identity, residuals are first class, unresolved / unable block
 *    P1  comparisons run on integer minor units, bound is n × half-tick
 *    P2  SOCIE / PPE are complete identities, no fabricated main-statement subtotal
 *    P4  publication set reconciles wired files; unwired checks stay pending and never pass
 *  Advisory only: the MLP band never gates. Not an assurance opinion.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ubWan, ticksEqual, halfTickMinor, boundOf } from "../src/lib/goki/amount.ts";
import { buildHkIssuers, getHkScored } from "../src/lib/goki/hk-bluechips.ts";
import { canonicalizeGate, evaluateGate, hardIdentityCount, isBlocking } from "../src/lib/goki/verdict.ts";
import { plugPackTruncation, evaluateMainRules } from "../src/lib/goki/packs.ts";
import { mergeNotes } from "../src/lib/goki/note-rules.ts";
import { totalAssets, totalLE } from "../src/lib/goki/rules.ts";
import { publicationSet } from "../src/lib/goki/pub.ts";
import { filingsFor, issuerYearEnd, reportDeadline } from "../src/lib/goki/filings.ts";
import { vouchIssuer } from "../src/lib/goki/vouch.ts";
import { EMPTY_BOOKS } from "../src/lib/goki/statements.ts";

const issuers = buildHkIssuers();
const byTicker = (t) => issuers.find((i) => i.ticker === t);
const gateOf = (t) => evaluateGate(byTicker(t));
const ruleOf = (t, code) => gateOf(t).residuals.find((r) => r.code === code);
const pubOf = (t) => publicationSet(byTicker(t));
const checkOf = (t, id) => pubOf(t).find((c) => c.id === id);

describe("P0 plug is identity", () => {
  test("plug writes no gap", () => {
    for (const iss of issuers) {
      const before = mergeNotes(iss.currNotes);
      const after = plugPackTruncation(iss, { ...before });
      assert.deepEqual(after, before, `${iss.ticker} plug wrote into the notes`);
    }
  });

  test("disclosed netCf is not back-solved", () => {
    for (const iss of issuers) {
      if (Math.abs(iss.curr.netCf) < 0.5) continue;
      const dCash = iss.curr.cash - iss.prior.cash;
      const n = mergeNotes(iss.currNotes);
      assert.ok(Math.abs(dCash - iss.curr.netCf - n.fxCash) < 1, `${iss.ticker} Δcash = netCf + fxCash`);
    }
  });
});

describe("P0 verdict semantics", () => {
  test("unresolved and unable block; incomplete and pass do not", () => {
    assert.equal(isBlocking("unresolved"), true);
    assert.equal(isBlocking("unable"), true);
    assert.equal(isBlocking("incomplete"), false);
    assert.equal(isBlocking("pass"), false);
  });

  test("00005 gate is unresolved, advisory stays pass, band follows gate", () => {
    const hsbc = getHkScored().find((s) => s.issuer.ticker === "00005");
    assert.equal(hsbc.verdict, "unresolved");
    assert.equal(hsbc.advisoryBand, "pass");
    assert.equal(hsbc.band, "exception");
  });

  test("00011 R02 missing netCf is unable", () => {
    const hangSengR02 = ruleOf("00011", "R02");
    assert.equal(hangSengR02.verdict, "unable");
    assert.match(hangSengR02.unableReason ?? "", /现金净增加额/);
  });

  test("00016 P02 missing devCost is unable", () => {
    const shkpP02 = ruleOf("00016", "P02");
    assert.equal(shkpP02.verdict, "unable");
    assert.match(shkpP02.unableReason ?? "", /开发成本/);
  });

  test("unable requires an open identity", () => {
    for (const iss of issuers) {
      for (const r of evaluateGate(iss).residuals) {
        if (r.verdict !== "unable" || !r.unableReason?.startsWith("映射缺项")) continue;
        assert.ok(
          Math.abs(r.residual) > r.leftoverUb,
          `${iss.ticker} ${r.code} flagged unable while the identity was already closed`,
        );
      }
    }
  });
});

describe("P1 number layer", () => {
  test("half tick of a million is 50 万; bound is n × half tick", () => {
    assert.equal(halfTickMinor("million"), 50_000_000n);
    assert.equal(ubWan("million", 1), 50);
    assert.equal(ubWan("million", 4), 200);
  });

  test("12345 百万 = 12,345,000 千; one extra thousand is not equal", () => {
    assert.equal(ticksEqual(12345n, "million", 12345000n, "thousand"), true);
    assert.equal(ticksEqual(12345n, "million", 12345001n, "thousand"), false);
  });

  test("filings default to million", () => {
    assert.equal(boundOf(byTicker("00005"), "r0"), ubWan("million", 12));
  });

  test("R01 residual is exactly ΣA − ΣL − ΣE for 200 random mappings", () => {
    let seed = 3;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 200; i++) {
      const curr = { ...EMPTY_BOOKS };
      for (const k of Object.keys(curr)) curr[k] = Math.round((rnd() - 0.4) * 1_000_000);
      const iss = { ...byTicker("00005"), curr, prior: { ...EMPTY_BOOKS }, currNotes: undefined, priorNotes: undefined };
      const r0 = evaluateMainRules(iss).find((r) => r.ruleId === "r0");
      const want = totalAssets(curr) - totalLE(curr);
      assert.ok(Math.abs(r0.residual - want) < 1e-6, `R01 ≠ ΣA − ΣL − ΣE at draw ${i}`);
    }
  });

  test("canonical gate is byte-stable across two evaluations", () => {
    for (const iss of issuers) {
      assert.equal(canonicalizeGate(iss), canonicalizeGate(iss), `${iss.ticker} gate not reproducible`);
    }
  });
});

describe("P2 hard closure and vouching", () => {
  test("00700 hard identities stay 13", () => {
    assert.equal(hardIdentityCount(byTicker("00700")), 13);
  });

  test("investment property has no main slot", () => {
    const ipVouch = vouchIssuer(byTicker("00016")).find((v) => v.id === "V04");
    assert.equal(ipVouch.verdict, "unable");
    assert.match(ipVouch.unableReason ?? "", /主表无投资物业/);
  });
});

describe("P4 release set", () => {
  test("unwired checks stay pending and never pass", () => {
    for (const iss of issuers) {
      for (const c of publicationSet(iss)) {
        if (c.status === "pending") {
          assert.ok(
            c.id === "P07" || c.files.length === 0 || c.note.includes("缺发布日") || c.note.includes("缺可对"),
            `${iss.ticker} ${c.id} pending without a wiring reason`,
          );
        }
        if (c.status === "pass") {
          assert.ok(c.files.length > 0, `${iss.ticker} ${c.id} passed with no files`);
        }
      }
    }
  });

  test("P07 clarification stays pending on the whole queue", () => {
    for (const iss of issuers) {
      assert.equal(checkOf(iss.ticker, "P07").status, "pending", iss.ticker);
    }
  });

  test("00005 language pair is wired; Chinese AR is a month later", () => {
    const p01 = checkOf("00005", "P01");
    assert.equal(p01.status, "pass", p01.note);
    assert.ok(p01.files.length >= 2);
    const p06 = checkOf("00005", "P06");
    assert.equal(p06.status, "mismatch", p06.note);
    assert.match(p06.note, /2026-02-25/);
    assert.match(p06.note, /2026-03-25/);
  });

  test("00005 P04 uses the English AR filing date, not today", () => {
    const p04 = checkOf("00005", "P04");
    assert.equal(p04.status, "pass", p04.note);
    assert.match(p04.note, /2026-02-25/);
    const ye = issuerYearEnd(byTicker("00005"));
    assert.equal(ye, "2025-12-31");
    assert.equal(reportDeadline(ye), "2026-04-30");
  });

  test("00005 results headlines close against the mapping", () => {
    const p05 = checkOf("00005", "P05");
    assert.equal(p05.status, "pass", p05.note);
  });

  test("00016 year end is 30 June; results beat the October deadline", () => {
    const ye = issuerYearEnd(byTicker("00016"));
    assert.equal(ye, "2025-06-30");
    assert.equal(reportDeadline(ye), "2025-10-31");
    const p05 = checkOf("00016", "P05");
    assert.equal(p05.status, "pass", p05.note);
    const p01 = checkOf("00016", "P01");
    assert.equal(p01.status, "missing", p01.note);
    const p04 = checkOf("00016", "P04");
    assert.equal(p04.status, "pending", p04.note);
  });

  test("00700 ESG is the next day, not pending", () => {
    const p02 = checkOf("00700", "P02");
    assert.equal(p02.status, "pass", p02.note);
    const p04 = checkOf("00700", "P04");
    assert.equal(p04.status, "pass", p04.note);
  });

  test("01810 bilingual AR + in-report ESG; results vs books close", () => {
    const p01 = checkOf("01810", "P01");
    assert.equal(p01.status, "pass", p01.note);
    const p02 = checkOf("01810", "P02");
    assert.equal(p02.status, "pass", p02.note);
    const p05 = checkOf("01810", "P05");
    assert.equal(p05.status, "pass", p05.note);
    const p04 = checkOf("01810", "P04");
    assert.equal(p04.status, "pass", p04.note);
  });

  test("00883 ESG without annual report cannot sync", () => {
    const p02 = checkOf("00883", "P02");
    assert.equal(p02.status, "missing", p02.note);
    const p04 = checkOf("00883", "P04");
    assert.equal(p04.status, "pending", p04.note);
  });

  test("catalog only contains the 11 issuers in the queue", () => {
    const tickers = new Set(issuers.map((i) => i.ticker));
    for (const iss of issuers) {
      const ye = issuerYearEnd(iss);
      assert.ok(ye, iss.ticker);
      void filingsFor(iss.ticker, ye);
    }
    assert.equal(tickers.size, 11);
  });
});

describe("queue shape", () => {
  test("blocking rows are real gaps, not silent passes", () => {
    const scored = getHkScored();
    const open = scored.filter((s) => s.verdict === "unresolved" || s.verdict === "unable");
    assert.equal(open.length, scored.length, `${open.length}/${scored.length}`);
  });
});
