import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { RULES } from "@/lib/goki/rules";

export const Route = createFileRoute("/rules")({ component: RulesPage });

function RulesPage() {
  return (
    <Shell>
      <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Rule book</p>
      <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">十条勾稽</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        勾稽检查本质是残差审计。规则本身可计算；模型的价值在排序和解释，不在替代规则。前八条是恒等，后两条是分析性程序。套到港股蓝筹（HKFRS）时，残差首先是口径，其次才可能是错账。
      </p>
      <ol className="mt-8 grid gap-3">
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
    </Shell>
  );
}
