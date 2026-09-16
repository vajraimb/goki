import { buildHkIssuers } from "../src/lib/goki/hk-bluechips.ts";
import { packNoteFeatures, packOf, evaluateMainRules, noteRulesFor } from "../src/lib/goki/packs.ts";
import { maxStrictAbsRel } from "../src/lib/goki/rules.ts";
import { guessPack } from "../src/lib/goki/pack-net.ts";
import { scoreEcl, scoreFv, scoreDda, scoreBuyback, scoreSbc, scoreDeferred, getEclNet, getFvNet, getDdaNet, getBuybackNet, getSbcNet, getClNet } from "../src/lib/goki/estimate-net.ts";
import { getPackNet } from "../src/lib/goki/pack-net.ts";
import { getCompleteNet, scoreComplete } from "../src/lib/goki/complete-net.ts";
import { getMapNet, guessLine, HK_LINES, applyTargetWrites } from "../src/lib/goki/map-net.ts";
import { parsePaste, SAMPLE_PASTE, guessSection } from "../src/lib/goki/map-paste.ts";
import { getMateriality, bandIssuer } from "../src/lib/goki/materiality-net.ts";
import { getUnitNet, guessUnit } from "../src/lib/goki/unit-net.ts";
import { ensureCloser } from "../src/lib/goki/closer-engine.ts";

const pn = getPackNet();
console.log("Pack-Net acc", pn.acc.toFixed(3), "params", pn.paramCount, "ms", Math.round(pn.trainMs));
const mn = getMapNet();
console.log("Map-Net syn", mn.acc.toFixed(3), "HK", mn.hkAcc.toFixed(3), "params", mn.paramCount, "in", mn.net.in, "class", mn.net.out ?? "?");
let mapMiss = 0;
for (const l of HK_LINES) {
  const g = guessLine(l.label, l.pack, l.section, l.target);
  if (!g.match) {
    mapMiss++;
    console.log("  miss", l.ticker, l.label, "→", g.target, "want", l.target, g.p.toFixed(2));
  }
}
console.log("Map-Net misses", mapMiss, "/", HK_LINES.length);
const ecl = getEclNet();
console.log("ECL-Net auc", ecl.auc.toFixed(3), "params", ecl.paramCount);
const fv = getFvNet();
console.log("FV-Net auc", fv.auc.toFixed(3), "params", fv.paramCount);
const dda = getDdaNet();
console.log("DDA-Net auc", dda.auc.toFixed(3), "params", dda.paramCount);
const bb = getBuybackNet();
console.log("Buyback-Net auc", bb.auc.toFixed(3), "params", bb.paramCount);
const sbc = getSbcNet();
console.log("SBC-Net auc", sbc.auc.toFixed(3), "params", sbc.paramCount);
const cln = getClNet();
console.log("CL-Net auc", cln.auc.toFixed(3), "params", cln.paramCount);
const cn = getCompleteNet();
console.log("Complete-Net auc", cn.auc.toFixed(3), "params", cn.paramCount, "ms", Math.round(cn.trainMs));
console.log("  slot auc", cn.slotAuc.map((a, i) => a.toFixed(2)).join(" "));

for (const pack of ["generic", "bank", "realty", "energy", "platform", "exchange", "telco"]) {
  const m = ensureCloser(pack);
  console.log("closer", pack, "auc", m.metrics.testAuc.toFixed(3), "acc", m.metrics.testAcc.toFixed(3), "ms", Math.round(m.metrics.trainMs));
}

