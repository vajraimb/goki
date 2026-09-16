import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/cn";

const NAV = [
  { to: "/", label: "队列" },
  { to: "/closer", label: "闭合" },
  { to: "/map", label: "映射" },
  { to: "/work", label: "底稿" },
  { to: "/models", label: "模型" },
  { to: "/rules", label: "规则" },
  { to: "/lab", label: "实验室" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen min-h-[100dvh] bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-forest-2 bg-forest text-forest-fg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="font-display text-2xl leading-none tracking-tight text-paper">
              GOKI
            </span>
            <span className="hidden truncate font-sans text-xs text-forest-fg/70 sm:block">
              勾稽底稿
            </span>
          </Link>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active =
                item.to === "/"
                  ? pathname === "/" || pathname === "/hk" || pathname.startsWith("/issuer/")
                  : item.to === "/closer"
                    ? pathname === "/closer"
                    : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-11 shrink-0 items-center rounded-sm px-2 text-sm transition-colors duration-150 sm:px-3",
                    active ? "bg-forest-2 text-paper" : "text-forest-fg/75 hover:text-paper",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <div className="mx-auto min-w-0 max-w-6xl px-4 py-6 pb-16 sm:py-8">{children}</div>
      <footer className="border-t border-rule px-4 py-4">
        <p className="mx-auto max-w-6xl text-xs leading-relaxed text-muted">
          工作底稿 · 不构成鉴证意见。门禁只看硬恒等残差与映射缺项；小模型是咨询，不进阻断路径。
        </p>
      </footer>
    </div>
  );
}
