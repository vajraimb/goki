import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { checksumShort, pct, wan } from "@/lib/goki/format";
import { buildHkIssuers } from "@/lib/goki/hk-bluechips";
import { canWriteTarget, liveIssuers, useMapIntake } from "@/lib/goki/map-intake";
import { guessSection, parsePaste, SAMPLE_PASTE } from "@/lib/goki/map-paste";
import { guessUnit, toMillion, UNIT_LABEL, type UnitId } from "@/lib/goki/unit-net";
import {
  getMapNet,
  guessLine,
  HK_LINES,
  isEmptyValue,
  MAP_SECTIONS,
  MAP_TARGETS,
  readTargetValue,
  sinkOf,
  targetLabel,
  type MapGuess,
  type MapLine,
  type MapSection,
} from "@/lib/goki/map-net";
import { PACK_LABEL } from "@/lib/goki/packs";
import type { Issuer, RulePack } from "@/lib/goki/types";

export const Route = createFileRoute("/map")({
  validateSearch: (raw: Record<string, unknown>) => ({
    ticker: typeof raw.ticker === "string" ? raw.ticker : undefined,
  }),
  component: MapPage,
});

const SECTION_LABEL: Record<MapSection, string> = {
  bs: "资产/负债",
  is: "损益",
  cf: "现金流",
  note: "附注",
};

const inputCls =
  "h-11 w-full min-w-0 rounded-md bg-paper px-3 text-sm text-ink shadow-[var(--shadow-border)] outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest";

type Draft = {
  key: string;
  label: string;
  raw: string;
  unit: UnitId;
  unitP: number;
  explicit: boolean;
  section: MapSection;
  target: string;
  p: number;
  on: boolean;
};

function tickerParam(search: { ticker?: string }): string | undefined {
  if (search.ticker) return search.ticker;
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("ticker") ?? undefined;
}

