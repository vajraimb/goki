import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/workshop")({ component: WorkshopPage });

const TOOLS = [
  {
    to: "/queue" as const,
    title: "队列",
    note: "十一条蓝筹的门禁一览。对照用，不是发刊台。",
  },
  {
    to: "/map" as const,
    title: "映射",
    note: "科目映射与冲突。董秘不在这里改数，财务在这里补槽。",
  },
  {
    to: "/closer" as const,
    title: "闭合",
    note: "残差闭合实验。不写塞子。闭合了才能回到发刊台重跑。",
  },
  {
    to: "/work" as const,
    title: "底稿",
    note: "冻结规则配置与映射。编制和复核必须两个人。",
  },
  {
    to: "/program" as const,
    title: "程序",
    note: "年报核验程序文本、轨迹和人签点。发刊台只跑它，不展示源码。",
  },
  {
    to: "/rules" as const,
    title: "规则",
    note: "硬恒等与规则包。方法论变更从这里出新版本，不按发行人分叉。",
  },
  {
    to: "/models" as const,
    title: "模型",
    note: "小模型目录。咨询带，不进阻断，不决定能不能发。",
  },
  {
    to: "/lab" as const,
    title: "实验室",
    note: "引擎与特征实验。发刊当晚不要打开。",
  },
];

function WorkshopPage() {
  return (
    <Shell>
      <p className="font-mono text-xs tracking-[0.18em] text-muted uppercase">Workshop</p>
      <h1 className="mt-1 font-display text-4xl tracking-tight sm:text-5xl">工坊</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        映射、规则、程序和模型留在这里。发刊台给公司秘书；工坊给编制和引擎。同一套门禁，两套界面。
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <li key={t.to}>
            <Link
              to={t.to}
              className="block rounded-lg bg-paper-2 p-4 shadow-[var(--shadow-border)] transition-colors duration-150 hover:bg-paper-3"
            >
              <h2 className="font-display text-2xl">{t.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t.note}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
