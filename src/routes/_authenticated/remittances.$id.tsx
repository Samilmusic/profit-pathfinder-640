import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt, fmtProfit } from "@/lib/exchange";
import { ArrowLeft, Trash2, CheckCircle2, Circle, Truck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/remittances/$id")({
  component: RemittanceDetailPage,
  head: () => ({ meta: [{ title: "Remittance — Exchange Portal" }] }),
});

const STATUSES = [
  "open","waiting_customer_payment","payment_received","waiting_transfer",
  "transfer_completed","waiting_transfer_proof","ready_to_close","closed","cancelled",
] as const;

function RemittanceDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["remittance", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittances")
        .select("*, customers!remittances_customer_id_fkey(name), third_party:customers!remittances_third_party_customer_id_fkey(name), linked_buy:buy_transactions!remittances_linked_buy_id_fkey(id,doc_no,bought_amount,bought_currency,buy_rate,supplier_delivered,supplier_delivered_at), source:accounts!remittances_source_account_id_fkey(name,currency), payment:accounts!remittances_payment_received_account_id_fkey(name,currency)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("remittances").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const reason = window.prompt("Reason for deletion (required):");
      if (!reason) throw new Error("Reason required");
      const { error } = await supabase.from("remittances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Deleted"); nav({ to: "/remittances" }); },
    onError: (e: any) => { if (e.message !== "Reason required") toast.error(e.message); },
  });

  const recordDelivery = useMutation({
    mutationFn: async () => {
      const buyId = (q.data as any)?.linked_buy?.id;
      if (!buyId) throw new Error("No linked buy");
      const note = window.prompt("Delivery note (optional):") || "";
      const { error } = await supabase.rpc("record_supplier_delivery" as any, { _buy_id: buyId, _note: note });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Supplier delivery recorded — inventory posted."); },
    onError: (e: any) => toast.error(e.message),
  });

  const validationQ = useQuery({
    enabled: !!id,
    queryKey: ["remittance-close-validation", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("validate_third_party_settlement" as any, { _remittance_id: id });
      if (error) return null;
      return data as any;
    },
  });

  const r = q.data;
  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!r) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  const isThirdParty = r.payment_destination === "to_third_party" || r.payment_destination === "settles_linked_buy";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto pb-24">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/remittances"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold font-mono">{r.doc_no}</h1>
          <p className="text-xs text-muted-foreground">Remittance · {r.entry_date}</p>
        </div>
        <Badge variant="secondary">{String(r.status).replace(/_/g, " ")}</Badge>
      </div>

      {/* Summary */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Cell label="Actual Transfer" value={fmt(r.transferred_amount, r.transfer_currency)} />
          <Cell label="Customer Paid" value={fmt(r.customer_payment_amount, r.customer_payment_currency)} />
          <Cell label={`Base Value (${r.customer_payment_currency})`} value={fmt(Number(r.transferred_amount) * Number(r.reference_rate), r.customer_payment_currency)} />
          <Cell label={`Commission (${r.customer_payment_currency})`} value={fmtProfit(r.gross_commission_pay_ccy, r.customer_payment_currency)} className="text-emerald-400 font-semibold" />
          <Cell label="Reference Rate" value={r.reference_rate ? `${Number(r.reference_rate).toLocaleString()} ${r.customer_payment_currency}/${r.transfer_currency}` : "—"} />
          <Cell label="Gross Commission (AED)" value={fmtProfit(r.gross_commission_aed, "AED")} className="text-emerald-400" />
          <Cell label="Linked Expenses (AED)" value={fmt(r.linked_expenses_aed, "AED")} />
          <Cell label="Net Commission (AED)" value={fmtProfit(r.net_commission_aed, "AED")} className="text-emerald-400 font-bold text-base" />
        </CardContent>
      </Card>

      {/* Customer & beneficiary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="p-4 space-y-2 text-sm">
          <div className="font-semibold">Customer</div>
          <Row k="Name" v={r.customers?.name} />
          <Row k="Phone" v={r.customer_phone} />
          <Row k="Reference" v={r.customer_reference} />
          <Row k="Payment received into" v={r.payment ? `${r.payment.name} (${r.payment.currency})` : "—"} />
        </CardContent></Card>
        <Card><CardContent className="p-4 space-y-2 text-sm">
          <div className="font-semibold">Beneficiary</div>
          <Row k="Name" v={r.beneficiary_name} />
          <Row k="Bank" v={r.beneficiary_bank} />
          <Row k="Account" v={r.beneficiary_account_number} />
          <Row k="IBAN" v={r.beneficiary_iban} />
          <Row k="Card" v={r.beneficiary_card_number} />
          <Row k="Country" v={r.beneficiary_country} />
          <Row k="Paid from" v={r.source ? `${r.source.name} (${r.source.currency})` : "—"} />
          <Row k="Method" v={String(r.transfer_method).replace(/_/g, " ")} />
        </CardContent></Card>
      </div>

      {/* Third-Party Settlement */}
      {isThirdParty && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              <div className="font-semibold">Third-Party Settlement</div>
              <Badge variant="outline" className="text-[10px]">{String(r.payment_destination).replace(/_/g, " ")}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Cell label="Paid to" value={r.third_party?.name || r.third_party_name || "—"} />
              <Cell label="Settlement" value={r.settlement_amount ? fmt(r.settlement_amount, r.settlement_currency || r.customer_payment_currency) : "—"} />
              <Cell label="Date" value={r.settlement_date || "—"} />
              <Cell label="Excess handling" value={String(r.excess_allocation || "none").replace(/_/g, " ")} />
            </div>

            {r.linked_buy && (
              <div className="rounded-md border bg-background/40 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold text-muted-foreground">Linked buy</div>
                  <Link to="/buys/$id" params={{ id: r.linked_buy.id }} className="font-mono text-xs underline">
                    {r.linked_buy.doc_no || r.linked_buy.id.slice(0, 8)}
                  </Link>
                  <Badge variant={r.linked_buy.supplier_delivered ? "default" : "secondary"} className="text-[10px]">
                    {r.linked_buy.supplier_delivered ? "Delivered" : "Awaiting delivery"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <Cell label="Bought" value={fmt(r.linked_buy.bought_amount, r.linked_buy.bought_currency)} />
                  <Cell label="Rate" value={String(r.linked_buy.buy_rate)} />
                  <Cell label="Delivered at" value={r.linked_buy.supplier_delivered_at?.slice(0, 10) || "—"} />
                  <div className="flex items-end">
                    {!r.linked_buy.supplier_delivered && (
                      <Button size="sm" onClick={() => recordDelivery.mutate()} disabled={recordDelivery.isPending} className="h-9">
                        <Truck className="h-3.5 w-3.5 mr-1" /> Record supplier delivery
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">Inventory is created only after supplier delivery is recorded.</div>
              </div>
            )}

            {validationQ.data && Array.isArray(validationQ.data?.items) && (
              <div className="rounded-md border p-3 space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">Close checklist</div>
                {(validationQ.data.items as any[]).map((it, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {it.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className={it.ok ? "" : "text-muted-foreground"}>{it.label}</span>
                    {it.detail && <span className="text-[10px] text-muted-foreground">— {it.detail}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status control */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="text-sm font-semibold">Update status</div>
          <Select value={r.status} onValueChange={(s) => setStatus.mutate(s)}>
            <SelectTrigger className="h-10 w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">Closing posts ledger entries automatically.</div>
          <div className="ml-auto">
            <Button variant="destructive" size="sm" onClick={() => del.mutate()}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {r.notes && (
        <Card><CardContent className="p-4 text-sm whitespace-pre-wrap">
          <div className="font-semibold mb-1">Notes</div>{r.notes}
        </CardContent></Card>
      )}
    </div>
  );
}

function Cell({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm ${className || ""}`}>{value}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v || "—"}</span>
    </div>
  );
}