function MapPage() {
  const search = Route.useSearch();
  const writes = useMapIntake((s) => s.writes);
  const put = useMapIntake((s) => s.put);
  const putMany = useMapIntake((s) => s.putMany);
  const remove = useMapIntake((s) => s.remove);
  const clearTicker = useMapIntake((s) => s.clearTicker);
  const issuers = useMemo(() => liveIssuers(buildHkIssuers()), [writes]);
  const [ready, setReady] = useState(false);
  const [acc, setAcc] = useState({ syn: 0, hk: 0, params: 0, checksum: "", ms: 0, inDim: 0 });
  const [rows, setRows] = useState<(MapLine & { guess: MapGuess })[]>([]);
  const [ticker, setTicker] = useState(() => tickerParam(search) || "00016");
  const [paste, setPaste] = useState(SAMPLE_PASTE);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [label, setLabel] = useState("Additions to investment properties");
  const [section, setSection] = useState<MapSection>("note");
  const [amount, setAmount] = useState("8228");
  const [trial, setTrial] = useState<MapGuess | null>(null);
  const [msg, setMsg] = useState("");

  const issuer = issuers.find((i) => i.ticker === ticker);
  const pack: RulePack = issuer?.pack ?? "generic";

  useEffect(() => {
    const t = tickerParam(search);
    if (t && t !== ticker) setTicker(t);
  }, [search.ticker, ticker]);

  useEffect(() => {
    const mdl = getMapNet();
    setAcc({
      syn: mdl.acc,
      hk: mdl.hkAcc,
      params: mdl.paramCount,
      checksum: mdl.checksum,
      ms: mdl.trainMs,
      inDim: mdl.net.in,
    });
    setRows(
      HK_LINES.map((l) => ({
        ...l,
        guess: guessLine(l.label, l.pack, l.section, l.target),
      })),
    );
    setReady(true);
  }, []);

  const nHit = rows.filter((r) => r.guess.match).length;
  const grouped = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = m.get(r.ticker) ?? [];
      arr.push(r);
      m.set(r.ticker, arr);
    }
    return [...m.entries()];
  }, [rows]);
  const mine = writes.filter((w) => w.ticker === ticker);

  function runPaste() {
    if (!issuer) return;
    getMapNet();
    const parsed = parsePaste(paste);
    setDrafts(
      parsed.map((line, i) => {
        const sec = guessSection(line.label);
        const g = guessLine(line.label, pack, sec);
        const existingM = readTargetValue(issuer, g.target) / 100;
        const u =
          line.rawNumber == null
            ? null
            : guessUnit(issuer, line.rawNumber, existingM, line.unit);
        return {
          key: `${i}-${line.label}`,
          label: line.label,
          raw: line.rawNumber == null ? "" : String(line.rawNumber),
          unit: u?.unit ?? "million",
          unitP: u?.p ?? 0,
          explicit: u?.explicit ?? false,
          section: sec,
          target: g.target,
          p: g.p,
          on: canWriteTarget(g.target) && line.rawNumber != null && line.rawNumber !== 0,
        };
      }),
    );
    setMsg(parsed.length ? `解析 ${parsed.length} 行` : "没有可解析的行。");
  }

  function writeDrafts() {
    if (!issuer) return;
    const batch = drafts.filter((d) => d.on);
    const out: { ticker: string; label: string; target: string; million: number }[] = [];
    for (const d of batch) {
      if (!canWriteTarget(d.target)) continue;
      const raw = Number(d.raw.replace(/,/g, ""));
      if (!Number.isFinite(raw) || raw === 0) continue;
      const million = toMillion(raw, d.unit);
      if (!Number.isFinite(million) || million === 0) continue;
      const sink = sinkOf(d.target);
      const existing = readTargetValue(issuer, d.target);
      if (sink.book === "year" && !isEmptyValue(existing)) continue;
      out.push({ ticker: issuer.ticker, label: d.label, target: d.target, million });
    }
    if (out.length === 0) {
      setMsg("没有可写入的行。空槽才写，主表已有数不覆盖。");
      return;
    }
    putMany(out);
    setMsg(`已写入 ${issuer.name} ${out.length} 项`);
  }

  function runTrial() {
    setTrial(guessLine(label.trim() || " ", pack, section));
    setMsg("");
  }

  function writeGuess(target: string, lab: string, millionStr: string) {
    if (!issuer) return;
    if (!canWriteTarget(target)) {
      setMsg("「其他」不进规范科目。");
      return;
    }
    const millionIn = Number(millionStr.replace(/,/g, ""));
    if (!Number.isFinite(millionIn) || millionIn === 0) {
      setMsg("填报表金额。");
      return;
    }
    const existingM = readTargetValue(issuer, target) / 100;
    const u = guessUnit(issuer, millionIn, existingM);
    const million = u.million;
    const sink = sinkOf(target);
    const existing = readTargetValue(issuer, target);
    if (sink.book === "year" && !isEmptyValue(existing)) {
      setMsg("主表这一格已有数，不覆盖。附注空槽才能写入。");
      return;
    }
    put({ ticker: issuer.ticker, label: lab, target, million });
    setMsg(
      u.unit === "million"
        ? `已写入 ${issuer.name} · ${targetLabel(target)}`
        : `已按${UNIT_LABEL[u.unit]}写入 ${issuer.name} · ${targetLabel(target)}（${wan(million * 100)}）`,
    );
  }

  if (!ready) {
    return (
      <Shell>
        <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Map-Net</p>
        <h1 className="mt-1 font-display text-4xl tracking-tight">科目映射</h1>
        <p className="mt-3 text-sm text-ink-soft">正在编译关键词表与 softmax…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-8">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Work chain · 取数</p>
          <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">科目映射</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            一行一个科目。行名在前，金额在后。可写千元 / 万元 / 百万 / 亿。没写单位时按资产规模判断千元、百万或亿。不覆盖主表已有数。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="forest">
              {acc.inDim} → 40 → {MAP_TARGETS.length}
            </Badge>
            <Badge>{acc.params} params</Badge>
            <Badge tone="pass">合成 {pct(acc.syn, 1)}</Badge>
            <Badge tone={acc.hk >= 0.85 ? "pass" : "review"}>
              实报 {nHit}/{rows.length}
            </Badge>
            <Badge>
              checksum {checksumShort(acc.checksum)} · {Math.round(acc.ms)} ms
            </Badge>
          </div>
        </div>

        <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] sm:p-5">
          <h2 className="font-display text-2xl">整表贴入</h2>
          <p className="mt-1 text-xs text-ink-soft">
            例里是新鸿基年报投资物业滚存。购置 82.28 亿；写成 8228000 千元或 82.28 亿，单位网会换成同一笔。
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <select
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value);
                setTrial(null);
                setMsg("");
              }}
              className={inputCls}
            >
              {issuers.map((i) => (
                <option key={i.ticker} value={i.ticker}>
                  {i.name} {i.ticker} · {PACK_LABEL[i.pack ?? "generic"]}
                </option>
              ))}
            </select>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={6}
              spellCheck={false}
              className="min-h-32 w-full min-w-0 resize-y rounded-md bg-paper px-3 py-2 font-mono text-sm leading-relaxed text-ink shadow-[var(--shadow-border)] outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={runPaste}>
                解析映射
              </Button>
              <Button type="button" onClick={writeDrafts} disabled={drafts.every((d) => !d.on)}>
                写入勾选
              </Button>
            </div>
          </div>
          {drafts.length > 0 ? (
            <ul className="mt-3 divide-y divide-rule">
              {drafts.map((d) => {
                const existing = issuer ? readTargetValue(issuer, d.target) : 0;
                const filled = !isEmptyValue(existing) && sinkOf(d.target).book === "year";
                const blocked = !canWriteTarget(d.target);
                const rawN = Number(d.raw.replace(/,/g, ""));
                const written = Number.isFinite(rawN) ? toMillion(rawN, d.unit) : 0;
                return (
                  <li key={d.key} className="py-3 first:pt-0 last:pb-0">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-forest"
                        checked={d.on}
                        disabled={blocked || filled}
                        onChange={(e) =>
                          setDrafts((rows) =>
                            rows.map((x) => (x.key === d.key ? { ...x, on: e.target.checked } : x)),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug">{d.label}</span>
                        <span className={cn("mt-0.5 block text-sm", blocked ? "text-review" : "text-pass")}>
                          {targetLabel(d.target)}
                          <span className="ml-2 font-mono text-xs text-muted">{pct(d.p, 0)}</span>
                        </span>
                      </span>
                    </label>
                    <div className="mt-2 pl-6">
                      <input
                        value={d.raw}
                        onChange={(e) =>
                          setDrafts((rows) =>
                            rows.map((x) => {
                              if (x.key !== d.key) return x;
                              const raw = e.target.value;
                              const n = Number(raw.replace(/,/g, ""));
                              if (!issuer || !Number.isFinite(n) || n === 0) {
                                return { ...x, raw, on: false };
                              }
                              const u = x.explicit
                                ? { unit: x.unit, p: 1, explicit: true }
                                : guessUnit(issuer, n, readTargetValue(issuer, x.target) / 100);
                              return {
                                ...x,
                                raw,
                                unit: u.unit,
                                unitP: u.p,
                                on: canWriteTarget(x.target),
                              };
                            }),
                          )
                        }
                        inputMode="decimal"
                        placeholder="金额"
                        className={inputCls}
                      />
                      <p className="mt-1 font-mono text-xs text-muted">
                        {blocked
                          ? "不进规范科目"
                          : filled
                            ? `主表已有 ${wan(existing)}，不覆盖`
                            : !d.raw
                              ? "科目空着"
                              : d.unit === "million"
                                ? `${d.explicit ? "写明" : "判为"}百万 · 写入 ${wan(written * 100)}`
                                : `${d.explicit ? "写明" : "判为"}${UNIT_LABEL[d.unit]} · 写入 ${wan(written * 100)}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {msg ? <p className="mt-2 text-sm text-pass">{msg}</p> : null}
          {issuer && mine.length > 0 ? (
            <div className="mt-3 rounded-md bg-paper px-3 py-2 shadow-[var(--shadow-border)]">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs text-muted">本发行人已写入 {mine.length} 项</p>
                <button type="button" className="text-xs text-review" onClick={() => clearTicker(ticker)}>
                  全部撤掉
                </button>
              </div>
              <ul className="mt-1 divide-y divide-rule">
                {mine.map((w) => (
                  <li key={w.target} className="flex items-baseline justify-between gap-2 py-1.5">
                    <p className="min-w-0 text-sm">
                      {targetLabel(w.target)}
                      <span className="ml-2 font-mono text-xs text-muted">{w.label}</span>
                    </p>
                    <div className="flex shrink-0 items-baseline gap-2">
                      <span className="font-mono text-xs tabular-nums">{wan(w.million * 100)}</span>
                      <button type="button" className="text-xs text-muted" onClick={() => remove(w.ticker, w.target)}>
                        撤
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                to="/issuer/$id"
                params={{ id: `hk-${ticker}` }}
                className="mt-2 inline-block text-sm text-forest underline underline-offset-2"
              >
                看重算后的底稿
              </Link>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] sm:p-5">
          <h2 className="font-display text-2xl">试一行</h2>
          <p className="mt-1 text-xs text-ink-soft">中英文都行。包随上面选的发行人。</p>
          <div className="mt-3 flex flex-col gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runTrial();
              }}
              placeholder="例如：Investment properties"
              className={inputCls}
            />
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as MapSection)}
              className={inputCls}
            >
              {MAP_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {SECTION_LABEL[s]}
                </option>
              ))}
            </select>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="金额（百万）"
              className={inputCls}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={runTrial}>
                映射
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const g = trial ?? guessLine(label.trim() || " ", pack, section);
                  setTrial(g);
                  writeGuess(g.target, label.trim(), amount);
                }}
              >
                写入科目
              </Button>
            </div>
          </div>
          {trial && (
            <ol className="mt-3 divide-y divide-rule">
              {trial.top.map((t, i) => (
                <li key={t.id} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <p className={cn("text-sm", i === 0 ? "text-ink" : "text-ink-soft")}>
                    {i === 0 ? "判为 " : ""}
                    {t.label}
                    {i === 0 && sinkOf(t.id).book !== "none" ? (
                      <span className="ml-2 font-mono text-xs text-muted">
                        → {sinkOf(t.id).book === "note" ? "附注" : "主表"}
                      </span>
                    ) : null}
                  </p>
                  <span className="font-mono text-xs tabular-nums text-muted">{pct(t.p, 0)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl">十一条实报行名</h2>
            <Badge tone={nHit === rows.length ? "pass" : "review"}>
              与指定科目一致 {nHit}/{rows.length}
            </Badge>
          </div>
          <div className="mt-3 grid gap-4">
            {grouped.map(([tk, lines]) => (
              <IssuerLines
                key={tk}
                ticker={tk}
                issuer={issuers.find((i) => i.ticker === tk)}
                lines={lines}
                onPick={(lab, sec) => {
                  setTicker(tk);
                  setLabel(lab);
                  setSection(sec);
                  setTrial(null);
                  setMsg("");
                }}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl">规范科目</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {MAP_TARGETS.map((t) => (
              <li key={t.id} className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
                <p className="text-sm">{t.label}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {t.id}
                  {t.sink.book === "none"
                    ? " · 不写"
                    : ` · ${t.sink.book === "note" ? "附注" : "主表"}.${t.sink.key}`}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Shell>
  );
}

function IssuerLines({
  ticker,
  issuer,
  lines,
  onPick,
}: {
  ticker: string;
  issuer: Issuer | undefined;
  lines: (MapLine & { guess: MapGuess })[];
  onPick: (label: string, section: MapSection) => void;
}) {
  return (
    <article className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl">
          <Link to="/issuer/$id" params={{ id: `hk-${ticker}` }} className="hover:text-forest">
            {lines[0]?.issuer}
          </Link>
        </h3>
        <span className="font-mono text-xs text-muted">{ticker}</span>
      </div>
      <ul className="mt-2 divide-y divide-rule">
        {lines.map((l) => {
          const val = issuer ? readTargetValue(issuer, l.guess.target) : 0;
          const empty = isEmptyValue(val);
          const writable = canWriteTarget(l.guess.target);
          return (
            <li key={l.label} className="py-2.5 first:pt-0 last:pb-0">
              <button type="button" className="text-left text-sm leading-snug" onClick={() => onPick(l.label, l.section)}>
                {l.label}
              </button>
              <p className="mt-0.5 font-mono text-xs text-muted">
                {SECTION_LABEL[l.section]} · 指定 {targetLabel(l.target)}
              </p>
              <p className={cn("mt-0.5 text-sm", l.guess.match ? "text-pass" : "text-review")}>
                {l.guess.match ? "→ " : "判成 "}
                {targetLabel(l.guess.target)}
                <span className="ml-2 font-mono text-xs text-muted">{pct(l.guess.p, 0)}</span>
              </p>
              {writable ? (
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {empty ? "科目空着，可写入" : `已在科目 ${wan(val)}`}
                </p>
              ) : (
                <p className="mt-0.5 font-mono text-xs text-muted">不进规范科目</p>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
