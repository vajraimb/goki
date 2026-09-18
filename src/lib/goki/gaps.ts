import { mergeNotes } from "./note-rules";
import { noteFieldsFor, noteRulesFor, packOf } from "./packs";
import { publicationSet, type PubCheck } from "./pub";
import { RULES } from "./rules";
import type { Issuer } from "./types";
import { evaluateGate, type MappingResidual } from "./verdict";
import { vouchIssuer, type VouchCheck } from "./vouch";

/** Why a leftover exists. Gate verdict is unchanged; this is the desk overlay. */
export type GapOrigin = "open" | "unmapped" | "schema" | "formula" | "unwired" | "file";

export const GAP_ORIGIN_LABEL: Record<GapOrigin, string> = {
  open: "真开口",
  unmapped: "映射未齐",
  schema: "主表无槽",
  formula: "公式截断",
  unwired: "目录未接",
  file: "披露不合规",
};

export interface Gap {
  id: string;
  origin: GapOrigin;
  title: string;
  why: string;
  next: string;
  leftover: number;
  leftoverUb: number;
}

export interface GapReport {
  gaps: Gap[];
  open: number;
  unmapped: number;
  formula: number;
  schema: number;
  unwired: number;
  file: number;
  /** True unexplained numbers or non-compliant files. */
  blocksPublish: boolean;
  /** Mapping / catalog / truncated formula — our homework, not the issuer's AR. */
  projectIncomplete: boolean;
}

const FORMULA_MAIN = new Set(["r1", "r5"]);

function disclosedExplainer(r: MappingResidual): boolean {
  return r.explainers.length === 0 && r.knownMissing.length === 0;
}

function noteEmptyFor(issuer: Issuer, ruleId: string): boolean {
  const pack = packOf(issuer);
  const fields = noteFieldsFor(pack).filter((f) => f.group === ruleId);
  if (fields.length === 0) return false;
  const notes = mergeNotes(issuer.currNotes);
  return fields.every((f) => Math.abs(notes[f.key] ?? 0) < 0.5);
}

function originResidual(issuer: Issuer, r: MappingResidual): GapOrigin | null {
  if (r.skipReason || r.kind === "analytic" || r.verdict === "pass") return null;
  if (r.verdict === "incomplete" && Math.abs(r.leftover) <= r.leftoverUb) return null;
  const unable = r.unableReason ?? "";
  if (unable.includes("主表无") || unable.includes("专槽")) return "schema";
  if (unable.startsWith("映射缺项") || unable.includes("刻度不明") || unable.includes("期间标签")) {
    return "unmapped";
  }
  const def = RULES.find((d) => d.id === r.ruleId);
  if (def && !def.strict && FORMULA_MAIN.has(r.ruleId) && !unable) {
    return "formula";
  }
  if (r.explainers.length > 0 || noteEmptyFor(issuer, r.ruleId)) return "unmapped";
  if (!disclosedExplainer(r) && r.knownMissing.length === 0) return "unmapped";
  return "open";
}

function nextFor(origin: GapOrigin, r: MappingResidual | VouchCheck | PubCheck): string {
  if (origin === "unmapped") {
    const miss =
      "unableReason" in r && r.unableReason
        ? r.unableReason
        : "explainers" in r && r.explainers.length
          ? `待映射：${r.explainers.map((e) => e.label).slice(0, 4).join("、")}`
          : "附注槽还是空的";
    return `这是底稿未齐，不是年报造假。${miss}`;
  }
  if (origin === "schema") return "主表没有专槽，不能交叉校验。不要编造合计来闭合。";
  if (origin === "formula") return "简化公式在实报上会开口。完整营运资本未进映射，不作为发刊阻断。";
  if (origin === "unwired") return "目录没有接到这份文件。未接线不能当成通过，也不能当成发行人缺文件。";
  if (origin === "file") return "已接文件但对不上。发刊前必须处理。";
  return "科目已映射，残差仍超容差。发刊前必须解释。";
}

function fromResidual(issuer: Issuer, r: MappingResidual): Gap | null {
  const origin = originResidual(issuer, r);
  if (!origin) return null;
  return {
    id: r.code,
    origin,
    title: r.name,
    why: r.unableReason ?? `${r.code} ${r.verdict}`,
    next: nextFor(origin, r),
    leftover: r.leftover,
    leftoverUb: r.leftoverUb,
  };
}

function fromVouch(v: VouchCheck): Gap | null {
  if (v.verdict === "pass") return null;
  const origin: GapOrigin = v.unableReason?.includes("专槽")
    ? "schema"
    : Math.abs(v.notes) < 0.5
      ? "unmapped"
      : "open";
  return {
    id: v.id,
    origin,
    title: v.name,
    why: v.unableReason ?? `${v.id} ${v.verdict}`,
    next: nextFor(origin, v),
    leftover: v.leftover,
    leftoverUb: v.leftoverUb,
  };
}

function fromPub(c: PubCheck): Gap | null {
  if (c.status === "pass") return null;
  const origin: GapOrigin =
    c.status === "pending" || c.files.length === 0 ? "unwired" : c.status === "missing" || c.status === "mismatch" ? "file" : "unwired";
  const pendingUnwired = c.status === "pending";
  const realFile = c.status === "missing" || c.status === "mismatch";
  if (!pendingUnwired && !realFile) return null;
  return {
    id: c.id,
    origin: pendingUnwired || c.files.length === 0 ? "unwired" : "file",
    title: c.label,
    why: c.note,
    next: nextFor(pendingUnwired || c.files.length === 0 ? "unwired" : "file", c),
    leftover: 0,
    leftoverUb: 0,
  };
}

export function classifyGaps(issuer: Issuer): GapReport {
  const gate = evaluateGate(issuer);
  const pub = publicationSet(issuer);
  const vouch = vouchIssuer(issuer);
  const seen = new Set<string>();
  const gaps: Gap[] = [];
  for (const r of gate.residuals) {
    const g = fromResidual(issuer, r);
    if (!g) continue;
    seen.add(g.id);
    gaps.push(g);
  }
  for (const v of vouch) {
    if (seen.has(v.id)) continue;
    const g = fromVouch(v);
    if (!g) continue;
    seen.add(g.id);
    gaps.push(g);
  }
  for (const c of pub) {
    const g = fromPub(c);
    if (!g) continue;
    gaps.push(g);
  }
  const count = (o: GapOrigin) => gaps.filter((g) => g.origin === o).length;
  const open = count("open");
  const file = count("file");
  const unmapped = count("unmapped");
  const formula = count("formula");
  const schema = count("schema");
  const unwired = count("unwired");
  return {
    gaps,
    open,
    unmapped,
    formula,
    schema,
    unwired,
    file,
    blocksPublish: open + file > 0,
    projectIncomplete: unmapped + formula + schema + unwired > 0,
  };
}

export function noteRuleIds(issuer: Issuer): Set<string> {
  return new Set(noteRulesFor(packOf(issuer)).map((d) => d.id));
}
