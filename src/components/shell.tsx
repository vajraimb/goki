import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { useDesk } from "@/lib/goki/desk-store";

const DESK = [
  { to: "/", label: "年报" },
  { to: "/esg", label: "ESG" },
] as const;

const SHOP = [
  { to: "/queue", label: "队列" },
  { to: "/workshop", label: "工坊" },
  { to: "/work", label: "底稿" },
  { to: "/train", label: "训练" },
  { to: "/program", label: "程序" },
] as const;

function tickerFromSearch(search: unknown): string | undefined {
  if (search && typeof search === "object" && "ticker" in search) {
    const t = (search as { ticker?: unknown }).ticker;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return undefined;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const storeTicker = useDesk((s) => s.ticker);
  const setTicker = useDesk((s) => s.setTicker);
  const ticker = tickerFromSearch(location.search) ?? storeTicker;

  useEffect(() => {
    const fromUrl = tickerFromSearch(location.search);
    if (fromUrl && fromUrl !== storeTicker) setTicker(fromUrl);
  }, [location.search, storeTicker, setTicker]);

  const deskSearch = ticker ? { ticker } : undefined;

  return (
    <div className="min-h-screen min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-forest-2 bg-forest text-forest-fg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" search={deskSearch} className="flex min-w-0 items-center gap-3">
            <span className="font-display text-2xl leading-none tracking-tight text-paper">GOKI</span>
            <span className="hidden truncate font-sans text-xs text-forest-fg/70 sm:block">披露核验</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {DESK.map((item) => {
              const on = item.to === "/" ? pathname === "/" : pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  search={deskSearch}
                  className={cn(
                    "flex h-11 shrink-0 items-center rounded-sm px-2 text-sm transition-colors duration-150 sm:px-3",
                    on ? "bg-forest-2 text-paper" : "text-forest-fg/75 hover:text-paper",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {SHOP.map((item) => {
              const active =
                item.to === "/workshop"
                  ? pathname === "/workshop" ||
                    pathname === "/closer" ||
                    pathname === "/map" ||
                    pathname === "/models" ||
                    pathname === "/rules" ||
                    pathname === "/lab"
                  : item.to === "/queue"
                    ? pathname === "/queue" || pathname.startsWith("/issuer/")
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
          披露核验底稿 · 不构成鉴证或可持续鉴证意见。年报看硬恒等；ESG 看文件与目录映射。小模型不进阻断。
        </p>
      </footer>
    </div>
  );
}
