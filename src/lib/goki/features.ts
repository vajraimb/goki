import { INDUSTRIES, type Issuer } from "./types";
import { evaluateRules, RULES } from "./rules";

export const N_RULES = RULES.length;
export const N_INDUSTRY = INDUSTRIES.length;
export const N_FEATURES = N_RULES * 3 + N_INDUSTRY;

export const FEATURE_NAMES: string[] = [
  ...RULES.flatMap((r) => [`${r.code}_resid_log`, `${r.code}_rel`, `${r.code}_yoy`]),
  ...INDUSTRIES.map((ind) => `ind_${ind}`),
];

function signedLog1p(x: number): number {
  return Math.sign(x) * Math.log1p(Math.abs(x));
}

export function issuerFeatures(issuer: Issuer): { features: number[]; rules: ReturnType<typeof evaluateRules> } {
  const rules = evaluateRules(issuer.prior, issuer.curr);
  const feats = new Array<number>(N_FEATURES).fill(0);
  for (let i = 0; i < N_RULES; i++) {
    const r = rules[i]!;
    feats[i * 3] = signedLog1p(r.residual);
    feats[i * 3 + 1] = r.rel;
    feats[i * 3 + 2] = r.yoy;
  }
  const ind = INDUSTRIES.indexOf(issuer.industry);
  feats[N_RULES * 3 + ind] = 1;
  return { features: feats, rules };
}

export function labelOf(issuer: Issuer): number {
  return issuer.inject === "true_error" ? 1 : 0;
}

export function standardize(
  rows: number[][],
  mean?: Float64Array,
  std?: Float64Array,
): { data: Float32Array[]; mean: Float64Array; std: Float64Array } {
  const d = N_FEATURES;
  const n = rows.length;
  const m = mean ?? new Float64Array(d);
  const s = std ?? new Float64Array(d);
  if (!mean) {
    for (let j = 0; j < d; j++) {
      let a = 0;
      for (let i = 0; i < n; i++) a += rows[i]![j]!;
      m[j] = a / n;
    }
    for (let j = 0; j < d; j++) {
      let a = 0;
      for (let i = 0; i < n; i++) {
        const v = rows[i]![j]! - m[j]!;
        a += v * v;
      }
      s[j] = Math.sqrt(a / Math.max(n, 1)) + 1e-6;
    }
  }
  const data = rows.map((r) => {
    const o = new Float32Array(d);
    for (let j = 0; j < d; j++) o[j] = (r[j]! - m[j]!) / s[j]!;
    return o;
  });
  return { data, mean: m, std: s };
}
