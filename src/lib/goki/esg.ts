import {
  essFilenameOk,
  filingsFor,
  FILING_KIND_LABEL,
  FILING_LANG_LABEL,
  issuerYearEnd,
  langsOf,
  reportDeadline,
  type Filing,
} from "./filings";
import type { Issuer } from "./types";
import type { PubFileRef } from "./pub";
import type { Gap, GapOrigin, GapReport } from "./gaps";
import { DEPT, type DeptId, type GapLink } from "./workflow";

export type EsgStatus = "pass" | "missing" | "mismatch" | "pending" | "unmapped";

export type EsgGroup = "file" | "sync" | "climate" | "social" | "governance";

export interface EsgCheck {
  id: string;
  group: EsgGroup;
  label: string;
  status: EsgStatus;
  note: string;
  files: PubFileRef[];
}

function refs(files: Filing[]): PubFileRef[] {
  return files.map((f) => ({
    essTitle: f.essTitle,
    lang: f.lang,
    kind: f.kind,
    published: f.published,
    filename: f.filename,
    url: f.url,
  }));
}

function ofKind(files: Filing[], kind: Filing["kind"]): Filing[] {
  return files.filter((f) => f.kind === kind);
}

function dated(files: Filing[]): Filing[] {
  return files.filter((f) => f.published);
}

