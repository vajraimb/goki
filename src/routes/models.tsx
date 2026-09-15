import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { checksumShort, compactP, pct } from "@/lib/goki/format";
import { buildHkIssuers } from "@/lib/goki/hk-bluechips";
import { ensureAllModels, estimatesFor, type ModelCard } from "@/lib/goki/models";
import { packOf, PACK_LABEL } from "@/lib/goki/packs";
import type { EstimateScore, PackGuess } from "@/lib/goki/types";

export const Route = createFileRoute("/models")({ component: ModelsPage });

function ModelsPage() {
  const [cards, setCards] = useState<ModelCard[] | null>(null);
  const [rows, setRows] = useState<
    { id: string; ticker: string; name: string; pack: string; guess: PackGuess; ecl: EstimateScore | null; fv: EstimateScore | null }[] | null
  >(null);

  useEffect(() => {
    const cat = ensureAllModels();
    setCards(cat.cards);
    const issuers = buildHkIssuers();
    setRows(
      issuers.map((iss) => {
        const e = estimatesFor(iss);
        return {
          id: iss.id,
          ticker: iss.ticker,
          name: iss.name,
          pack: PACK_LABEL[packOf(iss)],
          guess: e.pack,
          ecl: e.ecl,
          fv: e.fv,
        };
      }),
    );
  }, []);

  if (!cards || !rows) {
    return (
      <Shell>
        <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Small models</p>
        <h1 className="mt-1 font-display text-4xl tracking-tight">六个小模型</h1>
        <p className="mt-3 text-sm text-ink-soft">正在编译 Pack-Net、六行业闭合头、ECL 与公允估计头…</p>
      </Shell>
    );
  }

  const nMatch = rows.filter((r) => r.guess.match).length;

  return (
    <Shell>
      <div className="flex flex-col gap-8">
        <div>
          <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
            Work chain · OCANNL cc replica
          </p>
          <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">小模型工作链</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
            年报审核拆成四个环节，每个环节一个能独立训练的小网络。合成语料上固定种子，港股实报上只做推断。模型不读 PDF。
          </p>
        </div>

        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1 取包", "Pack-Net 看结构比率，决定银行/地产/能源/平台/交易所/通用。"],
            ["2 主表", "十条勾稽。行业包关掉不适用的恒等。"],
            ["3 附注", "对应行业的闭合头，16 维残差 → 开口概率。"],
            ["4 估计", "银行质疑 ECL 覆盖率，地产质疑投资物业公允。"],
          ].map(([t, b]) => (
            <li key={t} className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
              <p className="font-display text-lg">{t}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{b}</p>
            </li>
          ))}
        </ol>

        <section>
          <h2 className="font-display text-2xl">模型卡</h2>
          <div className="mt-3 grid gap-3">
            {cards.map((c) => (
              <article key={c.id} className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-muted">{c.nameEn}</p>
                    <h3 className="font-display text-2xl">{c.name}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="forest">{c.arch}</Badge>
                    <Badge>{c.params} params</Badge>
                    <Badge tone="pass">
                      {c.metricLabel} {c.metricLabel.includes("acc") ? pct(c.metric, 1) : compactP(c.metric)}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.role}</p>
                <p className="mt-2 font-mono text-xs text-muted">
                  {c.ocaml} · checksum {checksumShort(c.checksum)} · {Math.round(c.trainMs)} ms
                </p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl">打在十一条实报上</h2>
            <Badge tone={nMatch === rows.length ? "pass" : "review"}>
              Pack-Net 与指定包一致 {nMatch}/{rows.length}
            </Badge>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg bg-paper-2 shadow-[var(--shadow-border)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-rule text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">发行人</th>
                    <th className="px-3 py-2 font-medium">指定包</th>
                    <th className="px-3 py-2 font-medium">Pack-Net</th>
                    <th className="px-3 py-2 text-right font-medium">ECL p</th>
                    <th className="px-3 py-2 text-right font-medium">公允 p</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-rule/70 last:border-0">
                      <td className="px-3 py-2.5">
                        <Link to="/issuer/$id" params={{ id: r.id }} className="font-medium hover:text-forest">
                          {r.name}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-muted">{r.ticker}</span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">{r.pack}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn(r.guess.match ? "text-pass" : "text-review")}>
                          {PACK_LABEL[r.guess.pack]}
                        </span>
                        <span className="ml-1 font-mono text-xs text-muted">
                          {pct(r.guess.probs[r.guess.pack], 0)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {r.ecl ? compactP(r.ecl.pOutlier) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {r.fv ? compactP(r.fv.pOutlier) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
