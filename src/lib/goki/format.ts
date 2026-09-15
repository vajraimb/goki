/** Values are stored in 万元. */
export function wan(n: number, digits = 0): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 10000) return `${sign}${(a / 10000).toFixed(2)} 亿`;
  if (a >= 100) return `${sign}${a.toLocaleString("zh-CN", { maximumFractionDigits: digits })} 万`;
  return `${sign}${a.toFixed(Math.max(digits, 1))} 万`;
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
