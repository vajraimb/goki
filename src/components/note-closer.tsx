import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { scoreCloserLive } from "@/lib/goki/closer-engine";
import { useCloserNotes } from "@/lib/goki/closer-store";
import { compactP, pct, wan } from "@/lib/goki/format";
import { EMPTY_NOTES } from "@/lib/goki/note-rules";
import {
  noteFieldsFor,
  noteRulesFor,
  packOf,
  plugPackTruncation,
} from "@/lib/goki/packs";
import type { CloserScore, Issuer } from "@/lib/goki/types";
import { PACK_LABEL } from "@/lib/goki/types";

export function NoteCloser({ issuer }: { issuer: Issuer }) {
  const overlay = useCloserNotes((s) => s.byId[issuer.id]);
  const setField = useCloserNotes((s) => s.setField);
  const setAll = useCloserNotes((s) => s.setAll);
  const clear = useCloserNotes((s) => s.clear);
  const pack = packOf(issuer);
  const defs = noteRulesFor(pack);
  const [open, setOpen] = useState<string | null>(
    pack === "bank" ? "b1" : pack === "realty" ? "p1" : pack === "energy" ? "e1" : pack === "exchange" ? "x1" : pack === "telco" ? "c1" : pack === "platform" ? "t3" : "n0",
  );
  const [scored, setScored] = useState<CloserScore | null>(null);
  const [truncatedMax, setTruncatedMax] = useState(0);

  useEffect(() => {
    const live = scoreCloserLive(issuer, overlay);
    setScored(live);
    setTruncatedMax(scoreCloserLive({ ...issuer, currNotes: EMPTY_NOTES }).maxRel);
  }, [issuer, overlay]);

  if (!scored) {
    return (
      <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl">附注闭合</h2>
        <p className="mt-2 text-sm text-ink-soft">正在编译闭合头…</p>
      </section>
    );
  }

  const fields = noteFieldsFor(pack);

  return (
    <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">{pack === "generic" ? "附注闭合" : `${PACK_LABEL[pack]}附注闭合`}</h2>
        <div className="flex flex-wrap gap-2">
          {pack !== "generic" && <Badge tone="forest">{PACK_LABEL[pack]}包</Badge>}
          <Badge tone={scored.band === "exception" ? "exception" : scored.band === "review" ? "review" : "pass"}>
            {scored.band === "exception" ? "未闭合" : scored.band === "review" ? "复核" : "已闭合"}
          </Badge>
          <Badge>p(开口) {compactP(scored.pOpen)}</Badge>
        </div>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {pack === "bank"
          ? `截断式最大残差 ${pct(truncatedMax, 1)}。填进 ECL、贷款总额、存款之后，B01/B02 应收口。贷存比和覆盖率是分析性，不开口。`
          : `截断式最大残差 ${pct(truncatedMax, 1)}。不再把缺口记入其他权益/处置/汇兑。闭合头 p(开口) 是咨询，不进门禁。`}
      </p>

      <ol className="mt-3 divide-y divide-rule">
        {scored.rules.map((r) => {
          const def = defs.find((d) => d.id === r.ruleId);
          if (!def) return null;
          const hot = !r.skipped && def.kind === "identity" && Math.abs(r.rel) >= 0.05;
          const warm = !r.skipped && Math.abs(r.rel) >= 0.01;
          const expanded = open === def.id;
          const groupFields = fields.filter((f) => f.group === def.id);
          return (
            <li key={def.id} className="py-2.5 first:pt-0 last:pb-0">
              <button
                type="button"
                className="flex w-full min-h-11 items-baseline justify-between gap-3 text-left"
                onClick={() => setOpen(expanded ? null : def.id)}
              >
                <p className="text-sm">
                  <span className="font-mono text-xs text-muted">{def.code}</span> {def.name}{" "}
                  <span className="text-xs text-muted">
                    {r.skipped ? "不适用" : def.kind === "analytic" ? "分析" : "恒等"}
                  </span>
                </p>
                <p
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    r.skipped ? "text-muted" : hot ? "text-exception" : warm ? "text-review" : "text-muted",
                  )}
                >
                  {r.skipped ? "—" : pct(r.rel, 2)}
                </p>
              </button>
              <p className="mt-0.5 font-mono text-xs break-all text-muted">{def.formula}</p>
              {!r.skipped && (
                <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-soft">
                  残差 {wan(r.residual, 1)}
                </p>
              )}
              {expanded && groupFields.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {groupFields.map((f) => (
                    <label key={f.key} className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs text-muted">{f.label}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={Number.isFinite(scored.notes[f.key]) ? scored.notes[f.key] : 0}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setField(issuer.id, f.key, Number.isFinite(v) ? v : 0);
                        }}
                        className="h-11 min-w-0 rounded-md bg-paper px-2 font-mono text-sm tabular-nums text-ink shadow-[var(--shadow-border)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                      />
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => {
            const plugged = plugPackTruncation(issuer, {
              ...EMPTY_NOTES,
              ...issuer.currNotes,
              ...overlay,
            });
            setAll(issuer.id, plugged);
          }}
        >
          {pack === "bank" ? "把缺口记入汇兑/其他" : "把截断缺口记入附注"}
        </Button>
        <Button variant="ghost" size="sm" className="w-full sm:w-auto" onClick={() => clear(issuer.id)}>
          清空附注
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        {pack === "bank"
          ? "「记入」把权益缺口写入其他权益、ECL 缺口写入汇兑/其他、贷款总额写成净额+准备。这是闭合演示，不是年报原数。"
          : "「记入附注」把 R03/R07/R02 的缺口分别写入其他权益、处置或在建、现金汇兑。这是闭合演示，不是年报原数。"}
      </p>
    </section>
  );
}
