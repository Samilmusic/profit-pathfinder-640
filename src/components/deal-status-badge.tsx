import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type DealStatus =
  | "open" | "waiting_payment" | "partially_paid" | "waiting_receipt"
  | "ready_to_close" | "closed" | "cancelled";

const META: Record<DealStatus, { label: string; cls: string }> = {
  open:            { label: "Open Deal",          cls: "bg-sky-100 text-sky-900 border-sky-200" },
  waiting_payment: { label: "Waiting for Payment", cls: "bg-amber-100 text-amber-900 border-amber-200" },
  partially_paid:  { label: "Partially Paid",      cls: "bg-amber-100 text-amber-900 border-amber-200" },
  waiting_receipt: { label: "Waiting for Receipt", cls: "bg-amber-100 text-amber-900 border-amber-200" },
  ready_to_close:  { label: "Ready to Close",      cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  closed:          { label: "Closed",              cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled:       { label: "Cancelled",           cls: "bg-muted text-muted-foreground border-border" },
};

export function DealStatusBadge({ value }: { value?: string | null }) {
  const key = (value ?? "open") as DealStatus;
  const m = META[key] ?? META.open;
  return (
    <Badge variant="outline" className={cn("font-normal whitespace-nowrap", m.cls)}>
      {m.label}
    </Badge>
  );
}

export function dealStatusLabel(v?: string | null) {
  return META[(v ?? "open") as DealStatus]?.label ?? "Open Deal";
}