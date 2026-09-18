import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ROLE_LABEL, type DeskDecision, type DeskItem, type DeskItemStatus, type DeskSign } from "@/lib/goki/desk";
import { esgDeskOf } from "@/lib/goki/esg-desk";
import { GAP_ORIGIN_LABEL, type GapOrigin } from "@/lib/goki/gaps";
import { useDesk } from "@/lib/goki/desk-store";
import { getHkScored } from "@/lib/goki/hk-bluechips";
import { signReview } from "@/lib/goki/tcl/index";
import { FLOW_STEPS, type Ticket } from "@/lib/goki/workflow";

type Search = { ticker?: string };

export const Route = createFileRoute("/esg")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    ticker: typeof raw.ticker === "string" ? raw.ticker : undefined,
  }),
  component: EsgPage,
});

function decisionTone(d: DeskDecision): "exception" | "review" | "pass" | "mute" {
  if (d === "hold") return "exception";
  if (d === "not_ready") return "review";
  if (d === "clear") return "pass";
  return "mute";
}

function itemTone(s: DeskItemStatus): "exception" | "review" | "pass" | "mute" {
  if (s === "hold") return "exception";
  if (s === "unable" || s === "pending") return "review";
  if (s === "pass") return "pass";
  return "mute";
}

function itemLabel(origin: GapOrigin, status: DeskItemStatus): string {
  if (status === "pass") return "齐";
  return GAP_ORIGIN_LABEL[origin];
}

