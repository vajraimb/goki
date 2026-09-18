import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildHkIssuers } from "@/lib/goki/hk-bluechips";
import { liveIssuers, useMapIntake } from "@/lib/goki/map-intake";
import { RC_FY2025, RC_HKFRS18, applies, RULE_CONFIGS } from "@/lib/goki/library";
import { diffRuns, extractConflicts, freezeRun, useRuns } from "@/lib/goki/run";
import { VERDICT_LABEL, verdictTone } from "@/lib/goki/verdict";

export const Route = createFileRoute("/work")({ component: WorkPage });

function WorkPage() {
  const writes = useMapIntake((s) => s.writes);
  const issuers = useMemo(() => liveIssuers(buildHkIssuers()), [writes]);
  const runs = useRuns((s) => s.runs);
  const manifests = useRuns((s) => s.manifests);
  const put = useRuns((s) => s.put);
  const review = useRuns((s) => s.review);
  const preparedBy = useRuns((s) => s.preparedBy);
  const reviewedBy = useRuns((s) => s.reviewedBy);
  const setNames = useRuns((s) => s.setNames);
  const [prep, setPrep] = useState(preparedBy);
  const [rev, setRev] = useState(reviewedBy);
  const [note, setNote] = useState("");
  const conflicts = extractConflicts();
  const latest = runs[0];
  const prev = runs[1];
  const d = latest && prev ? diffRuns(prev, latest) : null;
  const fy25on = RC_FY2025.entries.filter((e) => applies(e, "2025-01-01")).length;
  const h18on = RC_HKFRS18.entries.filter((e) => applies(e, "2025-01-01")).length;

  return (
    <Shell>
      <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Working paper</p>
      <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">底稿签核</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        冻结当前规则配置与映射，生成 Run 和 Manifest。编制和复核必须是两个人。HKFRS 18 对 FY2025 不启用。公司秘书发刊前用发刊台，底稿冻结是工坊动作。
      </p>
      <p className="mt-2">
        <Link to="/" className="text-sm text-forest underline-offset-2 hover:underline">
          返回发刊台
        </Link>
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {RULE_CONFIGS.map((rc) => (
          <article key={rc.id} className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl">{rc.label}</h2>
              <Badge tone={rc.id === RC_FY2025.id ? "pass" : "mute"}>{rc.periodStart.slice(0, 4)}</Badge>
            </div>
            <p className="mt-2 font-mono text-xs text-muted">
              {rc.ruleLibVersion} · {rc.engineVersion} · {rc.id === RC_FY2025.id ? fy25on : h18on} 条对本期生效
            </p>
            <Button
              className="mt-3"
              type="button"
              onClick={() => {
                setNames(prep, rev);
                const frozen = freezeRun(rc, issuers, writes);
                frozen.manifest.preparedBy = prep || "编制";
                put(frozen.run, frozen.manifest);
              }}
            >
              冻结本 RC
            </Button>
          </article>
        ))}
      </div>

      <section className="mt-8 rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-2xl">编制 / 复核</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            value={prep}
            onChange={(e) => setPrep(e.target.value)}
            placeholder="编制人"
            className="h-11 rounded-md bg-paper px-3 text-sm shadow-[var(--shadow-border)] outline-none"
          />
          <input
            value={rev}
            onChange={(e) => setRev(e.target.value)}
            placeholder="复核人"
            className="h-11 rounded-md bg-paper px-3 text-sm shadow-[var(--shadow-border)] outline-none"
          />
        </div>
        {latest ? (
          <div className="mt-3">
            <p className="font-mono text-xs text-muted">
              {latest.id} · {latest.rcId} · checksum {manifests.find((m) => m.runId === latest.id)?.checksum}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="复核意见（必填才能签核）"
              className="mt-2 w-full rounded-md bg-paper px-3 py-2 text-sm shadow-[var(--shadow-border)] outline-none"
            />
            <Button
              className="mt-2"
              type="button"
              variant="secondary"
              disabled={!note.trim() || !rev.trim() || prep.trim() === rev.trim()}
              onClick={() => review(latest.id, rev, note)}
            >
              复核签字
            </Button>
            {prep && rev && prep === rev ? (
              <p className="mt-2 text-xs text-review">编制和复核不能是同一个人。</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">还没有 Run。</p>
        )}
      </section>

      {d ? (
        <section className="mt-6 rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
          <h2 className="font-display text-2xl">RunDiff</h2>
          <p className="mt-1 text-xs text-ink-soft">
            {d.a} → {d.b} · 变更 {d.nChanged}
          </p>
          <ul className="mt-3 divide-y divide-rule">
            {d.rows.map((r) => (
              <li key={r.ticker} className="flex items-baseline justify-between gap-3 py-2">
                <Link to="/issuer/$id" params={{ id: `hk-${r.ticker}` }} className="text-sm hover:text-forest">
                  {r.ticker}
                </Link>
                <span className="font-mono text-xs">
                  {VERDICT_LABEL[r.a]} → {VERDICT_LABEL[r.b]}
                  {r.changed ? " · 变" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {latest ? (
        <section className="mt-6 rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
          <h2 className="font-display text-2xl">本 Run</h2>
          <ul className="mt-3 divide-y divide-rule">
            {latest.rows.map((r) => (
              <li key={r.ticker} className="flex items-baseline justify-between gap-3 py-2">
                <p className="text-sm">{r.name}</p>
                <Badge tone={verdictTone(r.verdict)}>{VERDICT_LABEL[r.verdict]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {conflicts.length > 0 ? (
        <section className="mt-6 rounded-lg bg-review-soft p-4">
          <h2 className="font-display text-xl">双抽取不一致</h2>
          <ul className="mt-2 text-sm">
            {conflicts.map((c) => (
              <li key={`${c.ticker}-${c.target}`}>
                {c.ticker} {c.label} · {c.a} vs {c.b}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}
