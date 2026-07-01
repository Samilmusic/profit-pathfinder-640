import { Badge } from "@/components/ui/badge";
import { SETTLEMENT_STATUSES, statusLabel } from "@/lib/settlement";
import { cn } from "@/lib/utils";

export function SettlementStatusBadge({ value }: { value: string | null | undefined }) {
  const s = SETTLEMENT_STATUSES.find((x) => x.value === value);
  const tone = s?.tone ?? "muted";
  const cls =
    tone === "success"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : tone === "warning"
        ? "bg-amber-100 text-amber-900 border-amber-200"
        : tone === "info"
          ? "bg-sky-100 text-sky-900 border-sky-200"
          : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={cn("font-normal whitespace-nowrap", cls)}>
      {statusLabel(value)}
    </Badge>
  );
}