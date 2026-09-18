import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { getHkScored } from "@/lib/goki/hk-bluechips";
import {
  asToolCalls,
  PROGRAM_ID,
  PROGRAM_TCL,
  procedureHash,
  runProgram,
  signReview,
  type ProgramRun,
  type StepStatus,
} from "@/lib/goki/tcl";
import { VERDICT_LABEL, verdictTone } from "@/lib/goki/verdict";

type Search = { ticker?: string };

export const Route = createFileRoute("/program")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    ticker: typeof raw.ticker === "string" ? raw.ticker : undefined,
  }),
  component: ProgramPage,
});

const STATUS_LABEL: Record<StepStatus, string> = {
  pass: "完成",
  fail: "开口",
  unable: "不能评",
  pending: "待核",
  skip: "跳过",
  review: "待签",
};

function statusTone(s: StepStatus): "pass" | "review" | "exception" | "mute" {
  if (s === "pass") return "pass";
  if (s === "fail" || s === "unable") return "exception";
  if (s === "review") return "review";
  return "mute";
}

function ProgramPage() {
  const search = Route.useSearch();
  const rows = getHkScored();
  const [ticker, setTicker] = useState(search.ticker ?? rows[0]?.issuer.ticker ?? "00005");
  const [run, setRun] = useState<ProgramRun | null>(null);
  const [shown, setShown] = useState(0);
  const [tab, setTab] = useState<"tcl" | "json">("tcl");
  const [reviewer, setReviewer] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [replayNote, setReplayNote] = useState<string | null>(null);

  useEffect(() => {
    if (search.ticker && search.ticker !== ticker) setTicker(search.ticker);
  }, [search.ticker, ticker]);

  const issuer = useMemo(
    () => rows.find((r) => r.issuer.ticker === ticker)?.issuer ?? rows[0]?.issuer,
    [rows, ticker],
  );

  const procHash = procedureHash();
  const lines = PROGRAM_TCL.replace(/\n$/, "").split("\n");

  function execute() {
    if (!issuer) return;
    const next = runProgram(issuer);
    setRun(next);
    setReplayNote(null);
    setReviewNote("");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(next.steps.length);
      return;
    }
    setShown(0);
  }

  useEffect(() => {
    execute();
    // default issuer on first paint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  useEffect(() => {
    if (!run || shown >= run.steps.length) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), 40);
    return () => window.clearTimeout(id);
  }, [run, shown]);

  const visible = run ? run.steps.slice(0, shown) : [];
  const activeLine = visible[visible.length - 1]?.line ?? 0;
  const doneLines = new Set(visible.map((s) => s.line));
  const json = run ? JSON.stringify(asToolCalls(run), null, 2) : "";

  return (
    <Shell>
      <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Audit program</p>
      <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">审计程序</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        固定的 Tcl 工作流。核验仍是门禁、附注和发布集合；Tcl 只编排。规划器只能填{" "}
        <span className="font-mono">$specialist</span>，不能改程序。MLP 还是咨询，不进阻断。
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Meta k="程序" v={PROGRAM_ID} />
        <Meta k="程序哈希" v={procHash} />
        <Meta k="轨迹哈希" v={run?.traceHash ?? "—"} />
        <Meta k="规划器" v={run?.specialist ?? "—"} />
      </dl>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {rows.map((s) => {
          const on = s.issuer.ticker === ticker;
          return (
            <button
              key={s.issuer.id}
              type="button"
              onClick={() => setTicker(s.issuer.ticker)}
              className={cn(
                "flex h-11 shrink-0 items-center rounded-sm px-3 font-mono text-sm tabular-nums",
                on ? "bg-forest text-forest-fg" : "bg-paper-2 text-ink-soft",
              )}
            >
              {s.issuer.ticker}
            </button>
          );
        })}
      </div>

      {issuer ? (
        <p className="mt-3 text-sm text-ink-soft">
          <Link to="/issuer/$id" params={{ id: issuer.id }} className="text-forest underline-offset-2 hover:underline">
            {issuer.name}
          </Link>
          <span className="mx-1.5 text-rule">·</span>
          {issuer.periodLabel ?? "FY2025"}
          <span className="mx-1.5 text-rule">·</span>
          <Link to="/" search={{ ticker: issuer.ticker }} className="text-forest underline-offset-2 hover:underline">
            发刊台
          </Link>
        </p>
      ) : null}

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="min-w-0 rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-2xl">程序</h2>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setTab("tcl")}
                className={cn("h-11 rounded-sm px-3 text-sm", tab === "tcl" ? "bg-forest text-forest-fg" : "text-ink-soft")}
              >
                Tcl
              </button>
              <button
                type="button"
                onClick={() => setTab("json")}
                className={cn("h-11 rounded-sm px-3 text-sm", tab === "json" ? "bg-forest text-forest-fg" : "text-ink-soft")}
              >
                JSON 轨迹
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {tab === "tcl"
              ? "这份文本才是审计程序。换发行人不会改它。"
              : "JSON 是本次执行的 tool call 日志，不是程序。"}
          </p>
          {tab === "tcl" ? (
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-forest px-3 py-3 font-mono text-xs leading-5 text-forest-fg">
              {lines.map((ln, i) => {
                const n = i + 1;
                const on = n === activeLine;
                const done = doneLines.has(n);
                return (
                  <div
                    key={n}
                    className={cn(
                      "flex gap-3 rounded-sm px-1",
                      on && "bg-forest-2",
                      done && !on && "text-forest-fg/70",
                    )}
                  >
                    <span className="w-5 shrink-0 text-right tabular-nums text-forest-fg/40">{n}</span>
                    <span className="min-w-0 whitespace-pre-wrap">{ln || " "}</span>
                  </div>
                );
              })}
            </pre>
          ) : (
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-forest px-4 py-3 font-mono text-xs leading-5 text-forest-fg/90">
              {json || "尚未执行"}
            </pre>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl">轨迹</h2>
              {run ? (
                <Badge tone={verdictTone(run.verdict as "pass" | "incomplete" | "unresolved" | "unable")}>
                  {VERDICT_LABEL[run.verdict as keyof typeof VERDICT_LABEL] ?? run.verdict}
                </Badge>
              ) : null}
            </div>
            <ol className="mt-3 divide-y divide-rule">
              {visible.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs tabular-nums text-muted">
                      {s.id}
                      {s.group ? ` · ${s.group}` : ""}
                      <span className="mx-1.5 text-rule">·</span>
                      {s.cmd}
                      {s.args[0] ? ` ${s.args[0]}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{s.note}</p>
                    {s.model ? (
                      <p className="mt-0.5 text-xs text-muted">
                        模型 {s.model.name} → {s.model.output}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={statusTone(s.status)}>{STATUS_LABEL[s.status]}</Badge>
                </li>
              ))}
            </ol>
            {run && shown >= run.steps.length ? (
              <p className="mt-3 font-mono text-xs text-muted">
                置信 {run.confidence}
                {run.awaitingReview ? " · 待人签" : ""}
                {run.reviewedBy ? ` · 复核 ${run.reviewedBy}` : ""}
              </p>
            ) : null}
          </section>

          {run && shown >= run.steps.length ? (
            <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
              <h2 className="font-display text-2xl">发现</h2>
              <p className="mt-1 text-xs text-ink-soft">每条挂回步骤、映射或文件。没有步骤就没有发现。</p>
              {run.findings.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">无开口。</p>
              ) : (
                <ul className="mt-3 divide-y divide-rule">
                  {run.findings.map((f) => (
                    <li key={f.id} className="py-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm">
                          <span className="font-mono text-xs tabular-nums text-muted">{f.id}</span> {f.title}
                        </p>
                        <Badge tone={statusTone(f.status)}>{STATUS_LABEL[f.status]}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-soft">{f.note}</p>
                      <p className="mt-1 font-mono text-xs text-muted">
                        {f.steps.join(" · ") || "—"}
                        {f.sources[0] ? ` · ${f.sources[0].label}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {run?.awaitingReview && shown >= run.steps.length ? (
            <section className="rounded-lg bg-review-soft p-4">
              <h2 className="font-display text-2xl">人签</h2>
              <p className="mt-1 text-xs text-ink-soft">checkpoint human_review 写在程序里。签核追加一步，不重跑核验。</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  placeholder="复核人"
                  className="h-11 rounded-md bg-paper px-3 text-sm shadow-[var(--shadow-border)] outline-none"
                />
                <input
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="意见"
                  className="h-11 rounded-md bg-paper px-3 text-sm shadow-[var(--shadow-border)] outline-none"
                />
              </div>
              <Button
                className="mt-3"
                type="button"
                disabled={!reviewer.trim()}
                onClick={() => setRun(signReview(run, reviewer.trim(), reviewNote.trim()))}
              >
                签核
              </Button>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={execute}>
              再跑一次
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!issuer) return;
                const a = runProgram(issuer);
                const b = runProgram(issuer);
                setReplayNote(a.traceHash === b.traceHash ? `回放一致 ${a.traceHash}` : "回放不一致");
              }}
            >
              对回放
            </Button>
          </div>
          {replayNote ? <p className="font-mono text-xs text-ink-soft">{replayNote}</p> : null}
        </div>
      </div>

      <aside className="mt-8 rounded-lg bg-paper-2 p-4 text-sm leading-relaxed text-ink-soft shadow-[var(--shadow-border)]">
        <p className="font-medium text-ink">这个实验在证什么</p>
        <p className="mt-2">
          程序哈希跟发行人无关。轨迹哈希跟映射和文件目录有关。JSON 是日志。如果 Tcl
          只是把 tool 名换了写法，这两份哈希不会分开，人签也不会是程序里的指令。
        </p>
      </aside>
    </Shell>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-1 truncate font-mono text-sm tabular-nums">{v}</dd>
    </div>
  );
}
