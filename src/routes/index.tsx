import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CompileSplash } from "@/components/compile-splash";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useEngagement } from "@/lib/goki/engagement-context";
import { checksumShort, compactP, pct, aeFmt } from "@/lib/goki/format";
import { useNotes } from "@/lib/goki/notes";
import { maxIdentityAbsRel } from "@/lib/goki/rules";
import { INDUSTRY_LABEL, SIZE_LABEL, type ScoredIssuer } from "@/lib/goki/types";

export const Route = createFileRoute("/")({ component: Home });

const PAGE = 20;

function bandTone(band: ScoredIssuer["band"]) {
  if (band === "exception") return "exception" as const;
  if (band === "review") return "review" as const;
  return "pass" as const;
}

function bandLabel(band: ScoredIssuer["band"]) {
  if (band === "exception") return "例外";
  if (band === "review") return "复核";
  return "通过";
}

function Home() {
  const eng = useEngagement();
  const showAnswers = useNotes((s) => s.showAnswers);
  const setShowAnswers = useNotes((s) => s.setShowAnswers);
  const [q, setQ] = useState("");
  const [band, setBand] = useState<"all" | ScoredIssuer["band"]>("all");
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    if (!eng) return [];
    const needle = q.trim();
    return eng.issuers.filter((s) => {
      if (band !== "all" && s.band !== band) return false;
      if (!needle) return true;
      return s.issuer.ticker.includes(needle) || s.issuer.name.includes(needle);
    });
  }, [eng, q, band]);

  if (!eng) return <CompileSplash />;

  const m = eng.metrics;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, (page + 1) * PAGE);

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
              Engagement · seed {eng.seed} · {eng.backend}
            </p>
            <h1 className="mt-1 font-display text-4xl tracking-tight text-ink sm:text-5xl">
              FY2025 年报勾稽复核
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
              规则算残差，模型只做分诊。1,000 家合成发行人，10 条勾稽，38 维特征，4,609
              参数 MLP，CPU 即可复现。港股蓝筹实报在{" "}
              <Link to="/hk" className="text-forest underline underline-offset-2">
                港股
              </Link>
              。
            </p>
          </div>
          <Button
            variant={showAnswers ? "primary" : "secondary"}
            onClick={() => setShowAnswers(!showAnswers)}
          >
            {showAnswers ? "隐藏标准答案" : "显示标准答案"}
          </Button>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="例外队列" value={String(m.nException)} hint={`真错误 ${m.nTrueError}`} />
          <Kpi label="Test AUC" value={m.testAuc.toFixed(3)} hint={`AP ${m.testAp.toFixed(3)}`} />
          <Kpi
            label="召回 / 精确"
            value={`${pct(m.recall, 0)} / ${pct(m.precision, 0)}`}
            hint={`acc ${pct(m.testAcc, 0)}`}
          />
          <Kpi
            label="黄金文件"
            value={checksumShort(m.weightChecksum)}
            hint={`${m.paramCount} params · ${Math.round(m.trainMs)} ms`}
          />
        </dl>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="搜索代码或名称"
            className="h-11 w-full rounded-md bg-paper-2 px-3 text-sm text-ink shadow-[var(--shadow-border)] outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1">
            {(["all", "exception", "review", "pass"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => {
                  setBand(b);
                  setPage(0);
                }}
                className={cn(
                  "h-11 rounded-sm px-3 text-sm",
                  band === b ? "bg-forest text-forest-fg" : "bg-paper-2 text-ink-soft",
                )}
              >
                {b === "all" ? "全部" : bandLabel(b)}
              </button>
            ))}
          </div>
          <p className="ml-auto font-mono text-xs text-muted tabular-nums">{rows.length} 家</p>
        </div>

        <div className="overflow-hidden rounded-lg bg-paper-2 shadow-[var(--shadow-border)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">发行人</th>
                  <th className="px-3 py-2 font-medium">行业</th>
                  <th className="px-3 py-2 text-right font-medium">P(真错误)</th>
                  <th className="px-3 py-2 text-right font-medium">最大相对残差</th>
                  <th className="px-3 py-2 text-right font-medium">AE</th>
                  <th className="px-3 py-2 font-medium">分诊</th>
                  {showAnswers && <th className="px-3 py-2 font-medium">注入</th>}
                </tr>
              </thead>
              <tbody>
                {slice.map((s, i) => {
                  return (
                    <tr key={s.issuer.id} className="border-b border-rule/70 last:border-0">
                      <td className="px-3 py-2.5 font-mono text-xs text-muted tabular-nums">
                        {page * PAGE + i + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          to="/issuer/$id"
                          params={{ id: s.issuer.id }}
                          className="flex flex-col hover:text-forest"
                        >
                          <span className="font-mono text-xs tabular-nums">{s.issuer.ticker}</span>
                          <span className="font-medium">{s.issuer.name}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        {INDUSTRY_LABEL[s.issuer.industry]}
                        <span className="ml-1 text-xs text-muted">
                          {SIZE_LABEL[s.issuer.size]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {compactP(s.pError)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {pct(s.maxRel ?? maxIdentityAbsRel(s.rules), 2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted tabular-nums">
                        {aeFmt(s.aeErr)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={bandTone(s.band)}>{bandLabel(s.band)}</Badge>
                      </td>
                      {showAnswers && (
                        <td className="px-3 py-2.5 text-xs text-ink-soft">
                          {injectLabel(s.issuer.inject)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-rule px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              上一页
            </Button>
            <p className="font-mono text-xs text-muted tabular-nums">
              {page + 1} / {pages}
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-medium tabular-nums">{value}</dd>
      <p className="mt-0.5 font-mono text-xs text-muted">{hint}</p>
    </div>
  );
}

function injectLabel(k: ScoredIssuer["issuer"]["inject"]) {
  if (k === "true_error") return "真错误";
  if (k === "rounding") return "舍入";
  if (k === "reclass") return "重分类";
  return "干净";
}
