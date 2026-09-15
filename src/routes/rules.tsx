import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { PACK_SPECS } from "@/lib/goki/pack-defs";
import { RULES } from "@/lib/goki/rules";
import { PACK_LABEL, RULE_PACKS } from "@/lib/goki/types";

export const Route = createFileRoute("/rules")({ component: RulesPage });

function RulesPage() {
  return (
    <Shell>
      <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Rule book</p>
      <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">勾稽规则</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        主表十条所有发行人共用，行业包关掉不适用的。附注八条按包换槽：银行 ECL、地产投资物业、能源弃置、交易所保证金、平台回购。
      </p>

      <h2 className="mt-8 font-display text-2xl">主表（通用）</h2>
      <ol className="mt-3 grid gap-3">
        {RULES.map((r) => (
          <li key={r.id} className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] sm:p-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-muted">{r.code}</span>
              <h2 className="font-display text-2xl">{r.name}</h2>
              <Badge tone={r.kind === "identity" ? "forest" : "mute"}>
                {r.kind === "identity" ? "恒等" : "分析性"}
              </Badge>
              <Badge tone={r.strict ? "pass" : "review"}>{r.strict ? "硬" : "口径"}</Badge>
            </div>
            <p className="mt-2 font-mono text-sm text-forest">{r.formula}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.explain}</p>
          </li>
        ))}
      </ol>

      {RULE_PACKS.filter((p) => p !== "generic").map((pack) => {
        const spec = PACK_SPECS[pack];
        const skipped = Object.keys(spec.skipMain);
        return (
          <section key={pack} className="mt-10">
            <aside className="rounded-lg bg-forest px-4 py-3 text-sm text-forest-fg">
              <p className="font-medium">{PACK_LABEL[pack]}包</p>
              <p className="mt-1 text-forest-fg/80">
                {skipped.length > 0
                  ? `关掉 ${skipped.map((id) => RULES.find((r) => r.id === id)?.code).join(" / ")}。`
                  : "主表全开。"}
              </p>
            </aside>
            <h2 className="mt-6 font-display text-2xl">{PACK_LABEL[pack]}附注</h2>
            <ol className="mt-3 grid gap-3">
              {spec.noteRules.map((r) => (
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
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      <h2 className="mt-10 font-display text-2xl">附注闭合（通用）</h2>
      <ol className="mt-3 grid gap-3">
        {PACK_SPECS.generic.noteRules.map((r) => (
          <li key={r.id} className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] sm:p-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-muted">{r.code}</span>
              <h3 className="font-display text-2xl">{r.name}</h3>
              <Badge tone="pass">完整</Badge>
            </div>
            <p className="mt-2 font-mono text-sm text-forest">{r.formula}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.explain}</p>
          </li>
        ))}
      </ol>
    </Shell>
  );
}
