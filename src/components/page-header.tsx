import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground break-words">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && (
        <div className="flex gap-2 flex-wrap sm:justify-end sm:max-w-[65%] [&>*]:min-w-0">
          {actions}
        </div>
      )}
    </div>
  );
}