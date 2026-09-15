import { writeFileSync } from "node:fs";
import { runEngagement } from "../src/lib/goki/engine.ts";

const round = (n, d = 4) => {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** d;
  return Math.round(n * p) / p;
};

const eng = runEngagement();
const compact = {
  seed: eng.seed,
  backend: eng.backend,
  logs: eng.logs.map((l) => ({
    epoch: l.epoch,
    trainBce: round(l.trainBce, 6),
    valBce: round(l.valBce, 6),
    aeMse: round(l.aeMse, 6),
    regMse: round(l.regMse, 6),
  })),
  metrics: { ...eng.metrics, trainMs: Math.round(eng.metrics.trainMs) },
  routine: eng.routine,
  golden: eng.golden,
  featureNames: eng.featureNames,
  rows: eng.issuers.map((s) => ({
    id: s.issuer.id,
    pError: round(s.pError, 4),
    aeErr: round(s.aeErr, 4),
    cashPred: round(s.cashPred, 4),
    cashResidual: round(s.cashResidual, 4),
    band: s.band,
    attribution: s.attribution.map((a) => ({
      name: a.name,
      value: round(a.value, 4),
    })),
  })),
};

const out = "/workspace/src/lib/goki/compact.json";
writeFileSync(out, JSON.stringify(compact));
console.log("wrote", out, "bytes", Buffer.byteLength(JSON.stringify(compact)));
