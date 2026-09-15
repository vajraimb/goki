import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { scoreHkCloser } from "@/lib/goki/closer-engine";
import { compactP, pct } from "@/lib/goki/format";
import { packOf, sectorLabel } from "@/lib/goki/packs";
import type { CloserScore } from "@/lib/goki/types";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/closer")({ component: CloserPage });

function bandTone(band: CloserScore["band"]) {
  if (band === "exception") return "exception" as const;
  if (band === "review") return "review" as const;
  return "pass" as const;
}

function bandLabel(band: CloserScore["band"]) {
  if (band === "exception") return "未闭合";
  if (band === "review") return "复核";
  return "已闭合";
}

function CloserPage() {
  const [rows, setRows] = useState<CloserScore[] | null>(null);
  useEffect(() => {
    setRows(scoreHkCloser());
  }, []);

  if (!rows) {
    return (
      <Shell>
        <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Closer-Net</p>
        <h1 className="mt-1 font-display text-4xl tracking-tight">附注闭合</h1>
        <p className="mt-3 text-sm text-ink-soft">正在编译各行业闭合头…</p>
      </Shell>
    );
  }

  const nEx = rows.filter((r) => r.band === "exception").length;
  const nRev = rows.filter((r) => r.band === "review").length;
  const nPass = rows.filter((r) => r.band === "pass").length;

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
            Note closer · 港股实报
          </p>
          <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">附注闭合</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            六个头，同一套 16→32→16→1。银行看 ECL，地产看投资物业，能源看折耗和弃置，平台看回购和使用权，交易所看保证金现金。合成语料上训，这里只打港股实报。
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">未闭合</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-exception">{nEx}</dd>
          </div>
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">复核</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-review">{nRev}</dd>
          </div>
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">已闭合</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-pass">{nPass}</dd>
          </div>
        </dl>

        <div className="overflow-hidden rounded-lg bg-paper-2 shadow-[var(--shadow-border)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">发行人</th>
                  <th className="px-3 py-2 font-medium">规则包</th>
                  <th className="px-3 py-2 text-right font-medium">p(开口)</th>
                  <th className="px-3 py-2 text-right font-medium">最大残差</th>
                  <th className="px-3 py-2 font-medium">分诊</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const pack = packOf(s.issuer);
                  return (
                    <tr key={s.issuer.id} className="border-b border-rule/70 last:border-0">
                      <td className="px-3 py-2.5">
                        <Link
                          to="/issuer/$id"
                          params={{ id: s.issuer.id }}
                          className="flex flex-col hover:text-forest"
                        >
                          <span className="font-medium">{s.issuer.name}</span>
                          <span className="font-mono text-xs text-muted">{s.issuer.ticker}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        {sectorLabel(s.issuer)}
                        {pack === "bank" && (
                          <span className="ml-1 font-mono text-xs text-muted">B01–B04</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {compactP(s.pOpen)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono tabular-nums",
                          s.maxRel >= 0.05 ? "text-exception" : s.maxRel >= 0.01 ? "text-review" : "text-muted",
                        )}
                      >
                        {pct(s.maxRel, 2)}
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
      </div>
    </Shell>
  );
}