function earliest(files: Filing[]): Filing | undefined {
  const d = dated(files);
  if (d.length === 0) return undefined;
  return d.slice().sort((a, b) => a.published.localeCompare(b.published))[0];
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

function checkFile(esg: Filing[]): EsgCheck {
  const id = "E01";
  const label = "ESG 报告文件";
  if (esg.length === 0) {
    return { id, label, group: "file", status: "pending", note: "未接入 ESG / 可持续报告文件。", files: [] };
  }
  const contained = esg.some((f) => f.containedIn === "annual_report");
  const naked = esg.filter((f) => !f.url && !f.filename);
  if (naked.length === esg.length) {
    return {
      id,
      label,
      group: "file",
      status: "pending",
      note: "目录有标题，未见 PDF 地址，不能当已发布。",
      files: refs(esg),
    };
  }
  return {
    id,
    label,
    group: "file",
    status: "pass",
    note: contained ? `ESG 含在年报（${esg.length} 份）。` : `ESG 文件 ${esg.length} 份。`,
    files: refs(esg),
  };
}

function checkLanguage(esg: Filing[]): EsgCheck {
  const id = "E02";
  const label = "中英语言对";
  if (esg.length === 0) {
    return { id, label, group: "file", status: "pending", note: "未接入 ESG，不能核中英。", files: [] };
  }
  const langs = langsOf(esg);
  const files = refs(esg);
  if (langs.has("en") && langs.has("zh")) {
    return { id, label, group: "file", status: "pass", note: `ESG 中英均在（${esg.length} 份）。`, files };
  }
  return {
    id,
    label,
    group: "file",
    status: "missing",
    note: `ESG 只有 ${[...langs].join("/")}，缺另一语言。`,
    files,
  };
}

function checkSync(ar: Filing[], esg: Filing[], due?: string): EsgCheck {
  const id = "E03";
  const label = "与年报同步";
  if (esg.length === 0 && ar.length === 0) {
    return { id, label, group: "sync", status: "pending", note: "年报与 ESG 都未接入，不能核同步。", files: [] };
  }
  if (esg.length === 0) {
    return { id, label, group: "sync", status: "missing", note: "有年报，未见 ESG。港交所要求与年报同步刊发。", files: refs(ar) };
  }
  if (ar.length === 0) {
    return { id, label, group: "sync", status: "pending", note: "有 ESG，年报未接入，不能核同步窗口。", files: refs(esg) };
  }
  const arDay = earliest(ar)?.published;
  const esgDay = earliest(esg)?.published;
  const files = refs([...ar, ...esg]);
  if (!arDay || !esgDay) {
    return { id, label, group: "sync", status: "pending", note: "ESG 或年报缺发布日。", files };
  }
  const lag = dayDiff(esgDay, arDay);
  const inside = lag >= -7 && lag <= 21;
  const beforeDue = !due || esgDay <= due;
  if (inside && beforeDue) {
    const contained = esg.some((f) => f.containedIn === "annual_report");
    return {
      id,
      label,
      group: "sync",
      status: "pass",
      note: contained ? `ESG 含在年报（${esgDay}）。` : `ESG ${esgDay}，年报 ${arDay}，相差 ${lag} 天。`,
      files,
    };
  }
  return {
    id,
    label,
    group: "sync",
    status: "mismatch",
    note: `ESG ${esgDay} 与年报 ${arDay} 相差 ${lag} 天${beforeDue ? "" : `，且晚于截止 ${due}`}。`,
    files,
  };
}

function checkDeadline(esg: Filing[], due?: string, ye?: string): EsgCheck {
  const id = "E04";
  const label = "法定同步截止";
  if (!ye || !due) {
    return { id, label, group: "sync", status: "missing", note: "缺少期间标签，不能算截止日。", files: [] };
  }
  if (esg.length === 0) {
    return { id, label, group: "sync", status: "pending", note: `年结 ${ye}，截止 ${due}。未见 ESG，不能用发布日对截止。`, files: [] };
  }
  const day = earliest(esg)?.published;
  if (!day) {
    return { id, label, group: "sync", status: "pending", note: `ESG 已接入，缺发布日。截止 ${due}。`, files: refs(esg) };
  }
  if (day <= due) {
    return { id, label, group: "sync", status: "pass", note: `ESG ${day}，截止 ${due}。`, files: refs(esg) };
  }
  return { id, label, group: "sync", status: "mismatch", note: `ESG ${day} 晚于截止 ${due}。`, files: refs(esg) };
}

function checkEss(esg: Filing[]): EsgCheck {
  const id = "E05";
  const label = "ESS 标题 vs 文件名";
  if (esg.length === 0) {
    return { id, label, group: "file", status: "pending", note: "未接入 ESG 标题。", files: [] };
  }
  const issues: string[] = [];
  let checked = 0;
  for (const f of esg) {
    const ok = essFilenameOk(f);
    if (ok === "skip") continue;
    checked += 1;
    if (ok === false) issues.push(f.essTitle);
  }
  if (checked === 0) {
    return { id, label, group: "file", status: "pending", note: "已接文件但缺可对的文件名日期戳。", files: refs(esg) };
  }
  if (issues.length) {
    return { id, label, group: "file", status: "mismatch", note: `标题与文件名对不上：${issues.join("；")}。`, files: refs(esg) };
  }
  return { id, label, group: "file", status: "pass", note: `${checked} 份标题与文件名日期戳一致。`, files: refs(esg) };
}

function unmapped(id: string, group: EsgGroup, label: string, note: string, files: Filing[]): EsgCheck {
  return {
    id,
    label,
    group,
    status: "unmapped",
    note,
    files: refs(files),
  };
}

function checkCrossRef(ar: Filing[], esg: Filing[]): EsgCheck {
  const id = "E12";
  const label = "与年报交叉引用";
  if (esg.length === 0) {
    return { id, label, group: "sync", status: "pending", note: "未见 ESG，不能核是否含在年报或交叉引用。", files: [] };
  }
  if (esg.some((f) => f.containedIn === "annual_report")) {
    return { id, label, group: "sync", status: "pass", note: "ESG 声明含在年报 PDF。", files: refs(esg) };
  }
  if (ar.length === 0) {
    return { id, label, group: "sync", status: "pending", note: "独立 ESG。年报未接入，不能核交叉引用页。", files: refs(esg) };
  }
  return {
    id,
    label,
    group: "sync",
    status: "unmapped",
    note: "独立 ESG。交叉引用页码未进目录，不编造页码。",
    files: refs([...esg, ...ar]),
  };
}

/** HKEX Appendix C2 + FY2025 climate. File checks use the catalog. KPI slots stay unmapped until mapped from the PDF. */
export function esgSet(issuer: Issuer): EsgCheck[] {
  const ye = issuerYearEnd(issuer);
  const files = ye ? filingsFor(issuer.ticker, ye) : filingsFor(issuer.ticker);
  const ar = ofKind(files, "annual_report");
  const esg = ofKind(files, "esg");
  const due = ye ? reportDeadline(ye) : undefined;
  return [
    checkFile(esg),
    checkLanguage(esg),
    checkSync(ar, esg, due),
    checkDeadline(esg, due, ye),
    checkEss(esg),
    unmapped("E06", "governance", "董事会 ESG 声明", "董事会声明未进目录。不把未见写成无声明。", esg),
    unmapped("E07", "climate", "气候 Scope 1 / 2", "FY2025 主板须披露范围一、二。排放数字未映射，不当已披露。", esg),
    unmapped("E08", "climate", "气候 Scope 3", "范围三分阶段。未映射则待核，不作无排放推定。", esg),
    unmapped("E09", "climate", "能源 / 水 / 废弃物", "环境定量 KPI 未进目录。", esg),
    unmapped("E10", "social", "雇员 / 安全 / 反贪", "社会定量 KPI 未进目录。", esg),
    unmapped("E11", "governance", "独立鉴证", "有无有限/合理鉴证未标注。不作无鉴证推定。", esg),
    checkCrossRef(ar, esg),
  ];
}

export function esgOrigin(c: EsgCheck): GapOrigin | null {
  if (c.status === "pass") return null;
  if (c.status === "unmapped") return "unmapped";
  if (c.status === "pending") return "unwired";
  return "file";
}

export function classifyEsg(issuer: Issuer): GapReport {
  const checks = esgSet(issuer);
  const gaps: Gap[] = [];
  for (const c of checks) {
    const origin = esgOrigin(c);
    if (!origin) continue;
    gaps.push({
      id: c.id,
      origin,
      title: c.label,
      why: c.note,
      next:
        origin === "unmapped"
          ? "这是底稿未齐。打开 ESG 把董事会声明和定量 KPI 映射进来，不要用模型填数。"
          : origin === "unwired"
            ? "目录没有接到这份文件。未接线不能当成通过。"
            : "已接文件对不上。发刊前必须处理。",
      leftover: 0,
      leftoverUb: 0,
    });
  }
  const count = (o: GapOrigin) => gaps.filter((g) => g.origin === o).length;
  const file = count("file");
  const unmappedN = count("unmapped");
  const unwired = count("unwired");
  return {
    gaps,
    open: 0,
    unmapped: unmappedN,
    formula: 0,
    schema: 0,
    unwired,
    file,
    blocksPublish: file > 0,
    projectIncomplete: unmappedN + unwired > 0,
  };
}

export function esgLinks(issuer: Issuer, check: EsgCheck): GapLink[] {
  const out: GapLink[] = [];
  for (const f of check.files) {
    if (!f.url) continue;
    out.push({
      label: `打开${FILING_KIND_LABEL[f.kind]}（${FILING_LANG_LABEL[f.lang]}）`,
      href: f.url,
      external: true,
    });
  }
  out.push({ label: "年报发刊台", href: `/?ticker=${encodeURIComponent(issuer.ticker)}` });
  return out;
}

export function esgDept(check: EsgCheck): DeptId {
  if (check.group === "climate" || check.group === "social" || check.group === "governance") return "sustainability";
  if (check.id === "E04") return "cosec";
  return "ir";
}

export { DEPT };
