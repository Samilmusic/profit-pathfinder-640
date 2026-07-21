import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Friendly, consistent empty state for tables/lists.
 * Replaces bare "No rows" placeholders across the portal.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondaryAction,
  docsHref,
  docsLabel,
  className,
  compact,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  docsHref?: string;
  docsLabel?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center rounded-xl border border-dashed bg-muted/20",
        compact ? "py-6 px-4" : "py-10 px-6",
        className,
      )}
      role="status"
    >
      {Icon && (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-background border">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="font-medium">{title}</div>
      {body && <div className="mt-1 text-xs text-muted-foreground max-w-sm">{body}</div>}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
          {action}
          {secondaryAction}
        </div>
      )}
      {docsHref && (
        <a
          href={docsHref}
          target="_blank"
          rel="noreferrer"
          className="mt-3 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {docsLabel ?? "Learn more"}
        </a>
      )}
    </div>
  );
}