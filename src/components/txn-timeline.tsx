import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RefType } from "@/components/documents-panel";
import { CheckCircle2, Circle, Clock, FileText, Package, PenSquare, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const MONEY_DOC_TYPES = ["payment_receipt", "bank_transfer_screenshot", "cash_delivery_receipt", "whatsapp_confirmation"];
const DELIVERY_DOC_TYPES = ["currency_handover_proof", "cash_delivery_receipt", "bank_transfer_screenshot"];

type Event = { icon: any; label: string; at: string | null; done: boolean };

export function TxnTimeline({ refType, row }: { refType: RefType; row: any }) {
  const refId = row?.id as string | undefined;
  const docsQ = useQuery({
    queryKey: ["documents", refType, refId],
    enabled: !!refId,
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("ref_type", refType).eq("ref_id", refId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const auditQ = useQuery({
    queryKey: ["audit", refType, refId],
    enabled: !!refId,
    queryFn: async () => {
      const { data } = await supabase.from("audit_logs").select("*").eq("record_id", refId!).order("created_at");
      return data ?? [];
    },
  });

  if (!row) return null;
  const docs = docsQ.data ?? [];
  const firstOf = (types: string[]) => docs.find((d: any) => types.includes(d.doc_type));
  const moneyDoc = firstOf(MONEY_DOC_TYPES);
  const deliveryDoc = firstOf(DELIVERY_DOC_TYPES);
  const status = row.settlement_status as string | undefined;

  const events: Event[] = [
    { icon: PenSquare, label: "Created", at: row.created_at ?? null, done: true },
    {
      icon: Wallet,
      label: "Money received / payment proof",
      at: moneyDoc?.created_at ?? null,
      done: !!moneyDoc || status === "payment_received" || status === "completed",
    },
    {
      icon: Package,
      label: "Currency delivered",
      at: deliveryDoc?.created_at ?? null,
      done: !!deliveryDoc || status === "currency_delivered" || status === "completed",
    },
    {
      icon: FileText,
      label: `Receipts uploaded (${docs.length})`,
      at: docs[docs.length - 1]?.created_at ?? null,
      done: docs.length > 0,
    },
    {
      icon: CheckCircle2,
      label: "Completed",
      at: status === "completed" ? row.updated_at ?? null : null,
      done: status === "completed",
    },
  ];

  return (
    <div className="rounded-lg border p-3 bg-secondary/30">
      <div className="text-sm font-medium mb-2 flex items-center gap-2"><Clock className="h-4 w-4" /> Timeline</div>
      <ol className="space-y-2">
        {events.map((e, i) => {
          const Icon = e.done ? e.icon : Circle;
          return (
            <li key={i} className="flex items-start gap-3 text-sm">
              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", e.done ? "text-emerald-600" : "text-muted-foreground")} />
              <div className="flex-1 min-w-0">
                <div className={cn(e.done ? "text-foreground" : "text-muted-foreground")}>{e.label}</div>
                {e.at && <div className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</div>}
              </div>
            </li>
          );
        })}
        {(auditQ.data ?? []).slice(-5).map((a: any) => (
          <li key={a.id} className="flex items-start gap-3 text-xs text-muted-foreground pl-7">
            <span>· {a.action}</span>
            <span>{new Date(a.created_at).toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}