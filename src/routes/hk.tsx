import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { getHkScored } from "@/lib/goki/hk-bluechips";
import { pct, aeFmt } from "@/lib/goki/format";
import { maxIdentityAbsRel, maxStrictAbsRel } from "@/lib/goki/rules";
import { INDUSTRY_LABEL, type ScoredIssuer } from "@/lib/goki/types";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/hk")({ component: HkPage });

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

function HkPage() {
  const rows = getHkScored();
  const nEx = rows.filter((r) => r.band === "exception").length;
  const nRev = rows.filter((r) => r.band === "review").length;
  const nPass = rows.filter((r) => r.band === "pass").length;

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
            Hang Seng blue chips · HKFRS → 简化勾稽
          </p>
          <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">港股蓝筹实报</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            硬恒等只有三条：资产负债、利润桥、毛利。这三条在映射闭合后必须为零。未分配利润滚存、固定资产滚存是截断式——年报里还有
            OCI、回购、处置、在建，所以会留下口径缺口。缺口要解释，不是拿去再训一轮模型。
            <a href="/goki-model-note.pdf" className="ml-1 text-forest underline underline-offset-2">
              模型说明 PDF
            </a>
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">例外</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-exception">{nEx}</dd>
          </div>
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">复核</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-review">{nRev}</dd>
          </div>
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">通过</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-pass">{nPass}</dd>
          </div>
        </dl>

        <div className="overflow-hidden rounded-lg bg-paper-2 shadow-[var(--shadow-border)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">代码</th>
                  <th className="px-3 py-2 font-medium">发行人</th>
                  <th className="px-3 py-2 font-medium">行业</th>
                  <th className="px-3 py-2 text-right font-medium">硬恒等</th>
                  <th className="px-3 py-2 text-right font-medium">口径残差</th>
                  <th className="px-3 py-2 text-right font-medium">身份均残</th>
                  <th className="px-3 py-2 font-medium">分诊</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const maxRel = s.maxRel ?? maxIdentityAbsRel(s.rules);
                  const hard = maxStrictAbsRel(s.rules);
                  return (
                    <tr key={s.issuer.id} className="border-b border-rule/70 last:border-0">
                      <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-muted">
                        {s.issuer.ticker}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          to="/issuer/$id"
                          params={{ id: s.issuer.id }}
                          className="flex flex-col hover:text-forest"
                        >
                          <span className="font-medium">{s.issuer.name}</span>
                          <span className="font-mono text-xs text-muted">
                            {s.issuer.currency} · {s.issuer.periodLabel}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        {INDUSTRY_LABEL[s.issuer.industry]}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {pct(hard, 2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {pct(maxRel, 2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted tabular-nums">
                        {aeFmt(s.aeErr)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={bandTone(s.band)}>{bandLabel(s.band)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className={cn("max-w-2xl text-xs leading-relaxed text-muted")}>
          例外只在硬恒等（R01/R04/R05）断裂时打。其余打复核，表示要写底稿解释。合成样本上的 MLP
          分的是「注入的真错误 vs 舍入」，不能拿来给港股年报打舞弊分。
        </p>
      </div>
    </Shell>
  );
}
