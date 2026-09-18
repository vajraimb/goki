import { deskDeadline, DESK_DECISION_LABEL, type DeskDecision, type DeskItem, type DeskItemStatus, type DeskSign } from "./desk";
import { classifyEsg, esgDept, esgLinks, esgSet, type EsgCheck } from "./esg";
import { scoreEsgNet } from "./esg-net";
import type { GapOrigin, GapReport } from "./gaps";
import { packOf, PACK_LABEL } from "./packs";
import { ESG_PROGRAM_ID, esgProcedureHash, planEsgSpecialist, runEsgProgram } from "./tcl/esg-program";
import type { ProgramRun, Specialist } from "./tcl/index";
import type { Issuer } from "./types";
import { caseState, DEPT, flowStepOf, latestTicket, type FlowStep, type Ticket, type WorkCase } from "./workflow";

export interface EsgDesk {
  issuer: Issuer;
  packLabel: string;
  decision: DeskDecision;
  decisionLabel: string;
  decisionNote: string;
  deadline?: ReturnType<typeof deskDeadline>;
  checks: EsgCheck[];
  run: ProgramRun;
  procedureId: string;
  procedureHash: string;
  specialist: Specialist;
  specialistNote: string;
  advisory: { label: string; p: number; truth: string; ok: boolean };
  tonight: DeskItem[];
  cases: WorkCase[];
  flowStep: FlowStep;
  cannotLine: string;
  gaps: GapReport;
  sign?: DeskSign;
  signStale: boolean;
}

function itemStatus(origin: GapOrigin): DeskItemStatus {
  if (origin === "open" || origin === "file") return "hold";
  if (origin === "unmapped" || origin === "schema") return "unable";
  return "pending";
}

function decide(report: GapReport, sign?: DeskSign, signStale?: boolean): { decision: DeskDecision; note: string } {
  if (report.blocksPublish) {
    return {
      decision: "hold",
      note: "ESG 文件缺语言、与年报不同步或过截止。公司秘书不能放行。定量 KPI 未映射另列，不把底稿缺口写成发行人未披露。",
    };
  }
  if (report.projectIncomplete) {
    return {
      decision: "not_ready",
      note: "文件已接的检查可以过。董事会声明和气候/社会定量还没进目录。补齐映射前不能下 ESG 发刊结论。",
    };
  }
  if (!sign || signStale || sign.kind !== "release") {
    return {
      decision: "awaiting_sign",
      note: "ESG 文件检查已闭合。请公司秘书按 esg-report 程序签核后再发。",
    };
  }
  return {
    decision: "clear",
    note: "已按 ESG 程序签核。可与年报一并发出。不构成鉴证或可持续鉴证意见。",
  };
}

export function esgCases(issuer: Issuer, tickets: Ticket[] = []): WorkCase[] {
  const checks = esgSet(issuer);
  const report = classifyEsg(issuer);
  return report.gaps.map((gap) => {
    const check = checks.find((c) => c.id === gap.id);
    const dept = check ? esgDept(check) : "sustainability";
    const ticket = latestTicket(tickets, issuer.ticker, gap.id);
    return {
      gap,
      dept,
      deptLabel: DEPT[dept].label,
      owns: DEPT[dept].owns,
      links: check ? esgLinks(issuer, check) : [],
      state: caseState(ticket),
      ticket,
    };
  });
}

function itemFromCase(c: WorkCase): DeskItem {
  const g = c.gap;
  return {
    id: g.id,
    lane: g.origin === "file" || g.origin === "unwired" ? "files" : "numbers",
    title: g.title,
    status: itemStatus(g.origin),
    origin: g.origin,
    why: g.why,
    next: g.next,
    dept: c.dept,
    deptLabel: c.deptLabel,
    owns: c.owns,
    links: c.links,
    caseState: c.state,
    ticket: c.ticket,
  };
}

function specialistNote(s: Specialist): string {
  if (s === "disclosure_specialist") return "规划器建议交披露专家核 ESG 文件。程序是 esg-report@1，不能改。";
  return "未派专家。气候数字不走咨询模型。";
}

export function cannotEsgLine(report: GapReport, name: string): string {
  const bits: string[] = [];
  if (report.file) bits.push(`${report.file} 份已接文件不合规`);
  if (report.unmapped) bits.push(`${report.unmapped} 条 ESG 定量/声明未映射`);
  if (report.unwired) bits.push(`${report.unwired} 项目录未接`);
  if (bits.length === 0) return `${name} 的 ESG 可以进入签核。`;
  const lead = report.file ? "ESG 不能发" : "ESG 底稿未齐，不能下发刊结论";
  return `${lead}：${bits.join("，")}。`;
}

export function esgDeskOf(issuer: Issuer, sign?: DeskSign, tickets: Ticket[] = []): EsgDesk {
  const gaps = classifyEsg(issuer);
  const checks = esgSet(issuer);
  const run = runEsgProgram(issuer);
  const cases = esgCases(issuer, tickets);
  const items = cases.map(itemFromCase);
  const signStale = Boolean(
    sign && (sign.procedureHash !== run.procedureHash || sign.traceHash !== run.traceHash),
  );
  const liveSign = signStale ? undefined : sign;
  const { decision, note } = decide(gaps, liveSign, signStale);
  const specialist = planEsgSpecialist(issuer);
  const advisory = scoreEsgNet(issuer);
  return {
    issuer,
    packLabel: PACK_LABEL[packOf(issuer)],
    decision,
    decisionLabel: DESK_DECISION_LABEL[decision],
    decisionNote: note,
    deadline: deskDeadline(issuer),
    checks,
    run,
    procedureId: ESG_PROGRAM_ID,
    procedureHash: esgProcedureHash(),
    specialist,
    specialistNote: specialistNote(specialist),
    advisory: { label: advisory.label, p: advisory.p, truth: advisory.truth, ok: advisory.ok },
    tonight: items,
    cases,
    flowStep: flowStepOf(decision, cases),
    cannotLine: cannotEsgLine(gaps, issuer.name),
    gaps,
    sign: liveSign,
    signStale,
  };
}
