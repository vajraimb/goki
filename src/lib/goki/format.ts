import { SCALE_LABEL, sourceUnitLabel, type AmountCtx } from "./amount";

/** Values are stored in 万元. */
export function wan(n: number, digits = 0): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 10000) return `${sign}${(a / 10000).toFixed(2)} 亿`;
  if (a >= 100) return `${sign}${a.toLocaleString("zh-CN", { maximumFractionDigits: digits })} 万`;
  return `${sign}${a.toFixed(Math.max(digits, 1))} 万`;
}

/** Same 万元 view printed in the filing's disclosed tick. */
export function ticks(n: number, ctx?: AmountCtx, digits = 1): string {
  if (!ctx) return wan(n, digits);
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (ctx.scale === "million") {
    const m = a / 100;
    return `${sign}${m.toLocaleString("zh-CN", { maximumFractionDigits: digits })} ${SCALE_LABEL[ctx.scale]}`;
  }
  if (ctx.scale === "thousand") {
    const k = a * 10;
    return `${sign}${k.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} ${SCALE_LABEL[ctx.scale]}`;
  }
  if (ctx.scale === "yi") {
    return `${sign}${(a / 10000).toFixed(2)} ${SCALE_LABEL[ctx.scale]}`;
  }
  return `${sign}${(a * 10000).toLocaleString("zh-CN", { maximumFractionDigits: 0 })} ${SCALE_LABEL[ctx.scale]}`;
}

export function scaleChip(ctx?: AmountCtx): string {
  if (!ctx) return "刻度不明";
  return sourceUnitLabel(ctx);
}

export function pct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n) * 100;
  if (abs >= 1000) return `${sign}≥1,000%`;
  return `${sign}${abs.toFixed(digits)}%`;
}

export function signedPct(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${(Math.abs(n) * 100).toFixed(digits)}%`;
}

export function compactP(p: number): string {
  return p.toFixed(3);
}

export function aeFmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 100) return n.toExponential(1);
  return n.toFixed(3);
}

export function checksumShort(h: string): string {
  return h.slice(0, 4) + "·" + h.slice(-4);
}
