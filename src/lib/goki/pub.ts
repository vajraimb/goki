import type { Issuer } from "./types";

export type PubStatus = "pass" | "missing" | "mismatch" | "pending";

export interface PubCheck {
  id: string;
  label: string;
  status: PubStatus;
  note: string;
}

function yearEndFromPeriod(label?: string): Date | undefined {
  if (!label) return undefined;
  const m = label.match(/FY(\d{4})/);
  if (!m) return undefined;
  return new Date(`${m[1]}-12-31T00:00:00Z`);
}

function deadlineOf(ye: Date): Date {
  const d = new Date(ye);
  d.setUTCMonth(d.getUTCMonth() + 4);
  return d;
}

export function publicationSet(issuer: Issuer): PubCheck[] {
  const ye = yearEndFromPeriod(issuer.periodLabel);
  const due = ye ? deadlineOf(ye) : undefined;
  const now = new Date();
  const days = due ? Math.ceil((due.getTime() - now.getTime()) / 86400000) : undefined;
  const checks: PubCheck[] = [
    {
      id: "P01",
      label: "中英语言对",
      status: "pending",
      note: "未接入年报 PDF 集合，不能核中英页是否成对。",
    },
    {
      id: "P02",
      label: "ESG 同步",
      status: "pending",
      note: "未接入 ESG / 可持续报告文件。",
    },
    {
      id: "P03",
      label: "ESS 标题 vs 文件名",
      status: "pending",
      note: "未接入港交所 ESS 标题。",
    },
    {
      id: "P04",
      label: "年报截止",
      status: due ? (now <= due ? "pass" : "mismatch") : "missing",
      note: due
        ? `${issuer.periodLabel} 截止 ${due.toISOString().slice(0, 10)}${days != null ? `（${days} 天）` : ""}`
        : "缺少期间标签。",
    },
    {
      id: "P05",
      label: "业绩公告 vs 年报数字",
      status: "pending",
      note: "没有第二份披露可对。不对账。",
    },
    {
      id: "P06",
      label: "中英数字 / 日期等价",
      status: "pending",
      note: "未接入中英全文。",
    },
    {
      id: "P07",
      label: "澄清公告金标",
      status: "pending",
      note: "未接入澄清公告集合。",
    },
  ];
  return checks;
}
