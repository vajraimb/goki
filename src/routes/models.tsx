import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { checksumShort, compactP, pct } from "@/lib/goki/format";
import { buildHkIssuers } from "@/lib/goki/hk-bluechips";
import { liveIssuers, useMapIntake } from "@/lib/goki/map-intake";
import { ensureAllModels, estimatesFor, type ModelCard } from "@/lib/goki/models";
import { packOf, PACK_LABEL } from "@/lib/goki/packs";
import type { CompletenessScore, EstimateScore, PackGuess } from "@/lib/goki/types";

export const Route = createFileRoute("/models")({ component: ModelsPage });

function ModelsPage() {
  const writes = useMapIntake((s) => s.writes);
  const [cards, setCards] = useState<ModelCard[] | null>(null);
  const [rows, setRows] = useState<
    {
      id: string;
      ticker: string;
      name: string;
      pack: string;
      guess: PackGuess;
      ecl: EstimateScore | null;
      fv: EstimateScore | null;
      dda: EstimateScore | null;
      buyback: EstimateScore | null;
      complete: CompletenessScore;
    }[] | null
  >(null);

  useEffect(() => {
    const cat = ensureAllModels();
    setCards(cat.cards);
    const issuers = liveIssuers(buildHkIssuers());
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
          dda: e.dda,
          buyback: e.buyback,
          complete: e.complete,
        };
      }),
    );
  }, [writes]);

  if (!cards || !rows) {
    return (
      <Shell>
        <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Small models</p>
        <h1 className="mt-1 font-display text-4xl tracking-tight">小模型工作链</h1>
        <p className="mt-3 text-sm text-ink-soft">正在编译 Map-Net、Pack-Net、七行业闭合头、Completeness-Net、ECL 与公允估计头…</p>
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
            年报审核拆成六个环节。每个小网络独立训练，合成语料固定种子，港股实报只做推断。模型不读年报
            PDF。下面是工作链图，也可
            <a href="/goki-work-chain.pdf" className="mx-1 text-forest underline underline-offset-2">
              打开 PDF
            </a>
            或去
            <Link to="/map" className="ml-1 text-forest underline underline-offset-2">
              科目映射
            </Link>
            。
          </p>
        </div>

        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["1 取数", "Map-Net 映射行名。整表贴入，单位网把千元/亿换成百万再写入。"],
            ["2 取包", "Pack-Net 看结构比率，决定银行/地产/能源/平台/电信/交易所/通用。"],
            ["3 主表", "十条勾稽。行业包关掉不适用的恒等。"],
            ["4 附注", "对应行业的闭合头。电信勾网络资产、频谱、合同负债。"],
            ["5 完备", "Completeness-Net 看漏填。空且恒等仍闭合的不当漏填。"],
            ["6 估计", "银行 ECL、地产公允、能源/电信折耗、平台回购/股份支付/递延。"],
          ].map(([t, b]) => (
            <li key={t} className="rounded-lg bg-paper-2 px-4 py-3 shadow-[var(--shadow-border)]">
              <p className="font-display text-lg">{t}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{b}</p>
            </li>
          ))}
        </ol>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl">工作链图</h2>
            <a
              href="/goki-work-chain.pdf"
              className="font-mono text-xs text-forest underline underline-offset-2"
            >
              下载五页 PDF
            </a>
          </div>
          <p className="mt-1 text-xs text-ink-soft">横版五页。手机上看字偏小，可打开 PDF。</p>
          <ol className="mt-3 grid gap-3">
            {[
              ["p1.png", "总图 · 取数到估计"],
              ["p2.png", "取数 Map-Net · 取包 Pack-Net"],
              ["p3.png", "主表十条 · 行业跳过"],
              ["p4.png", "行业闭合头"],
              ["p5.png", "完备、估计、数字怎么进来"],
            ].map(([file, cap], i) => (
              <li key={file} className="overflow-hidden rounded-lg bg-paper-2 shadow-[var(--shadow-border)]">
                <img src={`/work-chain/${file}`} alt={cap} className="block h-auto w-full" />
                <p className="px-3 py-2 font-mono text-xs text-muted">
                  {i + 1} / 5　{cap}
                </p>
              </li>
            ))}
          </ol>
        </section>

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
              <table className="w-full min-w-[56rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-rule text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">发行人</th>
                    <th className="px-3 py-2 font-medium">指定包</th>
                    <th className="px-3 py-2 font-medium">Pack-Net</th>
                    <th className="px-3 py-2 font-medium">完备</th>
                    <th className="px-3 py-2 text-right font-medium">ECL p</th>
                    <th className="px-3 py-2 text-right font-medium">公允 p</th>
                    <th className="px-3 py-2 text-right font-medium">折耗 p</th>
                    <th className="px-3 py-2 text-right font-medium">回购 p</th>
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
                      <td className="px-3 py-2.5">
                        {r.complete.missing.length === 0 ? (
                          <span className="text-pass">齐</span>
                        ) : (
                          <span className={r.complete.band === "exception" ? "text-exception" : "text-review"}>
                            {r.complete.missing.map((h) => h.label).join("、")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {r.ecl ? compactP(r.ecl.pOutlier) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {r.fv ? compactP(r.fv.pOutlier) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {r.dda ? compactP(r.dda.pOutlier) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {r.buyback ? compactP(r.buyback.pOutlier) : "—"}
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
