import type { MapSection } from "./map-net";
import type { UnitId } from "./unit-net";

export interface PastedLine {
  label: string;
  rawNumber: number | null;
  unit: UnitId | null;
  raw: string;
}

function parseUnit(suffix: string): UnitId | null {
  const s = suffix.trim().toLowerCase();
  if (!s) return null;
  if (/^(亿|bn)$/.test(s)) return "yi";
  if (/^(百万|million|mn|m)$/.test(s)) return "million";
  if (/^(万元|万)$/.test(s)) return "wan";
  if (/^(千元|千|thousand|k)$/.test(s)) return "thousand";
  return null;
}

function takeAmount(token: string): { n: number; unit: UnitId | null } | null {
  const m = token.match(/^(-?[\d,]+(?:\.\d+)?)(亿|bn|百万|million|mn|m|万元|万|千元|千|thousand|k)?$/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return { n, unit: parseUnit(m[2] ?? "") };
}

export function parsePaste(text: string): PastedLine[] {
  const out: PastedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith("#") || s.startsWith("//")) continue;
    const parts = s.split(/[\t,，]+|\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const last = takeAmount(parts[parts.length - 1]!);
      if (last) {
        parts.pop();
        const label = parts.join(" ").trim();
        if (label) {
          out.push({ label, rawNumber: last.n, unit: last.unit, raw: s });
          continue;
        }
      }
    }
    const spaced = s.match(/^(.*\S)\s+(-?[\d,]+(?:\.\d+)?)(亿|bn|百万|million|mn|万元|万|千元|千|thousand|k)?$/i);
    if (spaced) {
      const n = Number(spaced[2]!.replace(/,/g, ""));
      if (Number.isFinite(n)) {
        out.push({ label: spaced[1]!.trim(), rawNumber: n, unit: parseUnit(spaced[3] ?? ""), raw: s });
        continue;
      }
    }
    out.push({ label: s, rawNumber: null, unit: null, raw: s });
  }
  return out;
}

export function guessSection(label: string): MapSection {
  const h = label.toLowerCase();
  if (/cash flow|经营活动|现金流量/.test(h)) return "cf";
  if (/revenue|net operating|营业收入|净利润|除税后|profit for the year/.test(h)) return "is";
  if (
    /loans and advances|customer deposits|cash and cash|货币资金|央行|存货$|^inventor|plant and equipment|物业及设备/.test(
      h,
    )
  ) {
    return "bs";
  }
  return "note";
}

export const SAMPLE_PASTE = `Investment properties 417045
Additions to investment properties 8228
Transfer from properties for sale 2836
Fair value changes of investment properties -2730`;
