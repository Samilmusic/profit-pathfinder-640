import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { copyText } from "@/components/copy-button";

/**
 * Inline copyable value.
 * Renders `<value> <copy icon>` in one row.
 * Icon appears on hover on desktop and is always visible on mobile.
 */
export function Copyable({
  value,
  label,
  mono = true,
  className,
  as: Tag = "span",
}: {
  value?: string | number | null;
  label?: string;
  mono?: boolean;
  className?: string;
  as?: "span" | "div";
}) {
  const [done, setDone] = useState(false);
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  const title = label ? `Copy ${label}` : "Copy";
  const handle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await copyText(text, label ? `${label} copied` : "Copied");
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };
  return (
    <Tag className={cn("group inline-flex items-center gap-1 align-middle", className)}>
      <span className={cn(mono && "font-mono tabular-nums", "truncate")}>{text}</span>
      <button
        type="button"
        onClick={handle}
        title={title}
        aria-label={title}
        className="opacity-70 sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 rounded p-0.5 hover:bg-muted"
      >
        {done ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </Tag>
  );
}