function EsgPage() {
  const search = Route.useSearch();
  const rows = getHkScored();
  const storeTicker = useDesk((s) => s.ticker);
  const ticker = search.ticker || storeTicker;
  const setTicker = useDesk((s) => s.setTicker);
  const esgSigns = useDesk((s) => s.esgSigns);
  const putEsgSign = useDesk((s) => s.putEsgSign);
  const tickets = useDesk((s) => s.tickets);
  const putTicket = useDesk((s) => s.putTicket);
  const verifier = useDesk((s) => s.verifier);
  const setVerifier = useDesk((s) => s.setVerifier);
  const [by, setBy] = useState(verifier);
  const [role, setRole] = useState<DeskSign["role"]>("secretary");
  const [note, setNote] = useState("");
  const [signedMsg, setSignedMsg] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState<Record<string, string>>({});

  useEffect(() => {
    if (search.ticker && search.ticker !== storeTicker) setTicker(search.ticker);
  }, [search.ticker, storeTicker, setTicker]);

  useEffect(() => {
    if (verifier && !by) setBy(verifier);
  }, [verifier, by]);

  const issuer = useMemo(
    () => rows.find((r) => r.issuer.ticker === ticker)?.issuer ?? rows[0]?.issuer,
    [rows, ticker],
  );
  const desk = useMemo(
    () => (issuer ? esgDeskOf(issuer, esgSigns[issuer.ticker], tickets) : null),
    [issuer, esgSigns, tickets],
  );

  function onSign(kind: DeskSign["kind"]) {
    if (!desk || !by.trim()) return;
    if (kind === "release" && desk.decision !== "awaiting_sign" && desk.decision !== "clear") return;
    const signedRun = signReview(desk.run, by.trim(), note.trim() || (kind === "release" ? "ESG 发刊签核" : "已知悉"));
    putEsgSign({
      ticker: desk.issuer.ticker,
      by: by.trim(),
      role,
      kind,
      note: note.trim(),
      at: new Date().toISOString(),
      procedureHash: signedRun.procedureHash,
      traceHash: signedRun.traceHash,
    });
    setVerifier(by.trim());
    setSignedMsg(kind === "release" ? "已按 ESG 程序签核。" : "已阅知。ESG 开口未闭，仍不能发。");
    setNote("");
  }

  function onTicket(item: DeskItem, kind: Ticket["kind"]) {
    if (!desk || !by.trim()) return;
    putTicket({
      ticker: desk.issuer.ticker,
      gapId: item.id,
      dept: item.dept,
      kind,
      by: by.trim(),
      note: returnNote[item.id]?.trim() || (kind === "return" ? `退回${item.deptLabel}` : "部门已改，收回再核"),
      at: new Date().toISOString(),
    });
    setVerifier(by.trim());
    setReturnNote((s) => ({ ...s, [item.id]: "" }));
  }

  if (!desk) {
    return (
      <Shell>
        <p className="text-ink-soft">没有发行人。</p>
      </Shell>
    );
  }

  const canRelease = desk.decision === "awaiting_sign" || desk.decision === "clear";
  const nFile = desk.gaps.file;
  const nMap = desk.gaps.unmapped;
  const nWire = desk.gaps.unwired;
  const passed = desk.checks.filter((c) => c.status === "pass");

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">ESG · HKEX Appendix C2 · FY2025</p>
          <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">ESG 核验台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            与年报分开的可持续报告核验。文件、中英、与年报同步、截止日走目录。董事会声明和气候定量未映射就标底稿未齐，不编造排放。
          </p>
          <p className="mt-2">
            <Link to="/queue" className="text-sm text-forest underline-offset-2 hover:underline">
              换一家 · 队列
            </Link>
            <span className="mx-2 text-rule">·</span>
            <Link
              to="/"
              search={{ ticker: desk.issuer.ticker }}
              className="text-sm text-forest underline-offset-2 hover:underline"
            >
              同年报发刊台
            </Link>
          </p>
        </div>

        <section className="rounded-lg bg-paper-2 p-5 shadow-[var(--shadow-border)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs tabular-nums text-muted">{desk.issuer.ticker}</p>
              <h2 className="font-display text-3xl tracking-tight">{desk.issuer.name}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {desk.packLabel}包
                {desk.issuer.periodLabel ? ` · ${desk.issuer.periodLabel}` : ""}
                {desk.deadline ? ` · ${desk.deadline.label}` : ""}
              </p>
            </div>
            <Badge tone={decisionTone(desk.decision)} className="w-fit px-3 py-1 text-sm">
              {desk.decisionLabel}
            </Badge>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink">{desk.cannotLine}</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{desk.decisionNote}</p>
          <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {FLOW_STEPS.map((s, i) => {
              const on = s.id === desk.flowStep;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "rounded-md px-3 py-3 shadow-[var(--shadow-border)]",
                    on ? "bg-forest text-forest-fg" : "bg-paper text-ink-soft",
                  )}
                >
                  <p className="font-mono text-xs tabular-nums">{i + 1}</p>
                  <p className="mt-1 text-sm">{s.label}</p>
                </li>
              );
            })}
          </ol>
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat k="文件不合规" v={String(nFile)} warn={nFile > 0} />
            <Stat k="KPI 未映射" v={String(nMap)} warn={nMap > 0} />
            <Stat k="目录未接" v={String(nWire)} warn={nWire > 0} />
            <Stat k="程序" v={desk.procedureId} />
          </dl>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="font-display text-2xl">开口工单</h3>
            <p className="text-xs text-muted">打开 ESG PDF · 退回可持续发展 / IR。退回不改门禁。</p>
          </div>
          {desk.tonight.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">没有开口事项。请公司秘书签核。</p>
          ) : (
            <TonightList
              items={desk.tonight}
              by={by}
              notes={returnNote}
              setNote={(id, v) => setReturnNote((s) => ({ ...s, [id]: v }))}
              onTicket={onTicket}
            />
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
            <h3 className="font-display text-2xl">已过的文件检查</h3>
            <p className="mt-1 text-xs text-muted">只列闭合项。未映射的气候数字不在这里充数。</p>
            {passed.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">还没有闭合的文件检查。</p>
            ) : (
              <ul className="mt-3 divide-y divide-rule">
                {passed.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 py-2">
                    <p className="text-sm">
                      <span className="font-mono text-xs text-muted">{c.id}</span>
                      <span className="mx-2">{c.label}</span>
                    </p>
                    <Badge tone="pass">齐</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
            <h3 className="font-display text-2xl">签核</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{desk.specialistNote}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              ESG-Net 咨询 {desk.advisory.label}
              {desk.advisory.ok ? "，与目录规则一致" : `，目录规则是 ${desk.advisory.truth}`}
              。不进门禁。
              <Link to="/train" search={{ model: "esg-net" }} className="ml-2 text-forest underline-offset-2 hover:underline">
                去训练台
              </Link>
            </p>
            <p className="mt-2 font-mono text-xs text-muted">
              {desk.procedureId} · {desk.procedureHash}
              {desk.signStale ? " · 上次签核已过期" : ""}
            </p>
            {desk.sign ? (
              <p className="mt-3 text-sm text-ink-soft">
                {ROLE_LABEL[desk.sign.role]} {desk.sign.by} · {desk.sign.kind === "release" ? "ESG 签核" : "阅知"}
              </p>
            ) : null}
            <div className="mt-3 grid gap-2">
              <input
                value={by}
                onChange={(e) => {
                  setBy(e.target.value);
                  setVerifier(e.target.value);
                }}
                placeholder="核验人姓名"
                className="h-11 rounded-md bg-paper px-3 text-sm shadow-[var(--shadow-border)] outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("secretary")}
                  className={cn(
                    "h-11 rounded-md text-sm",
                    role === "secretary" ? "bg-forest text-forest-fg" : "bg-paper text-ink-soft shadow-[var(--shadow-border)]",
                  )}
                >
                  公司秘书
                </button>
                <button
                  type="button"
                  onClick={() => setRole("cfo")}
                  className={cn(
                    "h-11 rounded-md text-sm",
                    role === "cfo" ? "bg-forest text-forest-fg" : "bg-paper text-ink-soft shadow-[var(--shadow-border)]",
                  )}
                >
                  财务总监
                </button>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={canRelease ? "ESG 签核意见" : "阅知说明（不下发刊结论）"}
                className="w-full rounded-md bg-paper px-3 py-2 text-sm shadow-[var(--shadow-border)] outline-none"
              />
              {canRelease ? (
                <Button type="button" disabled={!by.trim()} onClick={() => onSign("release")}>
                  ESG 发刊签核
                </Button>
              ) : (
                <Button type="button" variant="secondary" disabled={!by.trim()} onClick={() => onSign("ack")}>
                  阅知，ESG 仍不能发
                </Button>
              )}
              {signedMsg ? <p className="text-xs text-ink-soft">{signedMsg}</p> : null}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function Stat({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className={cn("mt-1 font-mono text-sm tabular-nums", warn ? "text-exception" : "text-ink")}>{v}</dd>
    </div>
  );
}

function TonightList({
  items,
  by,
  notes,
  setNote,
  onTicket,
}: {
  items: DeskItem[];
  by: string;
  notes: Record<string, string>;
  setNote: (id: string, v: string) => void;
  onTicket: (item: DeskItem, kind: Ticket["kind"]) => void;
}) {
  const order: GapOrigin[] = ["file", "unmapped", "unwired"];
  return (
    <div className="mt-3 flex flex-col gap-4">
      {order.map((origin) => {
        const rows = items.filter((i) => i.origin === origin);
        if (rows.length === 0) return null;
        return (
          <div key={origin} className="rounded-lg bg-paper-2 shadow-[var(--shadow-border)]">
            <p className="px-4 pt-3 text-xs text-muted">{GAP_ORIGIN_LABEL[origin]}</p>
            <div className="divide-y divide-rule">
              {rows.map((item) => (
                <CaseCard
                  key={item.id}
                  item={item}
                  by={by}
                  note={notes[item.id] ?? ""}
                  setNote={(v) => setNote(item.id, v)}
                  onTicket={onTicket}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CaseCard({
  item,
  by,
  note,
  setNote,
  onTicket,
}: {
  item: DeskItem;
  by: string;
  note: string;
  setNote: (v: string) => void;
  onTicket: (item: DeskItem, kind: Ticket["kind"]) => void;
}) {
  const stateLabel = item.caseState === "returned" ? "已退回" : item.caseState === "recheck" ? "待再核" : "待分派";
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          <span className="font-mono text-xs text-muted">{item.id}</span>
          <span className="mx-2">{item.title}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="mute">{item.deptLabel}</Badge>
          <Badge tone={item.caseState === "open" ? itemTone(item.status) : "review"}>{stateLabel}</Badge>
          <Badge tone={itemTone(item.status)}>{itemLabel(item.origin, item.status)}</Badge>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink">{item.next}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{item.why}</p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
        {item.links.map((l) => (
          <a
            key={l.href + l.label}
            href={l.href}
            target={l.external ? "_blank" : undefined}
            rel={l.external ? "noreferrer" : undefined}
            className="flex h-11 items-center text-sm text-forest underline-offset-2 hover:underline"
          >
            {l.label}
          </a>
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={`退回${item.deptLabel}的说明`}
          className="h-11 min-w-0 flex-1 rounded-md bg-paper px-3 text-sm shadow-[var(--shadow-border)] outline-none"
        />
        {item.caseState === "returned" ? (
          <Button type="button" disabled={!by.trim()} onClick={() => onTicket(item, "recheck")}>
            收回再核
          </Button>
        ) : (
          <Button type="button" variant="secondary" disabled={!by.trim()} onClick={() => onTicket(item, "return")}>
            退回{item.deptLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
