import {
  essFilenameOk,
  filingsFor,
  headlineClosed,
  headlinesClosed,
  issuerYearEnd,
  langsOf,
  reportDeadline,
  type Filing,
} from "./filings";
import type { Issuer } from "./types";

export type PubStatus = "pass" | "missing" | "mismatch" | "pending";

export interface PubFileRef {
  essTitle: string;
  lang: Filing["lang"];
  kind: Filing["kind"];
  published: string;
  filename: string;
  url: string;
}

export interface PubCheck {
  id: string;
  label: string;
  status: PubStatus;
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

function pickHeadline(files: Filing[], key: "revenue" | "ni"): NonNullable<Filing["headlines"]>[typeof key] | undefined {
  for (const f of files) {
    const h = f.headlines?.[key];
    if (h) return h;
  }
  return undefined;
}

/** P4 release set. Unwired checks stay 待核 and never pass. */
export function publicationSet(issuer: Issuer): PubCheck[] {
  const ye = issuerYearEnd(issuer);
  const files = ye ? filingsFor(issuer.ticker, ye) : filingsFor(issuer.ticker);
  const ar = ofKind(files, "annual_report");
  const results = ofKind(files, "annual_results");
  const esg = ofKind(files, "esg");
  const clar = ofKind(files, "clarification");
  const due = ye ? reportDeadline(ye) : undefined;

  const p01 = checkLanguagePair(ar);
  const p02 = checkEsgSync(ar, esg, due);
  const p03 = checkEssFilename(files);
  const p04 = checkDeadline(ar, due, ye);
  const p05 = checkResultsVsBooks(issuer, results, ar);
  const p06 = checkLangEquivalence(files);
  const p07: PubCheck = {
    id: "P07",
    label: "澄清公告金标",
    status: "pending",
    note:
      clar.length === 0
        ? "未接入澄清公告集合。没有文件就不能核金标，不作无公告推定。"
        : "澄清公告已接入，金标尚未标注。",
    files: refs(clar),
  };

  return [p01, p02, p03, p04, p05, p06, p07];
}

function checkLanguagePair(ar: Filing[]): PubCheck {
  const id = "P01";
  const label = "中英语言对";
  if (ar.length === 0) {
    return { id, label, status: "pending", note: "未接入年报 PDF，不能核中英页是否成对。", files: [] };
  }
  const langs = langsOf(ar);
  const files = refs(ar);
  if (langs.has("en") && langs.has("zh")) {
    return { id, label, status: "pass", note: `年报中英均在（${ar.length} 份）。成对不等于日期相同。`, files };
  }
  const have = [...langs].join("/");
  return { id, label, status: "missing", note: `年报只有 ${have}，缺另一语言。`, files };
}

function checkEsgSync(ar: Filing[], esg: Filing[], due?: string): PubCheck {
  const id = "P02";
  const label = "ESG 同步";
  if (ar.length === 0 && esg.length === 0) {
    return { id, label, status: "pending", note: "未接入 ESG / 年报，不能核同步。", files: [] };
  }
  if (esg.length === 0) {
    return { id, label, status: "missing", note: "有年报，未见 ESG / 可持续报告文件。", files: refs(ar) };
  }
  if (ar.length === 0) {
    return { id, label, status: "missing", note: "有 ESG，未见年报，不能核同步。", files: refs(esg) };
  }
  const arDay = earliest(ar)?.published;
  const esgDay = earliest(esg)?.published;
  const files = refs([...ar, ...esg]);
  if (!arDay || !esgDay) {
    return { id, label, status: "pending", note: "ESG 或年报缺发布日，不能核同步窗口。", files };
  }
  const lag = dayDiff(esgDay, arDay);
  const inside = lag >= -7 && lag <= 21;
  const beforeDue = !due || esgDay <= due;
  if (inside && beforeDue) {
    const contained = esg.some((f) => f.containedIn === "annual_report");
    return {
      id,
      label,
      status: "pass",
      note: contained ? `ESG 含在年报（${esgDay}）。` : `ESG ${esgDay}，年报 ${arDay}，相差 ${lag} 天。`,
      files,
    };
  }
  return {
    id,
    label,
    status: "mismatch",
    note: `ESG ${esgDay} 与年报 ${arDay} 相差 ${lag} 天${beforeDue ? "" : `，且晚于截止 ${due}`}。`,
    files,
  };
}

function checkEssFilename(files: Filing[]): PubCheck {
  const id = "P03";
  const label = "ESS 标题 vs 文件名";
  if (files.length === 0) {
    return { id, label, status: "pending", note: "未接入港交所 ESS 标题。", files: [] };
  }
  const bad: string[] = [];
  let checked = 0;
  for (const f of files) {
    const ok = essFilenameOk(f);
    if (ok === "skip") continue;
    checked++;
    if (ok === false) {
      const stamped = f.filename ? `${f.filename}` : "无文件名";
      bad.push(`${f.essTitle} · ${stamped}`);
    }
  }
  if (checked === 0) {
    return {
      id,
      label,
      status: "pending",
      note: "已接文件但缺可对的文件名日期戳，标题未核。",
      files: refs(files),
    };
  }
  if (bad.length === 0) {
    return { id, label, status: "pass", note: `${checked} 份标题与文件名日期戳一致。`, files: refs(files) };
  }
  return {
    id,
    label,
    status: "mismatch",
    note: `标题或日期戳对不上：${bad.join("；")}。`,
    files: refs(files),
  };
}

function checkDeadline(ar: Filing[], due?: string, ye?: string): PubCheck {
  const id = "P04";
  const label = "年报截止";
  if (!ye || !due) {
    return { id, label, status: "missing", note: "缺少期间标签，不能算截止日。", files: [] };
  }
  if (ar.length === 0) {
    return { id, label, status: "pending", note: `年结 ${ye}，截止 ${due}。未见年报文件，不能用发布日对截止。`, files: [] };
  }
  const published = earliest(ar);
  if (!published?.published) {
    return { id, label, status: "pending", note: `年报已接入，缺发布日。截止 ${due}。`, files: refs(ar) };
  }
  const onTime = published.published <= due;
  return {
    id,
    label,
    status: onTime ? "pass" : "mismatch",
    note: onTime
      ? `年报 ${published.published} ≤ 截止 ${due}（年结 ${ye}）。`
      : `年报 ${published.published} 晚于截止 ${due}（年结 ${ye}）。`,
    files: refs(ar),
  };
}

function checkResultsVsBooks(issuer: Issuer, results: Filing[], ar: Filing[]): PubCheck {
  const id = "P05";
  const label = "业绩公告 vs 年报数字";
  if (results.length === 0) {
    return { id, label, status: "pending", note: "没有业绩公告可对。不对账。", files: [] };
  }
  const rev = pickHeadline(results, "revenue");
  const ni = pickHeadline(results, "ni");
  if (!rev && !ni) {
    return { id, label, status: "pending", note: "业绩公告未抽数字。", files: refs(results) };
  }
  const bits: string[] = [];
  let open = false;
  if (rev) {
    const ok = headlineClosed(rev, issuer.curr.revenue);
    bits.push(ok ? "收入闭合" : "收入开口");
    if (!ok) open = true;
  }
  if (ni) {
    const ok = headlineClosed(ni, issuer.curr.ni);
    bits.push(ok ? "净利润闭合" : "净利润开口");
    if (!ok) open = true;
  }
  const arRev = pickHeadline(ar, "revenue");
  if (rev && arRev && !headlinesClosed(rev, arRev)) {
    bits.push("业绩公告与年报标题收入不一致");
    open = true;
  }
  return {
    id,
    label,
    status: open ? "mismatch" : "pass",
    note: `${bits.join("，")}。比较用公告自身刻度的半刻度，不读 PDF。`,
    files: refs([...results, ...ar.filter((f) => f.headlines)]),
  };
}

function checkLangEquivalence(files: Filing[]): PubCheck {
  const id = "P06";
  const label = "中英数字 / 日期等价";
  const byKind = new Map<Filing["kind"], Filing[]>();
  for (const f of files) {
    const arr = byKind.get(f.kind) ?? [];
    arr.push(f);
    byKind.set(f.kind, arr);
  }
  const pairs: { kind: Filing["kind"]; en: Filing[]; zh: Filing[] }[] = [];
  for (const [kind, group] of byKind) {
    const langs = langsOf(group);
    if (langs.has("en") && langs.has("zh")) {
      pairs.push({
        kind,
        en: group.filter((f) => f.lang === "en" || f.lang === "bilingual"),
        zh: group.filter((f) => f.lang === "zh" || f.lang === "bilingual"),
      });
    }
  }
  if (pairs.length === 0) {
    const any = files.length > 0;
    return {
      id,
      label,
      status: any ? "missing" : "pending",
      note: any ? "没有中英成对的同一种文件，不能核日期/数字。" : "未接入中英全文。",
      files: refs(files),
    };
  }
  const issues: string[] = [];
  for (const p of pairs) {
    const enDay = earliest(p.en)?.published;
    const zhDay = earliest(p.zh)?.published;
    if (enDay && zhDay && enDay !== zhDay) {
      issues.push(`${p.kind} 英 ${enDay} / 中 ${zhDay}`);
    }
    const enRev = pickHeadline(p.en, "revenue");
    const zhRev = pickHeadline(p.zh, "revenue");
    if (enRev && zhRev && !headlinesClosed(enRev, zhRev)) {
      issues.push(`${p.kind} 中英收入不等`);
    }
  }
  if (issues.length > 0) {
    return { id, label, status: "mismatch", note: `中英不对齐：${issues.join("；")}。`, files: refs(files) };
  }
  const sameDay = pairs.every((p) => {
    const a = earliest(p.en)?.published;
    const b = earliest(p.zh)?.published;
    return !a || !b || a === b;
  });
  return {
    id,
    label,
    status: "pass",
    note: sameDay ? "成对文件同日发布，抽出的数字一致。" : "成对文件日期或数字可对。",
    files: refs(files),
  };
}
