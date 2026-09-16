/** P0–P2 gate smoke. Run: node --experimental-strip-types scripts/goki-gate-smoke.mjs
 *
 *  Asserts the semantics the plug used to hide:
 *    P0  the plug is the identity, residuals are first class, unresolved / unable block
 *    P1  comparisons run on integer minor units, bound is n × half-tick
 *    P2  SOCIE / PPE are complete identities, no fabricated main-statement subtotal
 *  Advisory only: the MLP band never gates. Not an assurance opinion.
 */
import assert from "node:assert/strict";
import { ubWan, ticksEqual, halfTickMinor, boundOf } from "../src/lib/goki/amount.ts";
import { buildHkIssuers, getHkScored } from "../src/lib/goki/hk-bluechips.ts";
import { canonicalizeGate, evaluateGate, hardIdentityCount, isBlocking } from "../src/lib/goki/verdict.ts";
import { plugPackTruncation, evaluateMainRules } from "../src/lib/goki/packs.ts";
import { mergeNotes } from "../src/lib/goki/note-rules.ts";
import { totalAssets, totalLE } from "../src/lib/goki/rules.ts";
import { publicationSet } from "../src/lib/goki/pub.ts";
import { vouchIssuer } from "../src/lib/goki/vouch.ts";
import { EMPTY_BOOKS } from "../src/lib/goki/statements.ts";

let checks = 0;
function ok(label, cond, detail = "") {
  checks++;
  assert.ok(cond, `${label} ${detail}`);
  console.log("  ok", label, detail);
}

const issuers = buildHkIssuers();
const byTicker = (t) => issuers.find((i) => i.ticker === t);
const gateOf = (t) => evaluateGate(byTicker(t));
const ruleOf = (t, code) => gateOf(t).residuals.find((r) => r.code === code);

/* ── P0: the plug writes nothing ── */
console.log("P0 plug is identity");
for (const iss of issuers) {
  const before = mergeNotes(iss.currNotes);
  const after = plugPackTruncation(iss, { ...before });
  assert.deepEqual(after, before, `${iss.ticker} plug wrote into the notes`);
}
ok("plug writes no gap", true, `${issuers.length} issuers`);

/* ── P0: cash-flow lines are never back-solved ── */
console.log("P0 no fabricated cash flow");
for (const iss of issuers) {
  if (Math.abs(iss.curr.netCf) < 0.5) continue;
  const dCash = iss.curr.cash - iss.prior.cash;
  const n = mergeNotes(iss.currNotes);
  ok(
    `${iss.ticker} netCf disclosed`,
    Math.abs(dCash - iss.curr.netCf - n.fxCash) < 1,
    "Δcash = netCf + fxCash",
  );
}

/* ── P0: four verdicts, the last two block ── */
console.log("P0 verdict semantics");
ok("unresolved blocks", isBlocking("unresolved"));
ok("unable blocks", isBlocking("unable"));
ok("incomplete does not block", !isBlocking("incomplete"));
ok("pass does not block", !isBlocking("pass"));

const hsbc = getHkScored().find((s) => s.issuer.ticker === "00005");
ok("00005 gate", hsbc.verdict === "unresolved", hsbc.verdict);
ok("00005 advisory stays pass", hsbc.advisoryBand === "pass", String(hsbc.advisoryBand));
ok("00005 band follows gate", hsbc.band === "exception", hsbc.band);

const hangSengR02 = ruleOf("00011", "R02");
ok("00011 R02 missing netCf", hangSengR02.verdict === "unable", hangSengR02.unableReason ?? "");

const shkpP02 = ruleOf("00016", "P02");
ok("00016 P02 missing devCost", shkpP02.verdict === "unable", shkpP02.unableReason ?? "");

/* ── P0: a missing slot only blocks while the identity is still open ── */
console.log("P0 empty slot with a closed identity is not unable");
for (const iss of issuers) {
  for (const r of evaluateGate(iss).residuals) {
    if (r.verdict !== "unable" || !r.unableReason?.startsWith("映射缺项")) continue;
    assert.ok(
      Math.abs(r.residual) > r.leftoverUb,
      `${iss.ticker} ${r.code} flagged unable while the identity was already closed`,
    );
  }
}
ok("unable requires an open identity", true);

/* ── P1: integer minor units, n × half-tick ── */
console.log("P1 number layer");
ok("half tick of a million", halfTickMinor("million") === 50_000_000n, "50 万 in minor units");
ok("bound is n × half tick", ubWan("million", 1) === 50 && ubWan("million", 4) === 200, "万元");
ok("12345 百万 = 12,345,000 千", ticksEqual(12345n, "million", 12345000n, "thousand"));
ok("one extra thousand is not equal", !ticksEqual(12345n, "million", 12345001n, "thousand"));
ok("filings default to million", boundOf(byTicker("00005"), "r0") === ubWan("million", 12));

/* ── P1: R01 residual is exactly ΣA − ΣL − ΣE, for any mapping ── */
console.log("P1 R01 residual identity");
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
ok("R01 = ΣA − ΣL − ΣE", true, "200 random mappings");

/* ── P1: same mapping, byte-identical gate ── */
console.log("P1 deterministic replay");
for (const iss of issuers) {
  assert.equal(canonicalizeGate(iss), canonicalizeGate(iss), `${iss.ticker} gate not reproducible`);
}
ok("canonical gate is stable", true, `${issuers.length} issuers`);

/* ── P2: hard identities and no fabricated subtotal ── */
console.log("P2 hard closure and vouching");
ok("00700 hard identities", hardIdentityCount(byTicker("00700")) === 13, String(hardIdentityCount(byTicker("00700"))));
const ipVouch = vouchIssuer(byTicker("00016")).find((v) => v.id === "V04");
ok("investment property has no main slot", ipVouch.verdict === "unable", ipVouch.unableReason ?? "");

/* ── P4: unwired files stay pending, never pass ── */
console.log("P4 release set");
const pub = publicationSet(byTicker("00005"));
ok("unwired checks stay pending", pub.filter((c) => c.status === "pending").length >= 5);
ok("no unwired check passes", pub.every((c) => c.status !== "pass" || c.id === "P04"));

/* ── queue shape ── */
const scored = getHkScored();
const open = scored.filter((s) => s.verdict === "unresolved" || s.verdict === "unable");
console.log(
  `\nqueue: ${scored.length} issuers, ${open.length} blocking ` +
    `(${scored.filter((s) => s.verdict === "unable").length} unable, ` +
    `${scored.filter((s) => s.verdict === "unresolved").length} unresolved)`,
);
ok("blocking rows are real gaps, not silent passes", open.length === scored.length, `${open.length}/${scored.length}`);

console.log(`\n${checks} checks passed. Advisory MLP never gates. Not an assurance opinion.`);
