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
import { useMapIntake } from "@/lib/goki/map-intake";
import { linesFor } from "@/lib/goki/lines";
import { estimatesFor } from "@/lib/goki/models";
import { mapLinesFor, targetLabel, readTargetValue, isEmptyValue, sinkOf } from "@/lib/goki/map-net";
import { DISPOSITION_LABEL, useNotes, type Disposition } from "@/lib/goki/notes";
import { packOf, PACK_LABEL, sectorLabel } from "@/lib/goki/packs";
import { reconAro, reconCl, reconEcl, reconIp, reconMargin, reconNetwork, reconR03, reconR07 } from "@/lib/goki/recon";
import { RULES, totalAssets, totalLE } from "@/lib/goki/rules";
import { evaluateGate, VERDICT_LABEL, verdictTone, type Verdict } from "@/lib/goki/verdict";
import { absorptionOf, vouchIssuer } from "@/lib/goki/vouch";
import { publicationSet, type PubStatus } from "@/lib/goki/pub";
import { FILING_LANG_LABEL } from "@/lib/goki/filings";
import { SIZE_LABEL, type CompletenessScore, type Issuer, type RulePack } from "@/lib/goki/types";

export const Route = createFileRoute("/issuer/$id")({ component: IssuerPage });

function IssuerPage() {
  const { id } = Route.useParams();
  useMapIntake((s) => s.writes);
  const [tab, setTab] = useState<"bs" | "is" | "cf">("bs");
  const rec = useNotes((s) => s.byId[id]);
  const setStatus = useNotes((s) => s.setStatus);
  const setNote = useNotes((s) => s.setNote);

  const scored = findHk(id);
  if (!scored) {
    return (
      <Shell>
        <p className="text-ink-soft">未找到发行人。</p>
        <Link to="/queue" className="mt-4 inline-block text-sm text-forest underline">
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
          <Link to="/" search={{ ticker: issuer.ticker }} className="text-sm text-muted hover:text-ink">
            发刊台
          </Link>
          <span className="mx-2 text-rule">·</span>
          <Link to="/queue" className="text-sm text-muted hover:text-ink">
            队列
          </Link>
          <span className="mx-2 text-rule">·</span>
          <a href={`/program?ticker=${encodeURIComponent(issuer.ticker)}`} className="text-sm text-muted hover:text-ink">
            程序
          </a>
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

        {pack !== "generic" && (
          <aside className="rounded-lg bg-forest px-4 py-3 text-sm leading-relaxed text-forest-fg">
            <p className="font-medium">{PACK_LABEL[pack]}规则包</p>
            <p className="mt-1 text-forest-fg/80">{packBlurb(pack)}</p>
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
            <GateBlock issuer={issuer} />
            <VouchBlock issuer={issuer} />
            <PubBlock issuer={issuer} />
            <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
              <h2 className="font-display text-xl">十条勾稽</h2>
              <p className="mt-1 text-xs text-ink-soft">
                {pack === "generic"
                  ? "硬恒等必须闭合。口径项的缺口要能用 OCI / 回购 / 处置 / 在建解释，解释不了再上升为例外。"
                  : "硬恒等必须闭合。本包关掉的主表规则标成不适用，不进分诊。"}
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

            <PackRecon issuer={issuer} pack={pack} />
            <EstimatePanel issuer={issuer} />
            <CompletePanel issuer={issuer} />
            <MapPanel issuer={issuer} />
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

function VerdictBadge({ v }: { v: Verdict }) {
  return <Badge tone={verdictTone(v)}>{VERDICT_LABEL[v]}</Badge>;
}

/** P0 gate: the residual is the finding. Unresolved and unable block. */
function GateBlock({ issuer }: { issuer: Issuer }) {
  const gate = evaluateGate(issuer);
  const open = gate.residuals.filter(
    (r) => r.kind === "identity" && !r.skipReason && r.verdict !== "pass",
  );
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl">映射残差门禁</h2>
        <VerdictBadge v={gate.verdict} />
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        塞子已经是恒等，不写缺口。残差自己就是结论：未解释和不能评阻断放行，不全只提示缺项。容差是 n × 半刻度。
      </p>
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">所有硬恒等在披露刻度容差内自行闭合。</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule">
          {open.map((r) => (
            <li key={r.ruleId} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs tabular-nums text-muted">{r.code}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                <VerdictBadge v={r.verdict} />
              </div>
              <p className="mt-1 font-mono text-xs tabular-nums text-ink-soft">
                余额 {wan(r.leftover, 1)} · 容差 {wan(r.leftoverUb, 1)}
              </p>
              {r.unableReason && <p className="mt-1 text-xs text-ink-soft">{r.unableReason}</p>}
              {r.knownMissing.length > 0 && (
                <p className="mt-1 text-xs text-ink-soft">
                  已披露但规则未纳入：{r.knownMissing.map((k) => k.label).join("、")}
                </p>
              )}
              {r.verdict === "unresolved" && r.explainers.length > 0 && (
                <p className="mt-1 text-xs text-muted">
                  可能的空槽：{r.explainers.slice(0, 5).map((k) => k.label).join("、")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** P2 vouching: main statement vs note totals. No fabricated subtotal. */
function VouchBlock({ issuer }: { issuer: Issuer }) {
  const checks = vouchIssuer(issuer);
  const absorb = absorptionOf(issuer).filter((a) => a.verdict === "incomplete");
  if (checks.length === 0 && absorb.length === 0) return null;
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">主表 vs 附注</h2>
      <p className="mt-1 text-xs text-ink-soft">
        主表没有对应专槽的，记不能评，不编造合计。附注能吃掉的缺口标成不全，不上升为例外。
      </p>
      {checks.length > 0 && (
        <ul className="mt-3 divide-y divide-rule">
          {checks.map((c) => (
            <li key={c.id} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs tabular-nums text-muted">{c.id}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                <VerdictBadge v={c.verdict} />
              </div>
              <p className="mt-1 font-mono text-xs tabular-nums text-ink-soft">
                主表 {wan(c.main, 1)} · 附注 {wan(c.notes, 1)} · 差 {wan(c.leftover, 1)}
              </p>
              {c.unableReason && <p className="mt-1 text-xs text-ink-soft">{c.unableReason}</p>}
            </li>
          ))}
        </ul>
      )}
      {absorb.length > 0 && (
        <p className="mt-3 text-xs text-ink-soft">
          附注吸收：{absorb.map((a) => `${a.code}(${a.knownMissing.map((k) => k.label).join("/")})`).join("、")}
        </p>
      )}
    </section>
  );
}

const PUB_LABEL: Record<PubStatus, string> = {
  pass: "通过",
  missing: "缺件",
  mismatch: "不一致",
  pending: "待核",
};

function pubTone(s: PubStatus): "pass" | "review" | "exception" | "mute" {
  if (s === "pass") return "pass";
  if (s === "pending") return "mute";
  if (s === "missing") return "review";
  return "exception";
}

/** P4 release set. Files that are not wired stay 待核 and are never reconciled. */
function PubBlock({ issuer }: { issuer: Issuer }) {
  const checks = publicationSet(issuer);
  const nPending = checks.filter((c) => c.status === "pending").length;
  const nWired = checks.filter((c) => c.status !== "pending").length;
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">发布集合</h2>
      <p className="mt-1 text-xs text-ink-soft">
        中英对、ESG、ESS 标题、截止、业绩公告。已接 {nWired} 条可对账，{nPending} 条仍待核。没文件的不算通过。
      </p>
      <ul className="mt-3 divide-y divide-rule">
        {checks.map((c) => (
          <li key={c.id} className="py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-mono text-xs tabular-nums text-muted">{c.id}</span> {c.label}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">{c.note}</p>
              </div>
              <Badge tone={pubTone(c.status)}>{PUB_LABEL[c.status]}</Badge>
            </div>
            {c.files.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {c.files.map((f, i) => (
                  <li key={`${c.id}-${f.kind}-${f.lang}-${f.filename || f.essTitle}-${i}`} className="text-xs text-muted">
                    <span className="font-mono tabular-nums">{FILING_LANG_LABEL[f.lang]}</span>
                    {f.published ? (
                      <>
                        <span className="mx-1.5 text-rule">·</span>
                        <span className="tabular-nums">{f.published}</span>
                      </>
                    ) : null}
                    {f.url ? (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-forest underline-offset-2 hover:underline"
                      >
                        {f.essTitle}
                      </a>
                    ) : (
                      <span className="ml-2">{f.essTitle}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">不构成鉴证意见。</p>
    </section>
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

function packBlurb(pack: RulePack): string {
  if (pack === "bank")
    return "毛利、存货、固定资产、简化间接法、应收周转已关掉。改测 ECL 准备滚存、贷款净额、贷存比。";
  if (pack === "realty")
    return "固定资产成本滚存和简化间接法已关掉。改测投资物业公允滚存、待售物业、净负债率。";
  if (pack === "energy")
    return "简化 PPE 滚存已关掉。改测折耗减值后的油气/电厂资产、弃置准备、燃料条款。";
  if (pack === "exchange")
    return "毛利、存货、PPE、简化 CFO 已关掉。现金拆成公司资金 / 保证金 / 结算所 / 沪深股通。";
  if (pack === "platform") return "存货周转已关掉。看合同负债、股份支付、定期存款。";
  if (pack === "telco") return "网络资产走在建。看无形/频谱、合同资产和预存款。";
  return "";
}

function PackRecon({ issuer, pack }: { issuer: Issuer; pack: RulePack }) {
  if (pack === "bank") return <BankReconCards issuer={issuer} />;
  if (pack === "realty") return <RealtyRecon issuer={issuer} />;
  if (pack === "energy") return <EnergyRecon issuer={issuer} />;
  if (pack === "exchange") return <ExchangeRecon issuer={issuer} />;
  if (pack === "platform") return <PlatformRecon issuer={issuer} />;
  if (pack === "telco") return <TelcoRecon issuer={issuer} />;
  return <ReconCards issuer={issuer} />;
}

function EstimatePanel({ issuer }: { issuer: Issuer }) {
  const { ecl, fv, dda, buyback, sbc, deferred, pack: guess } = estimatesFor(issuer);
  const items: { title: string; hint: string; score: NonNullable<typeof ecl> }[] = [];
  if (ecl) items.push({ title: "Estimate-Net ECL", hint: "覆盖率对照同业约 1.2%。", score: ecl });
  if (fv) items.push({ title: "Estimate-Net 公允", hint: "公允变动对照投资物业存量。", score: fv });
  if (dda) items.push({ title: "Estimate-Net 折耗", hint: packOf(issuer) === "telco" ? "本年折旧摊销÷PPE 对照上年。中移动约 27%（含无形摊销）是电信常态。" : "本年折旧÷PPE 对照上年。油气高、电厂低，跳升才质疑。", score: dda });
  if (buyback) items.push({ title: "Estimate-Net 回购", hint: "回购占盈利。接近或超过当年盈利才复核。", score: buyback });
  if (sbc) items.push({ title: "Estimate-Net 股份支付", hint: "权益结算股份支付占期间费用。", score: sbc });
  if (deferred) items.push({ title: "Estimate-Net 递延", hint: packOf(issuer) === "telco" ? "合同负债÷收入。预存款/积分通常个位数百分比。" : "合同负债÷收入。游戏点券高、到家低。", score: deferred });
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">估计</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Pack-Net 判为 {PACK_LABEL[guess.pack]}
        {guess.match ? "（与指定包一致）" : `（指定 ${PACK_LABEL[guess.assigned]}）`}。
      </p>
      <ul className="mt-3 divide-y divide-rule">
        {items.map((it) => (
          <li key={it.title} className="py-3 first:pt-0 last:pb-0">
            <p className="font-display text-lg">{it.title}</p>
            <p className="mt-0.5 text-xs text-ink-soft">{it.hint}</p>
            <p className="mt-2 font-mono text-sm tabular-nums">
              实际 {pct(it.score.actual, 2)} · 参照 {pct(it.score.predicted, 2)} · p(异常) {compactP(it.score.pOutlier)}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {it.score.band === "pass"
                ? "未超出同业邻域。"
                : it.score.band === "review"
                  ? "偏离值得对照附注。"
                  : "偏离过大，要质疑模型/估值假设。"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompletePanel({ issuer }: { issuer: Issuer }) {
  const { complete } = estimatesFor(issuer);
  return <CompletenessCard score={complete} />;
}

function CompletenessCard({ score }: { score: CompletenessScore }) {
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">附注完备</h2>
        <Badge tone={score.band === "exception" ? "exception" : score.band === "review" ? "review" : "pass"}>
          {score.missing.length === 0 ? "齐" : `漏 ${score.missing.length}`}
        </Badge>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Completeness-Net：适用字段为空、且对应恒等开口，才叫漏填。空着但公式已经闭合的，不当漏填。
      </p>
      {score.missing.length === 0 ? (
        <p className="mt-3 text-sm text-pass">适用项已填，或空字段没有对应开口。</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule">
          {score.missing.map((h) => (
            <li key={h.id} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm">{h.label}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {h.related} 残差 {pct(h.rel, 1)} · p {compactP(h.p)}
                </p>
              </div>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  h.band === "exception" ? "text-exception" : "text-review",
                )}
              >
                {h.band === "exception" ? "漏填" : "待核"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MapPanel({ issuer }: { issuer: Issuer }) {
  const put = useMapIntake((s) => s.put);
  const allWrites = useMapIntake((s) => s.writes);
  const writes = allWrites.filter((w) => w.ticker === issuer.ticker);
  const lines = mapLinesFor(issuer.ticker);
  const nHit = lines.filter((l) => l.guess.match).length;
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  if (lines.length === 0) return null;
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">行项目映射</h2>
        <Badge tone={nHit === lines.length ? "pass" : "review"}>
          {nHit}/{lines.length}
        </Badge>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        映射结果写入附注空槽，勾稽当场重算。主表已有数不覆盖。金额是报表货币百万。
      </p>
      <ul className="mt-3 divide-y divide-rule">
        {lines.map((l) => {
          const val = readTargetValue(issuer, l.guess.target);
          const empty = isEmptyValue(val);
          const sink = sinkOf(l.guess.target);
          return (
            <li key={l.label} className="py-2 first:pt-0 last:pb-0">
              <p className="text-sm leading-snug">{l.label}</p>
              <p className={cn("mt-0.5 font-mono text-xs", l.guess.match ? "text-pass" : "text-review")}>
                {l.guess.match ? targetLabel(l.target) : `判成 ${targetLabel(l.guess.target)} · 指定 ${targetLabel(l.target)}`}
                <span className="ml-2 text-muted">{pct(l.guess.p, 0)}</span>
              </p>
              {sink.book === "none" ? (
                <p className="mt-0.5 font-mono text-xs text-muted">不进规范科目</p>
              ) : empty ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={amt[l.guess.target] ?? ""}
                    onChange={(e) => setAmt((s) => ({ ...s, [l.guess.target]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="百万"
                    className="h-11 w-28 min-w-0 rounded-md bg-paper px-3 text-sm shadow-[var(--shadow-border)]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const million = Number((amt[l.guess.target] ?? "").replace(/,/g, ""));
                      if (!Number.isFinite(million) || million === 0) {
                        setMsg("填百万金额。");
                        return;
                      }
                      put({ ticker: issuer.ticker, label: l.label, target: l.guess.target, million });
                      setMsg(`已写入 ${targetLabel(l.guess.target)}`);
                    }}
                  >
                    写入
                  </Button>
                </div>
              ) : (
                <p className="mt-0.5 font-mono text-xs text-muted">已在科目 {wan(val)}</p>
              )}
            </li>
          );
        })}
      </ul>
      {writes.length > 0 ? (
        <p className="mt-2 font-mono text-xs text-pass">本页已写入 {writes.length} 项</p>
      ) : null}
      {msg ? <p className="mt-1 text-sm text-pass">{msg}</p> : null}
    </section>
  );
}

function RealtyRecon({ issuer }: { issuer: Issuer }) {
  const r3 = reconR03(issuer);
  const ip = reconIp(issuer);
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">地产缺口拆开</h2>
      <div className="mt-3 grid gap-3">
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">N01 权益（截断）</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            ΔRE {wan(r3.deltaRe, 1)} − (NI − 分红) {wan(r3.niMinusDiv, 1)} ={" "}
            <span className="text-review">{wan(r3.gap, 1)}</span>
          </p>
        </div>
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">P01 投资物业</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            期末 {wan(ip.end, 1)} − (期初 {wan(ip.beg, 1)} + 购置 {wan(ip.add, 1)} + 转入 {wan(ip.transfer, 1)} + 公允{" "}
            {wan(ip.fv, 1)} − 处置 {wan(ip.disp, 1)}) ={" "}
            <span className={Math.abs(ip.gap) / Math.max(Math.abs(ip.end), 1) < 0.01 ? "text-pass" : "text-review"}>
              {wan(ip.gap, 1)}
            </span>
          </p>
          <p className="mt-1 font-mono text-xs text-muted">公允 / 存量 {pct(ip.fvRatio, 2)}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{ip.hint}</p>
        </div>
      </div>
    </section>
  );
}

function PlatformRecon({ issuer }: { issuer: Issuer }) {
  const c = reconCl(issuer);
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">平台缺口拆开</h2>
      <div className="mt-3 grid gap-3">
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">T03 合同负债</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            期末 {wan(c.end, 1)} − (期初 {wan(c.beg, 1)} + 预收 {wan(c.add, 1)} − 结转 {wan(c.release, 1)}) ={" "}
            <span className={Math.abs(c.gap) < 1 ? "text-pass" : "text-review"}>{wan(c.gap, 1)}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{c.hint}</p>
        </div>
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">T04 股份支付</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            权益结算 {wan(c.sbp, 1)} · 占开支 {pct(c.sbpRatio, 1)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">进股本溢价和其他储备，不进未分配利润。</p>
        </div>
      </div>
    </section>
  );
}

function TelcoRecon({ issuer }: { issuer: Issuer }) {
  const n = reconNetwork(issuer);
  const c = reconCl(issuer);
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">电信缺口拆开</h2>
      <div className="mt-3 grid gap-3">
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">C01 网络资产</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            PPE {wan(n.ppe, 1)} + 在建 {wan(n.cip, 1)} − 滚存 {wan(n.expected, 1)} ={" "}
            <span className={Math.abs(n.gap) / Math.max(n.stock, 1) < 0.01 ? "text-pass" : "text-review"}>
              {wan(n.gap, 1)}
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{n.hint}</p>
        </div>
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">C02 无形 / 频谱</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            期末 {wan(n.intan, 1)} 缺口 {wan(n.intanGap, 1)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">并购并入不进本年购置就会开口。</p>
        </div>
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">C04 合同负债 · C05 合同资产</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            负债缺口 {wan(c.gap, 1)} · 资产/收入 {pct(n.caRatio, 1)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{c.hint}</p>
        </div>
      </div>
    </section>
  );
}

function EnergyRecon({ issuer }: { issuer: Issuer }) {
  const r7 = reconR07(issuer);
  const a = reconAro(issuer);
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">能源缺口拆开</h2>
      <div className="mt-3 grid gap-3">
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">E01 油气/电厂资产（简化）</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            期末 {wan(r7.actual, 1)} − (期初 + 开支 − 折耗) ={" "}
            <span className="text-review">{wan(r7.gap, 1)}</span>
          </p>
        </div>
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">E02 弃置准备</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            期末 {wan(a.end, 1)} − (期初 {wan(a.beg, 1)} + 新井/修订 {wan(a.charge, 1)} + 折现 {wan(a.unwind, 1)} − 使用{" "}
            {wan(a.use, 1)}) ={" "}
            <span className={Math.abs(a.gap) / Math.max(Math.abs(a.end), 1) < 0.01 ? "text-pass" : "text-review"}>
              {wan(a.gap, 1)}
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{a.hint}</p>
        </div>
      </div>
    </section>
  );
}

function ExchangeRecon({ issuer }: { issuer: Issuer }) {
  const m = reconMargin(issuer);
  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">交易所现金拆开</h2>
      <div className="mt-3 grid gap-3">
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">X01 四段现金</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            公司 {wan(m.ownCash, 1)} + 保证金 {wan(m.marginCash, 1)} + 结算所 {wan(m.clearingCash, 1)} + 沪深{" "}
            {wan(m.asharesCash, 1)} − 报表 {wan(m.cash, 1)} ={" "}
            <span className={Math.abs(m.cashGap) < 1 ? "text-pass" : "text-exception"}>{wan(m.cashGap, 1)}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{m.hint}</p>
        </div>
        <div className="rounded-md bg-paper px-3 py-3 shadow-[var(--shadow-border)]">
          <p className="font-mono text-xs text-muted">X02 保证金资产负债</p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            基金资产 {wan(m.marginFunds, 1)} − 参与者负债 {wan(m.marginLiab, 1)} ={" "}
            <span className="text-review">{wan(m.marginGap, 1)}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
