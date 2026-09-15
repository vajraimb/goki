export function CompileSplash() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink px-6 text-forest-fg">
      <p className="font-mono text-xs tracking-[0.22em] text-forest-fg/55 uppercase">
        OCANNL · cc backend
      </p>
      <h1 className="mt-5 font-display text-6xl tracking-tight text-paper">GOKI</h1>
      <p className="mt-2 font-sans text-sm text-forest-fg/70">勾稽底稿 · compiling goki_mlp</p>
      <ol className="mt-10 space-y-1.5 font-mono text-xs text-forest-fg/55">
        <li className="animate-[goki-fade-up_0.5s_ease_both]">.cd → .ll → .c</li>
        <li className="animate-[goki-fade-up_0.5s_ease_both] [animation-delay:120ms]">
          fixed_state_for_init = 3
        </li>
        <li className="animate-[goki-fade-up_0.5s_ease_both] [animation-delay:240ms]">
          38 → 64 → 32 → 1 · BCE-with-logits
        </li>
        <li className="animate-[goki-fade-up_0.5s_ease_both] [animation-delay:360ms]">
          1,000 issuers · 80/10/10
        </li>
      </ol>
    </div>
  );
}
