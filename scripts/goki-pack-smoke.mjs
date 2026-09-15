import { buildHkIssuers } from "../src/lib/goki/hk-bluechips.ts";
import { packNoteFeatures, packOf, evaluateMainRules, noteRulesFor } from "../src/lib/goki/packs.ts";
import { maxStrictAbsRel } from "../src/lib/goki/rules.ts";
import { guessPack } from "../src/lib/goki/pack-net.ts";
import { scoreEcl, scoreFv, getEclNet, getFvNet } from "../src/lib/goki/estimate-net.ts";
import { getPackNet } from "../src/lib/goki/pack-net.ts";
import { ensureCloser } from "../src/lib/goki/closer-engine.ts";

const pn = getPackNet();
console.log("Pack-Net acc", pn.acc.toFixed(3), "params", pn.paramCount, "ms", Math.round(pn.trainMs));
const ecl = getEclNet();
console.log("ECL-Net auc", ecl.auc.toFixed(3), "params", ecl.paramCount);
const fv = getFvNet();
console.log("FV-Net auc", fv.auc.toFixed(3), "params", fv.paramCount);

for (const pack of ["generic", "bank", "realty", "energy", "platform", "exchange"]) {
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
  );
}
