import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { getHkScored } from "@/lib/goki/hk-bluechips";
import { useMapIntake } from "@/lib/goki/map-intake";
import { pct } from "@/lib/goki/format";
import { scoreComplete } from "@/lib/goki/complete-net";
import { packOf, PACK_LABEL, sectorLabel } from "@/lib/goki/packs";
import { maxIdentityAbsRel, maxStrictAbsRel } from "@/lib/goki/rules";
import { evaluateGate, VERDICT_LABEL, verdictTone, type Verdict } from "@/lib/goki/verdict";
import type { ScoredIssuer } from "@/lib/goki/types";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/queue")({ component: QueuePage });

function gateOf(s: ScoredIssuer): Verdict {
  return s.verdict ?? evaluateGate(s.issuer).verdict;
}

function QueuePage() {
  useMapIntake((s) => s.writes);
  const rows = getHkScored();
  const nBlock = rows.filter((r) => gateOf(r) === "unresolved" || gateOf(r) === "unable").length;
  const nInc = rows.filter((r) => gateOf(r) === "incomplete").length;
  const nPass = rows.filter((r) => gateOf(r) === "pass").length;
  const nPack = new Set(rows.map((r) => packOf(r.issuer))).size;

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Workshop · Hang Seng</p>
          <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">年报勾稽队列</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            十一条恒生蓝筹。点发行人进发刊台，一次只核这一家。底稿和工坊仍在这里对照。
          </p>
          <p className="mt-2">
            <Link to="/" className="text-sm text-forest underline-offset-2 hover:underline">
              返回发刊台
            </Link>
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">阻断</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-exception">{nBlock}</dd>
          </div>
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">不全</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-review">{nInc}</dd>
          </div>
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">通过</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-pass">{nPass}</dd>
          </div>
          <div className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
            <dt className="text-xs text-muted">规则包</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums">{nPack}</dd>
          </div>
        </dl>

        <div className="overflow-hidden rounded-lg bg-paper-2 shadow-[var(--shadow-border)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">代码</th>
                  <th className="px-3 py-2 font-medium">发行人</th>
                  <th className="px-3 py-2 font-medium">规则包</th>
                  <th className="px-3 py-2 text-right font-medium">硬恒等</th>
                  <th className="px-3 py-2 text-right font-medium">口径残差</th>
                  <th className="px-3 py-2 font-medium">完备</th>
                  <th className="px-3 py-2 font-medium">门禁</th>
                  <th className="px-3 py-2 font-medium">咨询</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const maxRel = s.maxRel ?? maxIdentityAbsRel(s.rules);
                  const hard = maxStrictAbsRel(s.rules);
                  const pack = packOf(s.issuer);
                  const complete = scoreComplete(s.issuer);
                  return (
                    <tr key={s.issuer.id} className="border-b border-rule/70 last:border-0">
                      <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-muted">
                        {s.issuer.ticker}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          to="/"
                          search={{ ticker: s.issuer.ticker }}
                          className="font-medium hover:text-forest"
                        >
                          {s.issuer.name}
                        </Link>
                        <span className="mx-2 text-rule">·</span>
                        <Link
                          to="/issuer/$id"
                          params={{ id: s.issuer.id }}
                          className="text-xs text-muted hover:text-forest"
                        >
                          底稿
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        {sectorLabel(s.issuer)}
                        {pack !== "generic" && (
                          <span className="ml-1 font-mono text-xs text-muted">{PACK_LABEL[pack]}</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono tabular-nums",
                          hard >= 0.01 ? "text-exception" : "text-muted",
                        )}
                      >
                        {pct(hard, 2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {pct(maxRel, 1)}
                      </td>
                      <td className="px-3 py-2.5">
                        {complete.missing.length === 0 ? (
                          <span className="text-pass">齐</span>
                        ) : (
                          <span className={complete.band === "exception" ? "text-exception" : "text-review"}>
                            漏 {complete.missing.length}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={verdictTone(gateOf(s))}>{VERDICT_LABEL[gateOf(s)]}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone="mute">
                          {s.advisoryBand === "exception" ? "例外" : s.advisoryBand === "review" ? "复核" : "过"}
                        </Badge>
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
