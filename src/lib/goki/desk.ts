import { classifyGaps, type GapOrigin, type GapReport } from "./gaps";
import { issuerYearEnd, reportDeadline } from "./filings";
import { auditModelsLive, type ModelLiveAudit } from "./model-audit";
import { bandIssuer } from "./materiality-net";
import { evaluateMainRules, packOf, PACK_LABEL } from "./packs";
import { publicationSet, type PubCheck } from "./pub";
import { planSpecialist, PROGRAM_ID, procedureHash, runProgram, type ProgramRun, type Specialist } from "./tcl/index";
import type { Issuer } from "./types";
import { evaluateGate, type Gate } from "./verdict";
import { vouchIssuer, type VouchCheck } from "./vouch";
import {
  cannotPublishLine,
  flowStepOf,
  type DeptId,
  type FlowStep,
  type GapLink,
  type Ticket,
  type WorkCase,
  workCases,
} from "./workflow";

export type DeskDecision = "hold" | "not_ready" | "awaiting_sign" | "clear";
export type DeskLane = "numbers" | "files" | "sign";
export type DeskItemStatus = "pass" | "hold" | "pending" | "unable";

export const DESK_DECISION_LABEL: Record<DeskDecision, string> = {
  hold: "不能发",
  not_ready: "底稿未齐",
  awaiting_sign: "待签核",
  clear: "可发",
};

export interface DeskItem {
  id: string;
  lane: DeskLane;
  title: string;
  status: DeskItemStatus;
  origin: GapOrigin;
  why: string;
  next: string;
  dept: DeptId;
  deptLabel: string;
  owns: string;
  links: GapLink[];
  caseState: WorkCase["state"];
  ticket?: Ticket;
}

export interface DeskDeadline {
  yearEnd: string;
  due: string;
  days: number;
  overdue: boolean;
  label: string;
}

export interface DeskSign {
  ticker: string;
  by: string;
  role: "secretary" | "cfo";
  kind: "ack" | "release";
  note: string;
  at: string;
  procedureHash: string;
  traceHash: string;
}

export interface DeskClearance {
  issuer: Issuer;
  packLabel: string;
  decision: DeskDecision;
  decisionLabel: string;
  decisionNote: string;
  deadline?: DeskDeadline;
  gate: Gate;
  pub: PubCheck[];
  vouch: VouchCheck[];
  run: ProgramRun;
  procedureId: string;
  procedureHash: string;
  specialist: Specialist;
  specialistNote: string;
  advisoryBand: "pass" | "review" | "exception";
  advisoryNote: string;
  numbers: DeskItem[];
  files: DeskItem[];
  tonight: DeskItem[];
  cases: WorkCase[];
  flowStep: FlowStep;
  cannotLine: string;
  gaps: GapReport;
  models: ModelLiveAudit;
  sign?: DeskSign;
  signStale: boolean;
}

export const ROLE_LABEL: Record<DeskSign["role"], string> = {
  secretary: "公司秘书",
  cfo: "财务总监",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

export function deskDeadline(issuer: Issuer, asOf = todayISO()): DeskDeadline | undefined {
  const ye = issuerYearEnd(issuer);
  if (!ye) return undefined;
  const due = reportDeadline(ye);
  const days = daysBetween(due, asOf);
  const overdue = days < 0;
  return {
    yearEnd: ye,
    due,
    days,
    overdue,
    label: overdue ? `法定期限已过 ${Math.abs(days)} 天` : `距法定期限 ${days} 天`,
  };
}

function itemStatus(origin: GapOrigin): DeskItemStatus {
  if (origin === "open" || origin === "file") return "hold";
  if (origin === "unmapped" || origin === "schema") return "unable";
  return "pending";
}

function itemFromCase(c: WorkCase): DeskItem {
  const g = c.gap;
  const lane: DeskLane = g.origin === "file" || g.origin === "unwired" ? "files" : "numbers";
  return {
    id: g.id,
    lane,
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
  if (s === "accounting_specialist") {
    return "规划器建议交会计专家看开口科目。专家只复核，不能改年报核验程序。";
  }
  if (s === "disclosure_specialist") {
    return "规划器建议交披露专家核文件。程序仍是固定版本，不能改。";
  }
  return "未派专家。";
}

function decide(report: GapReport, sign?: DeskSign, signStale?: boolean): { decision: DeskDecision; note: string } {
  if (report.blocksPublish) {
    return {
      decision: "hold",
      note: "有已映射仍对不上的数字，或已接文件不合规。公司秘书不能放行。映射未齐的条目另列，不把项目缺口写成发行人造假。",
    };
  }
  if (report.projectIncomplete) {
    return {
      decision: "not_ready",
      note: "门禁开口来自映射未齐、目录未接或简化公式。不是年报已证明有错。补齐底稿前不能下发刊结论。",
    };
  }
  if (!sign || signStale || sign.kind !== "release") {
    return {
      decision: "awaiting_sign",
      note: "数字与披露检查已闭合。请公司秘书按本程序签核后再发。",
    };
  }
  return {
    decision: "clear",
    note: "已按本程序签核。可提交。不构成鉴证意见。",
  };
}

export function peekDesk(issuer: Issuer, tickets: Ticket[] = []) {
  const gaps = classifyGaps(issuer);
  const cases = workCases(issuer, tickets);
  const decision: DeskDecision = gaps.blocksPublish ? "hold" : gaps.projectIncomplete ? "not_ready" : "awaiting_sign";
  return {
    ticker: issuer.ticker,
    name: issuer.name,
    decision,
    decisionLabel: DESK_DECISION_LABEL[decision],
    open: gaps.open,
    file: gaps.file,
    unmapped: gaps.unmapped,
    returned: cases.filter((c) => c.state === "returned").length,
    recheck: cases.filter((c) => c.state === "recheck").length,
    n: cases.length,
  };
}

export function deskOf(issuer: Issuer, sign?: DeskSign, tickets: Ticket[] = []): DeskClearance {
  const gate = evaluateGate(issuer);
  const pub = publicationSet(issuer);
  const vouch = vouchIssuer(issuer);
  const run = runProgram(issuer);
  const gaps = classifyGaps(issuer);
  const cases = workCases(issuer, tickets);
  const items = cases.map(itemFromCase);
  const numbers = items.filter((x) => x.lane === "numbers");
  const files = items.filter((x) => x.lane === "files");
  const signStale = Boolean(
    sign && (sign.procedureHash !== run.procedureHash || sign.traceHash !== run.traceHash),
  );
  const liveSign = signStale ? undefined : sign;
  const { decision, note } = decide(gaps, liveSign, signStale);
  const models = auditModelsLive();
  const usable = models.usableIds.length ? models.usableIds.join("、") : "无";
  const specialist = planSpecialist(issuer);
  return {
    issuer,
    packLabel: PACK_LABEL[packOf(issuer)],
    decision,
    decisionLabel: DESK_DECISION_LABEL[decision],
    decisionNote: note,
    deadline: deskDeadline(issuer),
    gate,
    pub,
    vouch,
    run,
    procedureId: PROGRAM_ID,
    procedureHash: procedureHash(),
    specialist,
    specialistNote: specialistNote(specialist),
    advisoryBand: bandIssuer(issuer, evaluateMainRules(issuer)),
    advisoryNote: `Materiality-Net 不用于发刊。本轮小模型可用：${usable}。其余只作工坊对照。`,
    numbers,
    files,
    tonight: items,
    cases,
    flowStep: flowStepOf(decision, cases),
    cannotLine: cannotPublishLine(gaps, issuer.name),
    gaps,
    models,
    sign: liveSign,
    signStale,
  };
}
