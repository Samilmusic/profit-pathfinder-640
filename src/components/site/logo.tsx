import { cn } from "@/lib/utils";

/** Typographic wordmark: AL NOKHBA / TRADING with a fine gold rule. */
export function Wordmark({ light, className }: { light?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <svg viewBox="0 0 40 40" aria-hidden className="size-9 shrink-0">
        <rect
          x="0.75"
          y="0.75"
          width="38.5"
          height="38.5"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.5"
          className={light ? "text-white" : "text-navy"}
        />
        <path
          d="M11 29 L20 10 L29 29"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="miter"
          className={light ? "text-white" : "text-navy"}
        />
        <path d="M14.5 23 H25.5" stroke="var(--site-gold)" strokeWidth="2.2" />
      </svg>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-[family-name:var(--font-display)] text-[1.05rem] font-bold tracking-[0.14em]",
            light ? "text-white" : "text-navy",
          )}
        >
          AL NOKHBA
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span aria-hidden className="h-px w-4 bg-gold" />
          <span
            className={cn(
              "text-[0.62rem] font-semibold tracking-[0.42em]",
              light ? "text-white/70" : "text-slate-ink",
            )}
          >
            TRADING
          </span>
        </span>
      </span>
    </span>
  );
}
