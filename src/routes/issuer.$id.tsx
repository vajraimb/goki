import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { StatementTable } from "@/components/statement-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useEngagement } from "@/lib/goki/engagement-context";
import { issuerFeatures } from "@/lib/goki/features";
import { compactP, pct, wan, aeFmt } from "@/lib/goki/format";
import { findHk } from "@/lib/goki/hk-bluechips";
import { BS_LINES, CF_LINES, IS_LINES } from "@/lib/goki/lines";
import { DISPOSITION_LABEL, useNotes, type Disposition } from "@/lib/goki/notes";
import { reconR03, reconR07 } from "@/lib/goki/recon";
import { RULES, totalAssets, totalLE } from "@/lib/goki/rules";
import { getIssuers } from "@/lib/goki/statements";
import { INDUSTRY_LABEL, SIZE_LABEL, type Issuer } from "@/lib/goki/types";

export const Route = createFileRoute("/issuer/$id")({ component: IssuerPage });

function IssuerPage() {
  const { id } = Route.useParams();
  const eng = useEngagement();
  const [tab, setTab] = useState<"bs" | "is" | "cf">("bs");
  const showAnswers = useNotes((s) => s.showAnswers);
  const rec = useNotes((s) => s.byId[id]);
  const setStatus = useNotes((s) => s.setStatus);
  const setNote = useNotes((s) => s.setNote);

  const hk = findHk(id);
  const scored = hk ?? eng.issuers.find((s) => s.issuer.id === id);
  if (!scored) {
    return (
      <Shell>
        <p className="text-ink-soft">未找到发行人。</p>
        <Link to="/" className="mt-4 inline-block text-sm text-forest underline">
          返回队列
        </Link>
      </Shell>
    );
  }

  const live = hk ? scored.issuer : (getIssuers().find((item) => item.id === id) ?? scored.issuer);
  const issuer = live;
  const { rules } = hk ? { rules: scored.rules } : issuerFeatures(live);
  const { pError, aeErr, cashPred, cashResidual, attribution, band } = scored;
  const { curr, prior } = issuer;
  const assets = totalAssets(curr);
  const le = totalLE(curr);
  const isHk = issuer.source === "hkex";
  const backTo = isHk ? "/hk" : "/";
  const backLabel = isHk ? "港股实报" : "队列";

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div>
          <Link to={backTo} className="text-sm text-muted hover:text-ink">
            {backLabel}
          </Link>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs tabular-nums text-muted">{issuer.ticker}</p>
              <h1 className="font-display text-4xl tracking-tight">{issuer.name}</h1>
              <p className="mt-1 text-sm text-ink-soft">
                {INDUSTRY_LABEL[issuer.industry]} · {SIZE_LABEL[issuer.size]} · 资产 {wan(assets)}
                {issuer.periodLabel ? ` · ${issuer.periodLabel}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={band === "exception" ? "exception" : band === "review" ? "review" : "pass"}>
                {band === "exception" ? "例外" : band === "review" ? "复核" : "通过"}
              </Badge>
              <Badge>
                {isHk ? "规则风险" : "P"} {compactP(pError)}
              </Badge>
              <Badge>AE {aeFmt(aeErr)}</Badge>
              {isHk && <Badge tone="mute">{issuer.currency}</Badge>}
              {showAnswers && !isHk && (
                <Badge tone={issuer.inject === "true_error" ? "exception" : "mute"}>
                  {issuer.inject === "true_error"
                    ? `真错误 ${issuer.errorKinds.join(" / ")}`
                    : issuer.inject === "rounding"
                      ? "注入：舍入"
                      : issuer.inject === "reclass"
                        ? "注入：重分类"
                        : "注入：干净"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {isHk && issuer.caveats && issuer.caveats.length > 0 && (
          <aside className="rounded-lg bg-review-soft px-4 py-3 text-sm leading-relaxed text-ink">
            <p className="font-medium">映射说明</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-ink-soft">
              {issuer.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </aside>
        )}

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex gap-1">
              {(
                [
                  ["bs", "资产负债表"],
                  ["is", "利润表"],
                  ["cf", "现金流量表"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cn(
                    "h-11 rounded-sm px-3 text-sm",
                    tab === k ? "bg-forest text-forest-fg" : "bg-paper-2 text-ink-soft",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "bs" && (
              <StatementTable
                title="资产负债表"
                lines={BS_LINES}
                curr={curr}
                prior={prior}
                unit={issuer.unitLabel ?? "单位：万元"}
              />
            )}
            {tab === "is" && (
              <StatementTable
                title="利润表"
                lines={IS_LINES}
                curr={curr}
                prior={prior}
                unit={issuer.unitLabel ?? "单位：万元"}
              />
            )}
            {tab === "cf" && (
              <StatementTable
                title="现金流量表"
                lines={CF_LINES}
                curr={curr}
                prior={prior}
                unit={issuer.unitLabel ?? "单位：万元"}
              />
            )}
            <p className="font-mono text-xs text-muted tabular-nums">
              资产合计 {wan(assets)} · 负债+权益 {wan(le)} · 差额 {wan(assets - le)}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
              <h2 className="font-display text-xl">十条勾稽</h2>
              {isHk && (
                <p className="mt-1 text-xs text-ink-soft">
                  硬恒等必须闭合。口径项的缺口要能用 OCI / 回购 / 处置 / 在建解释，解释不了再上升为例外。
                </p>
              )}
              <ol className="mt-3 divide-y divide-rule">
                {rules.map((r) => {
                  const def = RULES.find((d) => d.id === r.ruleId)!;
                  const hot = Math.abs(r.rel) >= 0.05;
                  const warm = Math.abs(r.rel) >= 0.01;
                  return (
                    <li key={r.ruleId} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm">
                          <span className="font-mono text-xs text-muted">{def.code}</span>{" "}
                          {def.name}{" "}
                          <span className="text-xs text-muted">
                            {def.strict ? "硬" : def.kind === "analytic" ? "分析" : "口径"}
                          </span>
                        </p>
                        <p
                          className={cn(
                            "font-mono text-xs tabular-nums",
                            def.strict && hot
                              ? "text-exception"
                              : hot
                                ? "text-review"
                                : warm
                                  ? "text-review"
                                  : "text-muted",
                          )}
                        >
                          {pct(r.rel, 2)}
                        </p>
                      </div>
                      <p className="mt-0.5 font-mono text-xs break-all text-muted">{def.formula}</p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-soft">
                        残差 {wan(r.residual, 1)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </section>

            {isHk && <ReconCards issuer={issuer} />}

            <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
              <h2 className="font-display text-xl">{isHk ? "残差归因" : "模型解释"}</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {isHk
                  ? "按相对残差绝对值排序。正负只表示方向。现金滚存残差 " +
                    pct(cashResidual, 2) +
                    "。"
                  : `对 logit 的输入显著性（∇z · x）。正值推向“真错误”。现金回归残差 ${pct(cashResidual, 2)}（预测 ${pct(cashPred, 1)} of assets）。`}
              </p>
              <ul className="mt-3 space-y-1.5">
                {attribution.map((a) => (
                  <li key={a.name} className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0 font-mono text-muted">{a.name}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-3">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          a.value >= 0 ? "bg-exception" : "bg-forest",
                        )}
                        style={{ width: `${Math.min(100, Math.abs(a.value) * 80 + 6)}%` }}
                      />
                    </span>
                    <span className="w-14 text-right font-mono tabular-nums">
                      {a.value.toFixed(3)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
              <h2 className="font-display text-xl">审计师处置</h2>
              <p className="mt-1 text-xs text-ink-soft">
                {isHk
                  ? "实报残差要写进底稿：是口径、是估计，还是真要上经理。"
                  : "模型只排序。最终判定留在底稿里，随浏览器本地保存。"}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(Object.keys(DISPOSITION_LABEL) as Disposition[])
                  .filter((d) => d !== "unset")
                  .map((d) => (
                    <Button
                      key={d}
                      variant={rec?.status === d ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setStatus(id, d)}
                    >
                      {DISPOSITION_LABEL[d]}
                    </Button>
                  ))}
              </div>
              <textarea
                value={rec?.note ?? ""}
                onChange={(e) => setNote(id, e.target.value)}
                rows={3}
                placeholder="底稿说明…"
                className="mt-3 w-full rounded-md bg-paper px-3 py-2 text-sm text-ink shadow-[var(--shadow-border)] outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              />
            </section>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function ReconCards({ issuer }: { issuer: Issuer }) {
  const r3 = reconR03(issuer);
  const r7 = reconR07(issuer);
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">简化缺口拆开</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        不是模型没学好。是公式少写了项。缺口能被年报附注吃掉，就不必上升为例外。
      </p>
      <div className="mt-3 grid gap-3">
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">R03 未分配利润</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            ΔRE {wan(r3.deltaRe, 1)} − (NI − 分红) {wan(r3.niMinusDiv, 1)} ={" "}
            <span className="text-review">{wan(r3.gap, 1)}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{r3.hint}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            完整：ΔRE = NI − 分红 + OCI − 回购 ± 储备 ± NCI
          </p>
        </div>
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">R07 固定资产</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            期末 {wan(r7.actual, 1)} − (期初 {wan(r7.priorPpe, 1)} + 开支 {wan(r7.capex, 1)} − 折旧{" "}
            {wan(r7.da, 1)}) = <span className="text-review">{wan(r7.gap, 1)}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{r7.hint}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            完整：还要 ± 处置 ± 在建结转 ± 减值 ± 汇兑 ± 重估
          </p>
        </div>
      </div>
    </section>
  );
}