const issuers = buildHkIssuers();
console.log("--- HK ---");
for (const iss of issuers) {
  const pack = packOf(iss);
  const main = evaluateMainRules(iss);
  const { rules } = packNoteFeatures(iss);
  const hard = maxStrictAbsRel(main);
  const defs = noteRulesFor(pack);
  const ids = rules
    .filter((r) => r.kind === "identity" && !r.skipped)
    .map((r) => {
      const d = defs.find((x) => x.id === r.ruleId);
      return `${d?.code}:${(r.rel * 100).toFixed(1)}%`;
    });
  const g = guessPack(iss);
  const e = scoreEcl(iss);
  const f = scoreFv(iss);
  const d = scoreDda(iss);
  const b = scoreBuyback(iss);
  const c = scoreComplete(iss);
  console.log(
    iss.ticker,
    pack,
    "hard",
    (hard * 100).toFixed(2) + "%",
    "guess",
    g.pack + (g.match ? "*" : "!"),
    ids.join(" "),
    e ? `ecl ${e.pOutlier.toFixed(2)}/${(e.actual * 100).toFixed(2)}%` : "",
    f ? `fv ${f.pOutlier.toFixed(2)}/${(f.actual * 100).toFixed(2)}%` : "",
    d ? `dda ${d.pOutlier.toFixed(2)}/${(d.actual * 100).toFixed(1)}%` : "",
    b ? `bb ${b.pOutlier.toFixed(2)}/${(b.actual * 100).toFixed(1)}%` : "",
    scoreSbc(iss) ? `sbc ${scoreSbc(iss).pOutlier.toFixed(2)}/${(scoreSbc(iss).actual * 100).toFixed(1)}%` : "",
    scoreDeferred(iss) ? `cl ${scoreDeferred(iss).pOutlier.toFixed(2)}/${(scoreDeferred(iss).actual * 100).toFixed(1)}%` : "",
    c.missing.length ? "漏 " + c.missing.map((h) => h.id).join(",") : "齐",
    bandIssuer(iss, main),
  );
}

const shkp = issuers.find((i) => i.ticker === "00016");
const gIp = guessLine("Investment properties", "realty", "note");
const gAdd = guessLine("Additions to investment properties", "realty", "note");
console.log("map Investment properties →", gIp.target, gIp.p.toFixed(2));
console.log("map Additions to investment properties →", gAdd.target, gAdd.p.toFixed(2));
const p01 = packNoteFeatures(shkp).rules.find((r) => r.ruleId === "p1");
const p02 = packNoteFeatures(shkp).rules.find((r) => r.ruleId === "p2");
const e02iss = issuers.find((i) => i.ticker === "00883");
const e02 = packNoteFeatures(e02iss).rules.find((r) => r.ruleId === "e2");
const c0 = scoreComplete(shkp);
const cCnooc = scoreComplete(e02iss);
console.log(
  "SHKP P01",
  (p01.rel * 100).toFixed(1) + "%",
  "P02",
  (p02.rel * 100).toFixed(1) + "%",
  "漏",
  c0.missing.map((h) => h.id).join(",") || "齐",
);
console.log(
  "CNOOC E02",
  (e02.rel * 100).toFixed(1) + "%",
  "漏",
  cCnooc.missing.map((h) => h.id).join(",") || "齐",
);

const parsed = parsePaste(SAMPLE_PASTE);
console.log(
  "paste",
  parsed
    .map((p) => `${p.label}:${p.rawNumber ?? "∅"}${p.unit ?? ""}→${guessLine(p.label, "realty", guessSection(p.label)).target}`)
    .join(" | "),
);
const batch = parsed
  .filter((p) => p.rawNumber)
  .map((p) => {
    const target = guessLine(p.label, "realty", guessSection(p.label)).target;
    const u = guessUnit(shkp, p.rawNumber, 0, p.unit);
    return { ticker: "00016", label: p.label, target, million: u.million };
  });
const shkpB = applyTargetWrites(shkp, batch);
console.log(
  "paste-write P01",
  (packNoteFeatures(shkpB).rules.find((r) => r.ruleId === "p1").rel * 100).toFixed(1) + "%",
  "band",
  bandIssuer(shkp, evaluateMainRules(shkp)),
  "→",
  bandIssuer(shkpB, evaluateMainRules(shkpB)),
);
const un = getUnitNet();
const uM = guessUnit(shkp, 28821, 0);
const uK = guessUnit(shkp, 28821000, 0);
const uY = guessUnit(shkp, 288.21, 0);
const uExp = guessUnit(shkp, 288.21, 0, "yi");
console.log(
  "Unit-Net acc",
  un.acc.toFixed(3),
  "params",
  un.paramCount,
  "28821",
  uM.unit,
  uM.million.toFixed(0),
  "28821000",
  uK.unit,
  uK.million.toFixed(0),
  "288.21",
  uY.unit,
  uY.million.toFixed(0),
  "288.21亿",
  uExp.unit,
  uExp.million.toFixed(0),
);
const mat = getMateriality();
console.log("Materiality-Net acc", mat.acc.toFixed(3), "params", mat.paramCount, "in", mat.net.in);

