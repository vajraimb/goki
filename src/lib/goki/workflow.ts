import { filingsFor, FILING_KIND_LABEL, FILING_LANG_LABEL, issuerYearEnd } from "./filings";
import { classifyGaps, type Gap, type GapOrigin, type GapReport } from "./gaps";
import { publicationSet } from "./pub";
import type { Issuer } from "./types";

export type DeptId = "reporting" | "ir" | "cosec" | "policy" | "sustainability";

export const DEPT: Record<DeptId, { label: string; owns: string }> = {
  reporting: { label: "财务报告", owns: "主表、附注映射与勾稽。改完回核验台再核。" },
  ir: { label: "投资者关系", owns: "年报、ESG、业绩公告。缺文件或中英不对要补。" },
  cosec: { label: "公司秘书", owns: "披露截止、澄清公告、发刊签核。" },
  policy: { label: "会计政策", owns: "简化公式与主表槽位。不是发行人账错。" },
  sustainability: { label: "可持续发展", owns: "董事会声明、气候与社会定量、独立鉴证。打开 ESG 映射，不编造排放。" },
};

export interface GapLink {
  label: string;
  href: string;
  external?: boolean;
}

export type TicketKind = "return" | "recheck";

export interface Ticket {
  ticker: string;
  gapId: string;
  dept: DeptId;
  kind: TicketKind;
  by: string;
  note: string;
  at: string;
}

export type CaseState = "open" | "returned" | "recheck";

export interface WorkCase {
  gap: Gap;
  dept: DeptId;
  deptLabel: string;
  owns: string;
  links: GapLink[];
  state: CaseState;
  ticket?: Ticket;
}

export const FLOW_STEPS = [
  { id: "triage", label: "分派开口" },
  { id: "return", label: "退回部门" },
  { id: "recheck", label: "收回再核" },
  { id: "sign", label: "董秘签核" },
  { id: "release", label: "可发" },
] as const;

export type FlowStep = (typeof FLOW_STEPS)[number]["id"];

export function deptOf(origin: GapOrigin, id: string): DeptId {
  if (origin === "formula" || origin === "schema") return "policy";
  if (id === "P04" || id === "P07") return "cosec";
  if (origin === "file" || origin === "unwired") return "ir";
  return "reporting";
}

function fileLinks(issuer: Issuer, gapId: string): GapLink[] {
  const pub = publicationSet(issuer);
  const check = pub.find((c) => c.id === gapId);
  const out: GapLink[] = [];
  for (const f of check?.files ?? []) {
    if (!f.url) continue;
    out.push({
      label: `打开${FILING_KIND_LABEL[f.kind]}（${FILING_LANG_LABEL[f.lang]}）`,
      href: f.url,
      external: true,
    });
  }
  return out;
}

function reportLinks(issuer: Issuer): GapLink[] {
  const ye = issuerYearEnd(issuer);
  const files = ye ? filingsFor(issuer.ticker, ye) : filingsFor(issuer.ticker);
  const out: GapLink[] = [];
  for (const f of files) {
    if (!f.url) continue;
    if (f.kind !== "annual_report" && f.kind !== "annual_results") continue;
    out.push({
      label: `打开${FILING_KIND_LABEL[f.kind]}（${FILING_LANG_LABEL[f.lang]}）`,
      href: f.url,
      external: true,
    });
  }
  return out.slice(0, 3);
}

export function linksFor(issuer: Issuer, gap: Gap): GapLink[] {
  const t = issuer.ticker;
  const internal: GapLink[] = [
    { label: "看残差", href: `/issuer/hk-${t}` },
    { label: "去改映射", href: `/map?ticker=${encodeURIComponent(t)}` },
    { label: "核验程序", href: `/program?ticker=${encodeURIComponent(t)}` },
  ];
  if (gap.origin === "file" || gap.origin === "unwired") {
    const files = fileLinks(issuer, gap.id);
    return [
      ...files,
      { label: "看残差", href: `/issuer/hk-${t}` },
    ];
  }
  if (gap.origin === "formula" || gap.origin === "schema") {
    return [
      { label: "看规则", href: "/rules" },
      { label: "核验程序", href: `/program?ticker=${encodeURIComponent(t)}` },
      { label: "看残差", href: `/issuer/hk-${t}` },
    ];
  }
  return [...reportLinks(issuer), ...internal];
}

export function latestTicket(tickets: Ticket[], ticker: string, gapId: string): Ticket | undefined {
  for (let i = tickets.length - 1; i >= 0; i--) {
    const t = tickets[i]!;
    if (t.ticker === ticker && t.gapId === gapId) return t;
  }
  return undefined;
}

export function caseState(ticket?: Ticket): CaseState {
  if (!ticket) return "open";
  return ticket.kind === "recheck" ? "recheck" : "returned";
}

export function workCases(issuer: Issuer, tickets: Ticket[] = []): WorkCase[] {
  const report = classifyGaps(issuer);
  return report.gaps.map((gap) => {
    const dept = deptOf(gap.origin, gap.id);
    const ticket = latestTicket(tickets, issuer.ticker, gap.id);
    return {
      gap,
      dept,
      deptLabel: DEPT[dept].label,
      owns: DEPT[dept].owns,
      links: linksFor(issuer, gap),
      state: caseState(ticket),
      ticket,
    };
  });
}

export function flowStepOf(decision: string, cases: WorkCase[]): FlowStep {
  if (decision === "clear") return "release";
  if (decision === "awaiting_sign") return "sign";
  if (cases.length === 0) return "sign";
  const returned = cases.filter((c) => c.state === "returned").length;
  const recheck = cases.filter((c) => c.state === "recheck").length;
  const open = cases.filter((c) => c.state === "open").length;
  if (open === 0 && returned === 0 && recheck > 0) return "recheck";
  if (returned > 0 && open === 0) return "return";
  if (returned > 0 || recheck > 0) return "return";
  return "triage";
}

export function cannotPublishLine(report: GapReport, name: string): string {
  const bits: string[] = [];
  if (report.open) bits.push(`${report.open} 条已映射数字仍对不上`);
  if (report.file) bits.push(`${report.file} 份已接文件不合规`);
  if (report.unmapped) bits.push(`${report.unmapped} 条映射未齐`);
  if (report.unwired) bits.push(`${report.unwired} 项目录未接`);
  if (report.formula) bits.push(`${report.formula} 条简化公式开口`);
  if (report.schema) bits.push(`${report.schema} 条主表无槽`);
  if (bits.length === 0) return `${name} 可以进入签核。`;
  const lead = report.open || report.file ? "不能发" : "底稿未齐，不能下发刊结论";
  return `${lead}：${bits.join("，")}。每条都有责任部门和源文件，核验人查看、去改或退回。`;
}
