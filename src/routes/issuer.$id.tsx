import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { NoteCloser } from "@/components/note-closer";
import { StatementTable } from "@/components/statement-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { compactP, pct, wan, aeFmt } from "@/lib/goki/format";
import { findHk } from "@/lib/goki/hk-bluechips";
import { linesFor } from "@/lib/goki/lines";
import { DISPOSITION_LABEL, useNotes, type Disposition } from "@/lib/goki/notes";
import { packOf, PACK_LABEL, sectorLabel } from "@/lib/goki/packs";
import { reconEcl, reconR03, reconR07 } from "@/lib/goki/recon";
import { RULES, totalAssets, totalLE } from "@/lib/goki/rules";
import { SIZE_LABEL, type Issuer } from "@/lib/goki/types";

export const Route = createFileRoute("/issuer/$id")({ component: IssuerPage });

function IssuerPage() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<"bs" | "is" | "cf">("bs");
  const rec = useNotes((s) => s.byId[id]);
  const setStatus = useNotes((s) => s.setStatus);
  const setNote = useNotes((s) => s.setNote);

  const scored = findHk(id);
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

  const issuer = scored.issuer;
  const { rules, pError, aeErr, cashResidual, attribution, band } = scored;
  const { curr, prior } = issuer;
  const assets = totalAssets(curr);
  const le = totalLE(curr);
  const pack = packOf(issuer);
  const lineSet = linesFor(pack);

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div>
          <Link to="/" className="text-sm text-muted hover:text-ink">
            队列
          </Link>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs tabular-nums text-muted">{issuer.ticker}</p>
              <h1 className="font-display text-4xl tracking-tight">{issuer.name}</h1>
              <p className="mt-1 text-sm text-ink-soft">
                {sectorLabel(issuer)} · {SIZE_LABEL[issuer.size]} · 资产 {wan(assets)}
                {issuer.periodLabel ? ` · ${issuer.periodLabel}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {pack !== "generic" && <Badge tone="forest">{PACK_LABEL[pack]}包</Badge>}
              <Badge tone={band === "exception" ? "exception" : band === "review" ? "review" : "pass"}>
                {band === "exception" ? "例外" : band === "review" ? "复核" : "通过"}
              </Badge>
              <Badge>规则风险 {compactP(pError)}</Badge>
              <Badge>AE {aeFmt(aeErr)}</Badge>
              <Badge tone="mute">{issuer.currency}</Badge>
            </div>
          </div>
        </div>

        {pack === "bank" && (
          <aside className="rounded-lg bg-forest px-4 py-3 text-sm leading-relaxed text-forest-fg">
            <p className="font-medium">银行规则包</p>
            <p className="mt-1 text-forest-fg/80">
              毛利、存货周转、固定资产滚存、简化间接法已关掉。改测 ECL 准备滚存（B01）、贷款总额−准备=净额（B02）、贷存比（B03）。
            </p>
          </aside>
        )}

        {issuer.caveats && issuer.caveats.length > 0 && (
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
                lines={lineSet.bs}
                curr={curr}
                prior={prior}
                unit={issuer.unitLabel ?? "单位：万元"}
              />
            )}
            {tab === "is" && (
              <StatementTable
                title="利润表"
                lines={lineSet.is}
                curr={curr}
                prior={prior}
                unit={issuer.unitLabel ?? "单位：万元"}
              />
            )}
            {tab === "cf" && (
              <StatementTable
                title="现金流量表"
                lines={lineSet.cf}
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
              <p className="mt-1 text-xs text-ink-soft">
                {pack === "bank"
                  ? "硬恒等必须闭合。毛利/存货/PPE/简化 CFO/应收周转标成银行不适用，不进分诊。"
                  : "硬恒等必须闭合。口径项的缺口要能用 OCI / 回购 / 处置 / 在建解释，解释不了再上升为例外。"}
              </p>
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
                            {r.skipped
                              ? "不适用"
                              : def.strict
                                ? "硬"
                                : def.kind === "analytic"
                                  ? "分析"
                                  : "口径"}
                          </span>
                        </p>
                        <p
                          className={cn(
                            "font-mono text-xs tabular-nums",
                            r.skipped
                              ? "text-muted"
                              : def.strict && hot
                                ? "text-exception"
                                : hot
                                  ? "text-review"
                                  : warm
                                    ? "text-review"
                                    : "text-muted",
                          )}
                        >
                          {r.skipped ? "—" : pct(r.rel, 2)}
                        </p>
                      </div>
                      <p className="mt-0.5 font-mono text-xs break-all text-muted">{def.formula}</p>
                      {r.skipped ? (
                        <p className="mt-0.5 text-xs text-ink-soft">{r.skipReason}</p>
                      ) : (
                        <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-soft">
                          残差 {wan(r.residual, 1)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            {pack === "bank" ? <BankReconCards issuer={issuer} /> : <ReconCards issuer={issuer} />}
            <NoteCloser issuer={issuer} />

            <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
              <h2 className="font-display text-xl">残差归因</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                按相对残差绝对值排序。正负只表示方向。现金滚存残差 {pct(cashResidual, 2)}。
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
                实报残差要写进底稿：是口径、是估计，还是真要上经理。
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

function BankReconCards({ issuer }: { issuer: Issuer }) {
  const r3 = reconR03(issuer);
  const e = reconEcl(issuer);
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">银行缺口拆开</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        PPE 滚存对银行关掉。下面是权益截断式和 ECL / 贷款净额。
      </p>
      <div className="mt-3 grid gap-3">
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">N01 权益（截断式仍缺 OCI/回购）</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            ΔRE {wan(r3.deltaRe, 1)} − (NI − 分红) {wan(r3.niMinusDiv, 1)} ={" "}
            <span className="text-review">{wan(r3.gap, 1)}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{r3.hint}</p>
        </div>
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">B01 ECL 准备滚存</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            期末 {wan(e.end, 1)} − (期初 {wan(e.beg, 1)} + 计提 {wan(e.charge, 1)} − 核销{" "}
            {wan(e.writeoff, 1)}) ={" "}
            <span className={Math.abs(e.gap) / Math.max(Math.abs(e.end), 1) >= 0.05 ? "text-exception" : "text-review"}>
              {wan(e.gap, 1)}
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{e.hint}</p>
        </div>
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">B02 贷款净额</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            总额 {wan(e.gross, 1)} − ECL {wan(e.end, 1)} − 净额 {wan(e.net, 1)} ={" "}
            <span className={Math.abs(e.loanGap) < 1 ? "text-pass" : "text-exception"}>{wan(e.loanGap, 1)}</span>
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            覆盖率 {pct(e.coverage, 2)} · 贷存比 {pct(e.adr, 1)}
          </p>
        </div>
      </div>
    </section>
  );
}
