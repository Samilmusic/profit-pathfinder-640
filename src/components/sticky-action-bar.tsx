import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sticky bottom action bar.
 * - Inside a scroll container (e.g. DialogContent) it sticks to the bottom.
 * - On mobile, respects iOS safe-area inset.
 * - Buttons stack full-width on phones, inline on md+.
 */
export function StickyActionBar({
  children, className, align = "end",
}: {
  children: ReactNode;
  className?: string;
  align?: "end" | "between" | "center";
}) {
  const justify =
    align === "between" ? "sm:justify-between"
    : align === "center" ? "sm:justify-center"
    : "sm:justify-end";
  return (
    <div
      className={cn(
        "sticky bottom-0 left-0 right-0 z-20 -mx-4 sm:-mx-6",
        "bg-card/90 backdrop-blur-md border-t",
        "px-4 sm:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3",
        "flex flex-col gap-2 sm:flex-row sm:items-center",
        "[&>button]:w-full sm:[&>button]:w-auto",
        justify,
        className,
      )}
    >
      {children}
    </div>
  );
}