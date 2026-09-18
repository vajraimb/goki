import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/goki/format";
import { SPECIALISTS, trainDeskOf, type TrainSign } from "@/lib/goki/train-desk";
import { useTrain } from "@/lib/goki/train-store";

type Search = { model?: string };

export const Route = createFileRoute("/train")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    model: typeof raw.model === "string" ? raw.model : undefined,
  }),
  component: TrainPage,
});

function decisionTone(d: string): "exception" | "review" | "pass" | "mute" {
  if (d === "hold") return "exception";
  if (d === "not_ready") return "review";
  if (d === "clear") return "pass";
  return "mute";
}

function TrainPage() {
  const search = Route.useSearch();
  const storeId = useTrain((s) => s.modelId);
  const setModelId = useTrain((s) => s.setModelId);
  const signs = useTrain((s) => s.signs);
  const putSign = useTrain((s) => s.putSign);
  const lastHead = useTrain((s) => s.lastHead);
  const putHead = useTrain((s) => s.putHead);
  const modelId = search.model || storeId;
  const [by, setBy] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    if (search.model && search.model !== storeId) setModelId(search.model);
  }, [search.model, storeId, setModelId]);

  const desk = useMemo(
    () => trainDeskOf(modelId, signs[modelId], lastHead[modelId]),
    [modelId, signs, lastHead, tick],
  );

  useEffect(() => {
    setMs(desk.head.trainMs);
  }, [desk.head.trainMs]);

  function onRetrain() {
    setBusy(true);
    setMsg(null);
    window.setTimeout(() => {
      const head = desk.spec.retrain(desk.head.seed + 1);
      putHead(desk.spec.id, head);
      setTick((n) => n + 1);
      setBusy(false);
      setMsg(`已用种子 ${head.seed} 重训。校验和 ${head.checksum}。上次签核作废。`);
    }, 30);
  }

  function onSign(kind: TrainSign["kind"]) {
    if (!by.trim()) return;
    if (kind === "release" && desk.decision !== "awaiting_sign" && desk.decision !== "clear") return;
    putSign({
      modelId: desk.spec.id,
      by: by.trim(),
      kind,
      note: note.trim(),
      at: new Date().toISOString(),
      checksum: desk.head.checksum,
    });
    setMsg(kind === "release" ? "已准上咨询带。不进门禁。" : "已阅知。此头不得咨询。");
    setNote("");
    setTick((n) => n + 1);
  }

  const canRelease = desk.decision === "awaiting_sign" || desk.decision === "clear";

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Specialist heads · synthetic train · FY2025 holdout</p>
          <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">训练台</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            一次训一个专业头。合成语料上练，十一条实报上考。过关且签核后才能上咨询带。永远不进年报或 ESG 门禁，不填科目数字。
          </p>
          <p className="mt-2">
            <Link to="/models" className="text-sm text-forest underline-offset-2 hover:underline">
              工坊模型目录
            </Link>
            <span className="mx-2 text-rule">·</span>
            <Link to="/esg" className="text-sm text-forest underline-offset-2 hover:underline">
              ESG 核验台
            </Link>
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SPECIALISTS.map((s) => {
            const on = s.id === desk.spec.id;
            return (
              <li key={s.id}>
                <Link
                  to="/train"
                  search={{ model: s.id }}
                  onClick={() => setModelId(s.id)}
                  className={cn(
                    "flex h-14 items-center justify-between rounded-md px-3 text-sm",
                    on ? "bg-forest text-forest-fg" : "bg-paper-2 text-ink-soft shadow-[var(--shadow-border)]",
                  )}
                >
                  <span>{s.name}</span>
                  <span className={cn("font-mono text-xs", on ? "text-forest-fg/80" : "text-muted")}>{s.desk}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <section className="rounded-lg bg-paper-2 p-5 shadow-[var(--shadow-border)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs text-muted">{desk.spec.id}</p>
              <h2 className="font-display text-3xl tracking-tight">{desk.spec.name}</h2>
              <p className="mt-1 text-sm text-ink-soft">{desk.spec.desk}咨询 · 种子 {desk.head.seed}</p>
            </div>
            <Badge tone={decisionTone(desk.decision)} className="w-fit px-3 py-1 text-sm">
              {desk.decision === "hold" ? "不得咨询" : desk.decision === "clear" ? "已准咨询" : "待签核"}
            </Badge>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink">{desk.spec.job}</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{desk.spec.forbid}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink">{desk.decisionNote}</p>
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat k={desk.head.synthLabel} v={pct(desk.head.synthMetric, 1)} />
            <Stat k="实报持有" v={desk.holdout.n ? `${desk.holdout.hit}/${desk.holdout.n}` : pct(desk.holdout.acc, 1)} warn={!desk.holdout.usable} />
            <Stat k="假通过" v={String(desk.holdout.falseClear)} warn={desk.holdout.falseClear > 0} />
            <Stat k="校验和" v={desk.head.checksum} />
          </dl>
          <p className="mt-3 font-mono text-xs text-muted">
            {desk.head.nTrain} 条合成训练 · {ms == null ? "—" : `${Math.round(ms)} ms`} · {desk.head.paramCount} 参数
            {desk.signStale ? " · 上次签核已过期" : ""}
          </p>
          <div className="mt-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={onRetrain}>
              {busy ? "训练中…" : "用下一粒种子重训"}
            </Button>
          </div>
        </section>

        {desk.holdout.rows.length > 0 ? (
          <section className="overflow-x-auto rounded-lg bg-paper-2 shadow-[var(--shadow-border)]">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">实报持有</caption>
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-4 py-3 font-medium">样本</th>
                  <th className="px-2 py-3 font-medium">真值</th>
                  <th className="px-2 py-3 font-medium">模型</th>
                  <th className="px-2 py-3 font-medium">对错</th>
                </tr>
              </thead>
              <tbody>
                {desk.holdout.rows.map((r) => (
                  <tr key={r.id} className="border-t border-rule">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted">{r.id}</span>
                      <span className="mx-2">{r.label}</span>
                    </td>
                    <td className="px-2 py-3 font-mono text-xs">{r.truth}</td>
                    <td className="px-2 py-3 font-mono text-xs">{r.pred}</td>
                    <td className="px-2 py-3">
                      <Badge tone={r.ok ? "pass" : "exception"}>{r.ok ? "对" : "错"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
          <h3 className="font-display text-2xl">签核上咨询带</h3>
          <p className="mt-1 text-xs text-muted">签的是这一份校验和。重训后必须再签。签核不改门禁。</p>
          {desk.sign ? (
            <p className="mt-3 text-sm text-ink-soft">
              {desk.sign.by} · {desk.sign.kind === "release" ? "已准咨询" : "阅知"} · {desk.sign.checksum}
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 sm:max-w-lg">
            <input
              value={by}
              onChange={(e) => setBy(e.target.value)}
              placeholder="方法论负责人"
              className="h-11 rounded-md bg-paper px-3 text-sm shadow-[var(--shadow-border)] outline-none"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={canRelease ? "准咨询说明" : "不得咨询的说明"}
              className="w-full rounded-md bg-paper px-3 py-2 text-sm shadow-[var(--shadow-border)] outline-none"
            />
            {canRelease ? (
              <Button type="button" disabled={!by.trim()} onClick={() => onSign("release")}>
                准上咨询带
              </Button>
            ) : (
              <Button type="button" variant="secondary" disabled={!by.trim()} onClick={() => onSign("ack")}>
                阅知，不得咨询
              </Button>
            )}
            {msg ? <p className="text-xs text-ink-soft">{msg}</p> : null}
          </div>
        </section>
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
