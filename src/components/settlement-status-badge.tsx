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

type Tone = "success" | "warning" | "info" | "danger" | "muted";
const toneCls: Record<Tone, string> = {
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warning: "bg-amber-100 text-amber-900 border-amber-200",
  info: "bg-sky-100 text-sky-900 border-sky-200",
  danger: "bg-rose-100 text-rose-900 border-rose-200",
  muted: "bg-muted text-muted-foreground border-border",
};

export function SmartPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <Badge variant="outline" className={cn("font-normal whitespace-nowrap", toneCls[tone])}>{children}</Badge>;
}

/**
 * Derive human-friendly pills from a transaction row.
 * Works for buy/sell rows; ignores fields that are absent.
 */
export function smartLabelsFor(row: any): { tone: Tone; label: string }[] {
  if (!row) return [];
  const s = row.settlement_status as string | undefined;
  const out: { tone: Tone; label: string }[] = [];
  if (s === "completed") {
    out.push({ tone: "success", label: "Completed" });
  } else if (s === "cancelled") {
    out.push({ tone: "muted", label: "Cancelled" });
  } else {
    if (!s || s === "draft" || s === "awaiting_payment") out.push({ tone: "warning", label: "Pending payment" });
    if (s === "payment_received" || s === "awaiting_delivery") out.push({ tone: "warning", label: "Pending delivery" });
    if (s === "currency_delivered" || s === "awaiting_receipt") out.push({ tone: "warning", label: "Missing receipt" });
    out.push({ tone: "info", label: "Needs action" });
  }
  const crossCurrency = row.sold_currency && row.received_currency && row.sold_currency !== row.received_currency;
  const gp = crossCurrency ? NaN : Number(row.gross_profit ?? NaN);
  if (crossCurrency) {
    out.push({ tone: "info", label: "Profit pending cycle" });
  }
  if (!Number.isNaN(gp)) {
    if (gp > 0 && s === "completed") out.push({ tone: "success", label: "Profit ready" });
    if (gp < 0) out.push({ tone: "danger", label: "Loss warning" });
  }
  if ((row.money_holder_type && row.money_holder_type !== "customer") ||
      (row.currency_holder_type && row.currency_holder_type !== "customer")) {
    out.push({ tone: "info", label: "Cash with person" });
  }
  return out;
}

export function SmartLabels({ row }: { row: any }) {
  const pills = smartLabelsFor(row);
  if (pills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {pills.map((p, i) => <SmartPill key={i} tone={p.tone}>{p.label}</SmartPill>)}
    </div>
  );
}