import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { BANK_NOTE_RULES } from "@/lib/goki/packs";
import { NOTE_RULES } from "@/lib/goki/note-rules";
import { RULES } from "@/lib/goki/rules";

export const Route = createFileRoute("/rules")({ component: RulesPage });

function RulesPage() {
  return (
    <Shell>
      <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Rule book</p>
      <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">勾稽规则</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        通用包：十条主表 + 八条附注完整式。银行包关掉毛利、存货、PPE、简化 CFO，换上 ECL 滚存和贷款净额。港交所不套银行公式。
      </p>

      <aside className="mt-6 rounded-lg bg-forest px-4 py-3 text-sm text-forest-fg">
        <p className="font-medium">银行包 · 汇丰 / 恒生</p>
        <p className="mt-1 text-forest-fg/80">
          关掉 R05 毛利、R06 简化间接法、R07 固定资产、R09 应收周转、R10 存货周转。启用 B01 ECL 准备滚存、B02 贷款净额恒等、B03 贷存比、B04 覆盖率。
        </p>
      </aside>

      <h2 className="mt-8 font-display text-2xl">银行附注</h2>
      <ol className="mt-3 grid gap-3">
        {BANK_NOTE_RULES.map((r) => (
          <li key={r.id} className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] sm:p-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-muted">{r.code}</span>
              <h3 className="font-display text-2xl">{r.name}</h3>
              <Badge tone={r.kind === "identity" ? "pass" : "mute"}>
                {r.kind === "identity" ? "恒等" : "分析性"}
              </Badge>
            </div>
            <p className="mt-2 font-mono text-sm text-forest">{r.formula}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.explain}</p>
            <p className="mt-2 text-xs text-muted">{r.nameEn}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 font-display text-2xl">主表（通用）</h2>
      <ol className="mt-3 grid gap-3">
        {RULES.map((r) => (
          <li key={r.id} className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] sm:p-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-muted">{r.code}</span>
              <h2 className="font-display text-2xl">{r.name}</h2>
              <Badge tone={r.kind === "identity" ? "forest" : "mute"}>
                {r.kind === "identity" ? "恒等" : "分析性"}
              </Badge>
              <Badge tone={r.strict ? "pass" : "review"}>
                {r.strict ? "硬" : "口径"}
              </Badge>
            </div>
            <p className="mt-2 font-mono text-sm text-forest">{r.formula}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.explain}</p>
            <p className="mt-2 text-xs text-muted">{r.nameEn}</p>
          </li>
        ))}
      </ol>
      <h2 className="mt-10 font-display text-2xl">附注闭合（通用）</h2>
      <ol className="mt-3 grid gap-3">
        {NOTE_RULES.map((r) => (
          <li key={r.id} className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] sm:p-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-muted">{r.code}</span>
              <h3 className="font-display text-2xl">{r.name}</h3>
              <Badge tone="pass">完整</Badge>
            </div>
            <p className="mt-2 font-mono text-sm text-forest">{r.formula}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.explain}</p>
            <p className="mt-2 text-xs text-muted">{r.nameEn}</p>
          </li>
        ))}
      </ol>
    </Shell>
  );
}
