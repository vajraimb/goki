/** Canonical number layer. Gate compares integer minor units (cents/fen).
 *  YearBooks stay a 万元 view for MLP features. Do not compare floats. */

export const SOURCE_SCALES = ["unit", "thousand", "million", "yi"] as const;
export type SourceScaleName = (typeof SOURCE_SCALES)[number];

export const CURRENCIES = ["HKD", "RMB", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Currency units per disclosed tick. */
export const UNITS_PER_TICK: Record<SourceScaleName, bigint> = {
  unit: 1n,
  thousand: 1_000n,
  million: 1_000_000n,
  yi: 100_000_000n,
};

export const SCALE_LABEL: Record<SourceScaleName, string> = {
  unit: "元",
  thousand: "千元",
  million: "百万元",
  yi: "亿元",
};

export const MINOR_PER_UNIT = 100n;
export const WAN_UNITS = 10_000n;

export interface Amount {
  minor: bigint;
  currency: Currency;
  scale: SourceScaleName;
}

export interface AmountCtx {
  currency: Currency;
  scale: SourceScaleName;
}

export function absBig(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export function gcd(a: bigint, b: bigint): bigint {
  a = absBig(a);
  b = absBig(b);
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return (absBig(a) / gcd(a, b)) * absBig(b);
}

export function lcmScale(a: SourceScaleName, b: SourceScaleName): bigint {
  return lcm(UNITS_PER_TICK[a], UNITS_PER_TICK[b]);
}

/** Lift disclosed ticks onto a target units-per-tick. Exact only when from divides target or vice versa. */
export function liftTicks(ticks: bigint, from: SourceScaleName, toUnitsPerTick: bigint): bigint {
  return (ticks * UNITS_PER_TICK[from]) / toUnitsPerTick;
}

/** Exact compare: ticks × units_per_tick in currency units. */
export function ticksEqual(
  aTicks: bigint,
  aScale: SourceScaleName,
  bTicks: bigint,
  bScale: SourceScaleName,
): boolean {
  return aTicks * UNITS_PER_TICK[aScale] === bTicks * UNITS_PER_TICK[bScale];
}

export function fromTicks(ticks: number, ctx: AmountCtx): Amount {
  const t = BigInt(Math.round(ticks));
  return {
    minor: t * UNITS_PER_TICK[ctx.scale] * MINOR_PER_UNIT,
    currency: ctx.currency,
    scale: ctx.scale,
  };
}

export function fromWan(wan: number, ctx: AmountCtx): Amount {
  const w = BigInt(Math.round(wan));
  return { minor: w * WAN_UNITS * MINOR_PER_UNIT, currency: ctx.currency, scale: ctx.scale };
}

export function toWanNumber(a: Amount): number {
  return Number(a.minor / (WAN_UNITS * MINOR_PER_UNIT));
}

export function halfTickMinor(scale: SourceScaleName): bigint {
  return (UNITS_PER_TICK[scale] * MINOR_PER_UNIT) / 2n;
}

/** n × half-tick, in 万元. */
export function ubWan(scale: SourceScaleName, nTerms: number): number {
  const n = BigInt(Math.max(1, nTerms));
  const minor = halfTickMinor(scale) * n;
  return Number(minor / (WAN_UNITS * MINOR_PER_UNIT));
}

export function closedMinor(residual: bigint, ub: bigint): boolean {
  return absBig(residual) <= ub;
}

export function closedWan(residualWan: number, ub: number): boolean {
  return Math.abs(residualWan) <= ub + 1e-9;
}

export function subAtLcm(a: Amount, b: Amount): Amount {
  if (a.currency !== b.currency) throw new Error("currency mismatch");
  const scale = UNITS_PER_TICK[a.scale] >= UNITS_PER_TICK[b.scale] ? a.scale : b.scale;
  return { minor: a.minor - b.minor, currency: a.currency, scale };
}

export const RULE_TERM_N: Record<string, number> = {
  r0: 12,
  r1: 3,
  r2: 8,
  r3: 3,
  r4: 3,
  r5: 6,
  r6: 9,
  r7: 4,
  n0: 8,
  n1: 9,
  n2: 3,
  n3: 4,
  n4: 4,
  n5: 4,
  n6: 4,
  n7: 3,
  b1: 5,
  b2: 3,
  p1: 6,
  p2: 5,
  e1: 7,
  e2: 5,
  e3: 4,
  t3: 4,
  c1: 5,
  c2: 4,
  c3: 4,
  c4: 4,
  x1: 5,
  x2: 2,
  x3: 2,
};

export function termN(ruleId: string): number {
  return RULE_TERM_N[ruleId] ?? 4;
}

export function ctxOf(issuer: {
  currency?: string;
  sourceScale?: string;
}): AmountCtx {
  const currency = (CURRENCIES as readonly string[]).includes(issuer.currency ?? "")
    ? (issuer.currency as Currency)
    : "HKD";
  const scale = (SOURCE_SCALES as readonly string[]).includes(issuer.sourceScale ?? "")
    ? (issuer.sourceScale as SourceScaleName)
    : "million";
  return { currency, scale };
}

export function sourceUnitLabel(ctx: AmountCtx): string {
  const cur = ctx.currency === "RMB" ? "人民币" : ctx.currency === "USD" ? "美元" : "港元";
  return `${SCALE_LABEL[ctx.scale]}${cur}`;
}

export function boundOf(issuer: { currency?: string; sourceScale?: string }, ruleId: string): number {
  return ubWan(ctxOf(issuer).scale, termN(ruleId));
}
