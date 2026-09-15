import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { useEngagement } from "@/lib/goki/engagement-context";
import { OCAMLL_FILES } from "@/lib/goki/ocannl-source";

export const Route = createFileRoute("/lab")({ component: LabPage });

function LabPage() {
  const eng = useEngagement();
  const [src, setSrc] = useState(0);
  const m = eng.metrics;

  return (
    <Shell>
      <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">
        OCANNL lab · {eng.backend}
      </p>
      <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">可复核的训练</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        工作底稿只跑港股实报。下面的曲线来自合成语料上的 cc 复刻，用来固定种子和黄金文件，不进队列。与{" "}
        <span className="font-mono">ocaml/bin/goki.ml</span> 同一套结构。
        <a href="/goki-model-note.pdf" className="ml-1 text-forest underline underline-offset-2">
          模型说明 PDF
        </a>
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Paradigm
          n="A"
          title="规则残差 + 小模型排序"
          body="十条勾稽算出残差、占比、同比，MLP 预测“真错误 vs 可解释舍入/重分类”。模型只做 triage。"
        />
        <Paradigm
          n="B"
          title="自编码器异常"
          body="整张报表压缩重建。重建误差大、但说不上哪条规则 violated 的样本送人工。"
        />
        <Paradigm
          n="C"
          title="直接回归"
          body="用其余科目回归货币资金 / 资产。残差超阈值即标记。可解释性最好。"
        />
        <Paradigm
          n="D"
          title="行业闭合头 + 估计头"
          body="六个 16→32→16→1 闭合头，外加 Pack-Net 和 ECL/公允估计。合成样本上训，港股底稿上填。"
        />
      </div>

      <section className="mt-8 rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">训练曲线</h2>
          <Badge>
            {m.paramCount} params · {Math.round(m.trainMs)} ms
          </Badge>
        </div>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={eng.logs} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-rule)" strokeDasharray="3 3" />
              <XAxis dataKey="epoch" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} width={40} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-paper)",
                  border: "1px solid var(--color-rule)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="trainBce" name="train BCE" stroke="var(--color-forest)" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="valBce" name="val BCE" stroke="var(--color-exception)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
          <Stat k="test AUC" v={m.testAuc.toFixed(4)} />
          <Stat k="test AP" v={m.testAp.toFixed(4)} />
          <Stat k="precision" v={m.precision.toFixed(3)} />
          <Stat k="recall" v={m.recall.toFixed(3)} />
        </dl>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg bg-ink p-4 text-forest-fg shadow-[var(--shadow-border)]">
          <h2 className="font-display text-xl text-paper">Compiled routine</h2>
          <p className="mt-1 text-xs text-forest-fg/60">.cd → .ll → .c · packed FMA</p>
          <pre className="mt-3 max-h-80 overflow-auto font-mono text-xs leading-relaxed text-forest-fg/85">
            {eng.routine}
          </pre>
        </section>
        <section className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
          <h2 className="font-display text-xl">goki_mlp.expected</h2>
          <p className="mt-1 text-xs text-muted">黄金文件记录边界，不记录不可移植的尾数。</p>
          <pre className="mt-3 max-h-80 overflow-auto font-mono text-xs leading-relaxed text-ink-soft">
            {eng.golden}
          </pre>
        </section>
      </div>

      <section className="mt-6 rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-xl">OCaml source of record</h2>
        <div className="mt-3 flex flex-wrap gap-1">
          {OCAMLL_FILES.map((f, i) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSrc(i)}
              className={cn(
                "h-11 rounded-sm px-3 font-mono text-xs",
                src === i ? "bg-forest text-forest-fg" : "bg-paper text-ink-soft",
              )}
            >
              {f.path}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-soft">{OCAMLL_FILES[src]?.title}</p>
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-ink p-4 font-mono text-xs leading-relaxed text-forest-fg/90">
          {OCAMLL_FILES[src]?.body}
        </pre>
      </section>
    </Shell>
  );
}

function Paradigm({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <article className="rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-xs text-muted">Paradigm {n}</p>
      <h3 className="mt-1 font-display text-xl">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
    </article>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <dt className="text-muted">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
