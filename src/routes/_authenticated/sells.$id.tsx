import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountSelect } from "@/components/account-select";
import { DocumentsPanel } from "@/components/documents-panel";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { fmt } from "@/lib/exchange";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sells/$id")({
  component: DealPage,
});

function DealPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [overrideClose, setOverrideClose] = useState(false);
  const [diffReason, setDiffReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  const sellQ = useQuery({
    queryKey: ["sell", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sell_transactions")
        .select("*, customer:customers(name), src:accounts!sell_transactions_sold_from_account_id_fkey(name,currency), dst:accounts!sell_transactions_received_into_account_id_fkey(name,currency)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["sell-payments", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sell_payments")
        .select("*, account:accounts!sell_payments_received_into_account_id_fkey(name,currency)")
        .eq("sell_id", id).is("deleted_at", null)
        .order("entry_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const docsQ = useQuery({
    queryKey: ["documents", "sell", id],
    queryFn: async () => (await supabase.from("documents").select("id,created_at").eq("ref_type", "sell").eq("ref_id", id)).data ?? [],
  });

  const s = sellQ.data as any;
  const paid = useMemo(
    () => (paymentsQ.data ?? []).filter((p: any) => p.currency === s?.received_currency).reduce((n: number, p: any) => n + Number(p.amount || 0), 0),
    [paymentsQ.data, s?.received_currency]
  );
  const remaining = s ? Number(s.received_amount) - paid : 0;

  const [pf, setPf] = useState({ entry_date: new Date().toISOString().slice(0, 10), amount: "", account_id: "", notes: "" });
  const [showPay, setShowPay] = useState(false);

  const addPayment = useMutation({
    mutationFn: async () => {
      if (!pf.amount || !pf.account_id) throw new Error("Amount and account required");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("sell_payments").insert({
        sell_id: id, entry_date: pf.entry_date, currency: s.received_currency,
        amount: Number(pf.amount), received_into_account_id: pf.account_id,
        notes: pf.notes || null, created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setPf({ ...pf, amount: "", notes: "" }); setShowPay(false);
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setDest = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.from("sell_transactions").update({ received_into_account_id: accountId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Receiving account set"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const closeDeal = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("close_sell_deal", {
        _id: id, _override: overrideClose, _difference_reason: diffReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deal closed · profit realized"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelDeal = useMutation({
    mutationFn: async () => {
      if (!cancelReason.trim()) throw new Error("Reason required");
      const { error } = await (supabase as any).rpc("cancel_sell_deal", { _id: id, _reason: cancelReason.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deal cancelled · inventory restored"); qc.invalidateQueries(); navigate({ to: "/sell" }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (sellQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!s) return <div className="p-6 text-sm text-muted-foreground">Deal not found. <Link to="/sell" className="underline">Back to Sells</Link></div>;

  const hasReceipt = (docsQ.data ?? []).length > 0 || (paymentsQ.data ?? []).some((p: any) => p.receipt_url);
  const canClose = s.deal_status !== "closed" && s.deal_status !== "cancelled"
    && !!s.received_into_account_id
    && (paid + 0.0001 >= Number(s.received_amount) || overrideClose)
    && (hasReceipt || overrideClose);

  const currencyDelivered = !!s.sold_from_account_id;
  const paymentReceived = paid + 0.0001 >= Number(s.received_amount) && Number(s.received_amount) > 0;
  const receiptUploaded = hasReceipt;
  const isClosed = s.deal_status === "closed";
  const steps = [
    { label: "Created", done: true },
    { label: "Currency Delivered", done: currencyDelivered },
    { label: "Payment Received", done: paymentReceived },
    { label: "Receipt Uploaded", done: receiptUploaded },
    { label: "Ready to Close", done: currencyDelivered && paymentReceived && receiptUploaded },
    { label: "Closed", done: isClosed },
  ];
  const doneCount = steps.filter(s => s.done).length;

  const events = buildTimeline(s, paymentsQ.data ?? [], (docsQ.data ?? []).length);

  return (
    <>
      <PageHeader
        title={`Deal · ${s.sold_currency} → ${s.received_currency}`}
        description={`${s.customer?.name ?? "No customer"} · ${s.entry_date}`}
        actions={
          <Button asChild variant="ghost" size="sm"><Link to="/sell"><ArrowLeft className="h-4 w-4 mr-1" /> All sells</Link></Button>
        }
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 pb-32 lg:pb-8">
        <div className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Deal progress</span>
                <span>{doneCount} / {steps.length}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={isClosed ? "h-full bg-emerald-500" : "h-full bg-primary"} style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
              <ol className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                {steps.map((st, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${st.done ? (isClosed && i === steps.length - 1 ? "bg-emerald-500" : "bg-primary") : "bg-muted-foreground/30"}`} />
                    <span className={st.done ? "text-foreground" : "text-muted-foreground"}>{st.label}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground">Sold</div>
                  <div className="font-mono text-lg">{fmt(s.sold_amount, s.sold_currency)} {s.sold_currency}</div>
                  <div className="text-xs text-muted-foreground mt-1">Source: {s.src?.name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Rate</div>
                  <div className="font-mono text-lg">{fmt(s.sell_rate)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Customer owes</div>
                  <div className="font-mono text-lg">{fmt(s.received_amount, s.received_currency)} {s.received_currency}</div>
                  <div className="text-xs text-muted-foreground mt-1">Received: {fmt(paid, s.received_currency)} · Remaining: <span className={remaining > 0.0001 ? "text-amber-700 font-medium" : "text-emerald-700 font-medium"}>{fmt(Math.max(0, remaining), s.received_currency)}</span></div>
                </div>
                <div><DealStatusBadge value={s.deal_status} /></div>
              </div>
              {!s.received_into_account_id && s.deal_status !== "cancelled" && (
                <div className="mt-3 rounded-md border border-dashed p-3 bg-amber-50/50">
                  <div className="text-xs font-medium mb-1 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Pick the receiving account to enable Close Deal</div>
                  <AccountSelect currency={s.received_currency} value="" onChange={(v) => v && setDest.mutate(v)} placeholder={`Pick a ${s.received_currency} account`} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm">Payments</CardTitle>
              {s.deal_status !== "closed" && s.deal_status !== "cancelled" && (
                <Button size="sm" onClick={() => setShowPay((v) => !v)}><Plus className="h-4 w-4 mr-1" /> Record payment</Button>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {showPay && (
                <div className="grid md:grid-cols-4 gap-2 mb-3 p-3 rounded-md border bg-muted/30">
                  <div><Label className="text-xs">Date</Label><Input type="date" value={pf.entry_date} onChange={(e) => setPf({ ...pf, entry_date: e.target.value })} /></div>
                  <div><Label className="text-xs">Amount ({s.received_currency})</Label><Input inputMode="decimal" value={pf.amount} onChange={(e) => setPf({ ...pf, amount: e.target.value })} placeholder={fmt(remaining, s.received_currency)} /></div>
                  <div><Label className="text-xs">Into account</Label><AccountSelect currency={s.received_currency} value={pf.account_id} onChange={(v) => setPf({ ...pf, account_id: v })} /></div>
                  <div className="md:col-span-4"><Label className="text-xs">Notes</Label><Input value={pf.notes} onChange={(e) => setPf({ ...pf, notes: e.target.value })} /></div>
                  <div className="md:col-span-4 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setShowPay(false)}>Cancel</Button>
                    <Button onClick={() => addPayment.mutate()} disabled={addPayment.isPending}>Save payment</Button>
                  </div>
                </div>
              )}
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Into</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(paymentsQ.data ?? []).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.entry_date}</TableCell>
                      <TableCell className="font-mono">{fmt(p.amount, p.currency)} {p.currency}</TableCell>
                      <TableCell>{p.account?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.notes ?? ""}</TableCell>
                    </TableRow>
                  ))}
                  {(paymentsQ.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">No payments yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Documents</CardTitle></CardHeader>
            <CardContent><DocumentsPanel refType="sell" refId={id} /></CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {events.map((e, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className={`mt-1 h-2 w-2 rounded-full ${e.done ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                  <div>
                    <div className={e.done ? "font-medium" : "text-muted-foreground"}>{e.label}</div>
                    {e.at && <div className="text-xs text-muted-foreground">{e.at}</div>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {s.deal_status !== "closed" && s.deal_status !== "cancelled" && (
            <Card>
              <CardContent className="p-4 space-y-2">
                {remaining > 0.0001 && (
                  <div className="text-xs">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={overrideClose} onChange={(e) => setOverrideClose(e.target.checked)} /> Admin override (partial / missing receipt)</label>
                    {overrideClose && (
                      <Textarea className="mt-2" placeholder="Reason for closing with a difference" value={diffReason} onChange={(e) => setDiffReason(e.target.value)} />
                    )}
                  </div>
                )}
                <Button className="w-full" disabled={!canClose || closeDeal.isPending} onClick={() => closeDeal.mutate()}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Close Deal
                </Button>
                {!showCancel ? (
                  <Button variant="ghost" className="w-full text-destructive" onClick={() => setShowCancel(true)}>
                    <XCircle className="h-4 w-4 mr-1" /> Cancel deal
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Textarea placeholder="Reason to cancel (required)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => { setShowCancel(false); setCancelReason(""); }}>Keep open</Button>
                      <Button variant="destructive" className="flex-1" onClick={() => cancelDeal.mutate()} disabled={cancelDeal.isPending}>Confirm cancel</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function buildTimeline(s: any, payments: any[], docCount: number) {
  const arr: { label: string; done: boolean; at?: string }[] = [];
  arr.push({ label: "Deal created", done: true, at: s.created_at?.slice(0, 16).replace("T", " ") });
  arr.push({ label: `${s.sold_currency} delivered to customer`, done: !!s.sold_from_account_id, at: s.entry_date });
  arr.push({ label: "Waiting for payment", done: payments.length > 0 || s.deal_status !== "open", at: undefined });
  if (payments.length > 0) {
    arr.push({ label: `Payment${payments.length > 1 ? "s" : ""} received (${payments.length})`, done: true, at: payments[payments.length - 1].entry_date });
  }
  arr.push({ label: "Receipt uploaded", done: docCount > 0, at: undefined });
  arr.push({ label: "Deal closed · profit realized", done: s.deal_status === "closed", at: s.closed_at?.slice(0, 16).replace("T", " ") });
  if (s.deal_status === "cancelled") arr.push({ label: `Cancelled — ${s.cancel_reason ?? ""}`, done: true });
  return arr;
}