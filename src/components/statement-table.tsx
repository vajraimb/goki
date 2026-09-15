import { wan } from "@/lib/goki/format";
import type { Line } from "@/lib/goki/lines";
import type { YearBooks } from "@/lib/goki/types";
import { cn } from "@/lib/cn";

export function StatementTable({
  title,
  lines,
  curr,
  prior,
  unit = "单位：万元",
}: {
  title: string;
  lines: Line[];
  curr: YearBooks;
  prior: YearBooks;
  unit?: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-paper-2 shadow-[var(--shadow-border)]">
      <header className="flex items-baseline justify-between border-b border-rule px-4 py-3">
        <h3 className="font-display text-xl text-ink">{title}</h3>
        <p className="font-mono text-xs tracking-wider text-muted uppercase">{unit}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-sm sm:min-w-[28rem]">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">科目</th>
              <th className="px-4 py-2 text-right font-medium">本年</th>
              <th className="px-4 py-2 text-right font-medium">上年</th>
              <th className="px-4 py-2 text-right font-medium">变动</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const a = curr[line.key];
              const b = prior[line.key];
              const d = a - b;
              return (
                <tr
                  key={line.key}
                  className={cn(
                    "border-b border-rule/70 last:border-0",
                    line.total && "bg-paper-3/60 font-medium",
                  )}
                >
                  <td className="px-4 py-2">{line.label}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{wan(a)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-muted">
                    {wan(b)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-mono tabular-nums",
                      d > 0 ? "text-pass" : d < 0 ? "text-exception" : "text-muted",
                    )}
                  >
                    {d === 0 ? "—" : wan(d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
