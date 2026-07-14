import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
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
import { NumberInput } from "@/components/number-input";
import { fmt, parseMoneyInput } from "@/lib/exchange";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, XCircle, Truck, Paperclip } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    queryFn: async () => (await supabase.from("documents").select("id,created_at,doc_type").eq("ref_type", "sell").eq("ref_id", id)).data ?? [],
  });

  const s = sellQ.data as any;
  const paid = useMemo(
    () => (paymentsQ.data ?? []).filter((p: any) => p.currency === s?.received_currency).reduce((n: number, p: any) => n + Number(p.amount || 0), 0),
    [paymentsQ.data, s?.received_currency]
  );
  const remaining = s ? Number(s.received_amount) - paid : 0;

  const [pf, setPf] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    method: "cash_box" as "cash_box" | "bank_account" | "cash_with_person" | "customer_wallet",
    currency: "",
    amount: "",
    account_id: "",
    notes: "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [showDeliver, setShowDeliver] = useState(false);
  const [df, setDf] = useState({ method: "cash_handover", delivered_to: "", notes: "", account_id: "" });
  const [docType, setDocType] = useState<any>("payment_receipt");

  function jumpToUploadDeliveryProof() {
    setDocType("currency_handover_proof");
    setTimeout(() => {
      const el = document.getElementById("documents-section");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  useEffect(() => {
    if (!showPay || !s || remaining <= 0) return;
    setPf((p) => ({
      ...p,
      currency: p.currency || s.received_currency || "",
      amount: p.amount || String(remaining),
    }));
  }, [showPay, remaining, s?.received_currency]);

  const addPayment = useMutation({
    mutationFn: async () => {
      const amountRaw = parseMoneyInput(pf.amount);
      const amountValue = Number(amountRaw);
      if (!amountRaw || !Number.isFinite(amountValue) || amountValue <= 0) throw new Error("Amount is required");
      if (!pf.account_id) throw new Error("Receiving account is required");
      if (!receiptFile && !hasPaymentReceipt) throw new Error("Receipt upload is required");
      const currency = pf.currency || s.received_currency;
      const { data: u } = await supabase.auth.getUser();

      // 1. Upload receipt to storage when a new file is attached.
      let receiptUrl: string | null = null;
      let path: string | null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop() ?? "bin";
        path = `sell/${id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("documents").upload(path, receiptFile, {
          contentType: receiptFile.type || "application/octet-stream",
        });
        if (up.error) throw up.error;
        receiptUrl = supabase.storage.from("documents").getPublicUrl(path).data.publicUrl;
      }

      // 2. Insert the payment (triggers post ledger + inventory lot via sync_sell_received_lot)
      const { error: pErr } = await supabase.from("sell_payments").insert({
        sell_id: id, entry_date: pf.entry_date, currency,
        amount: amountValue, received_into_account_id: pf.account_id,
        receipt_url: receiptUrl,
        notes: pf.notes || null, created_by: u.user?.id,
      });
      if (pErr) throw pErr;

      // 3. Register a newly uploaded receipt in documents so status gates recognise it.
      if (receiptFile && path) {
        await supabase.from("documents").insert({
          doc_type: "payment_receipt", storage_path: path, file_name: receiptFile.name,
          mime_type: receiptFile.type || null, size_bytes: receiptFile.size,
          ref_type: "sell", ref_id: id, uploaded_by: u.user?.id,
          notes: pf.notes || null,
        });
      }

      // 4. Point the deal's receiving account at the one the user just paid into
      //    so the inventory lot lands in the right place.
      await supabase.from("sell_transactions")
        .update({ received_into_account_id: pf.account_id })
        .eq("id", id);
    },
    onSuccess: () => {
      toast.success("Payment received · inventory updated");
      setPf({ ...pf, amount: "", notes: "" });
      setReceiptFile(null);
      setShowPay(false);
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

  const markDelivered = useMutation({
    mutationFn: async () => {
      if (!df.method) throw new Error("Delivery method required");
      const { error } = await (supabase as any).rpc("mark_sell_delivered", {
        _id: id,
        _method: df.method,
        _delivered_to: df.delivered_to || null,
        _notes: df.notes || null,
        _sold_from_account_id: df.account_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Currency delivery recorded");
      setShowDeliver(false);
      qc.invalidateQueries();
    },
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

  const PAY_DOC_TYPES = new Set(["payment_receipt","bank_transfer_screenshot","cash_delivery_receipt","whatsapp_confirmation"]);
  const DELIV_DOC_TYPES = new Set(["currency_handover_proof","cash_delivery_receipt","bank_transfer_screenshot"]);
  const docs = docsQ.data ?? [];
  const hasPaymentReceipt = docs.some((d: any) => PAY_DOC_TYPES.has(d.doc_type)) || (paymentsQ.data ?? []).some((p: any) => p.receipt_url);
  const hasDeliveryProof = docs.some((d: any) => DELIV_DOC_TYPES.has(d.doc_type));
  const canClose = s.deal_status !== "closed" && s.deal_status !== "cancelled"
    && !!s.received_into_account_id
    && (paid + 0.0001 >= Number(s.received_amount) || overrideClose)
    && (hasPaymentReceipt || overrideClose)
    && (s.currency_delivered || overrideClose)
    && (hasDeliveryProof || overrideClose);

  const currencyDelivered = !!s.currency_delivered;
  const paymentReceived = paid + 0.0001 >= Number(s.received_amount) && Number(s.received_amount) > 0;
  const isClosed = s.deal_status === "closed";
  const steps = [
    { label: "Created", done: true },
    { label: "Payment Received", done: paymentReceived },
    { label: "Payment Receipt", done: hasPaymentReceipt },
    { label: "Currency Delivered", done: currencyDelivered },
    { label: "Delivery Proof", done: hasDeliveryProof },
    { label: "Ready to Close", done: paymentReceived && hasPaymentReceipt && currencyDelivered && hasDeliveryProof },
    { label: "Closed", done: isClosed },
  ];
  const doneCount = steps.filter(s => s.done).length;

  const events = buildTimeline(s, paymentsQ.data ?? [], hasPaymentReceipt, hasDeliveryProof);
  const paymentAmountRaw = parseMoneyInput(pf.amount);
  const paymentAmountNumber = Number(paymentAmountRaw);
  const hasReceiptForPayment = !!receiptFile || hasPaymentReceipt;
  const paymentSubmitReason = !paymentAmountRaw || !Number.isFinite(paymentAmountNumber) || paymentAmountNumber <= 0
    ? "Enter a payment amount."
    : !pf.account_id
      ? "Select the receiving account."
      : !hasReceiptForPayment
        ? "Upload a receipt."
        : "";

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
                  <div className="text-xs mt-1">
                    {s.currency_delivered
                      ? <span className="text-emerald-700">Delivered {s.delivery_method ? `· ${s.delivery_method}` : ""}{s.delivered_to ? ` · to ${s.delivered_to}` : ""}</span>
                      : <span className="text-amber-700">Not yet delivered</span>}
                  </div>
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
              <CardTitle className="text-sm">Currency Delivery</CardTitle>
              <div className="flex items-center gap-2">
                {s.deal_status !== "closed" && s.deal_status !== "cancelled" && !hasDeliveryProof && (
                  <Button size="sm" variant="secondary" onClick={jumpToUploadDeliveryProof}>
                    <Paperclip className="h-4 w-4 mr-1" /> Upload delivery proof
                  </Button>
                )}
                {!s.currency_delivered && s.deal_status !== "closed" && s.deal_status !== "cancelled" && (
                  <Button size="sm" onClick={() => setShowDeliver((v) => !v)}>
                    <Truck className="h-4 w-4 mr-1" /> Deliver {s.sold_currency}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {showDeliver && (
                <div className="grid md:grid-cols-2 gap-2 p-3 rounded-md border bg-muted/30">
                  <div>
                    <Label className="text-xs">Delivery method</Label>
                    <Select value={df.method} onValueChange={(v) => setDf({ ...df, method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash_handover">Cash handover</SelectItem>
                        <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                        <SelectItem value="wallet_transfer">Wallet transfer</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Source {s.sold_currency} account (optional, defaults to current)</Label>
                    <AccountSelect currency={s.sold_currency} value={df.account_id} onChange={(v) => setDf({ ...df, account_id: v })} placeholder={s.src?.name ?? "Pick account"} />
                  </div>
                  <div>
                    <Label className="text-xs">Delivered to</Label>
                    <Input value={df.delivered_to} onChange={(e) => setDf({ ...df, delivered_to: e.target.value })} placeholder="Customer / recipient name" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Notes</Label>
                    <Input value={df.notes} onChange={(e) => setDf({ ...df, notes: e.target.value })} />
                  </div>
                  <div className="md:col-span-2 text-xs text-muted-foreground">
                    Upload the delivery proof (cash receipt / transfer screenshot / handover photo) in the Documents section below — pick doc type <b>Currency handover proof</b>.
                  </div>
                  <div className="md:col-span-2 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setShowDeliver(false)}>Cancel</Button>
                    <Button onClick={() => markDelivered.mutate()} disabled={markDelivered.isPending}>Record delivery</Button>
                  </div>
                </div>
              )}
              {s.currency_delivered && (
                <div className="text-xs text-muted-foreground">
                  Delivered {s.delivered_at ? new Date(s.delivered_at).toLocaleString() : ""} · {s.delivery_method ?? "—"}
                  {s.delivered_to ? ` · to ${s.delivered_to}` : ""}
                  {s.delivery_notes ? ` · ${s.delivery_notes}` : ""}
                  {" · "}
                  <span className={hasDeliveryProof ? "text-emerald-700" : "text-amber-700"}>
                    {hasDeliveryProof ? "Delivery proof uploaded" : "Delivery proof still missing"}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm">Customer Payment</CardTitle>
              {s.deal_status !== "closed" && s.deal_status !== "cancelled" && (
                <Button size="sm" onClick={() => {
                  setShowPay((v) => {
                    const next = !v;
                    if (next && !pf.amount && remaining > 0) {
                      setPf((p) => ({ ...p, amount: String(remaining) }));
                    }
                    return next;
                  });
                }}><Plus className="h-4 w-4 mr-1" /> Record payment</Button>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {showPay && (() => {
                const methodToTypes: Record<string, string[]> = {
                  cash_box: ["cash"],
                  bank_account: ["aed_bank", "toman_bank", "foreign_currency"],
                  cash_with_person: ["person_holding"],
                  customer_wallet: ["customer_wallet"],
                };
                const activeCurrency = pf.currency || s.received_currency;
                return (
                  <div className="grid md:grid-cols-4 gap-2 mb-3 p-3 rounded-md border bg-muted/30">
                    <div className="md:col-span-4 text-xs text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Money enters inventory ONLY after this payment is saved with a receipt.
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Payment method</Label>
                      <Select value={pf.method} onValueChange={(v: any) => setPf({ ...pf, method: v, account_id: "" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash_box">Cash Box</SelectItem>
                          <SelectItem value="bank_account">Bank Account</SelectItem>
                          <SelectItem value="cash_with_person">Cash With Person</SelectItem>
                          <SelectItem value="customer_wallet">Customer Wallet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Receive currency</Label>
                      <Select value={activeCurrency} onValueChange={(v) => setPf({ ...pf, currency: v, account_id: "" })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[s.received_currency, "AED", "IRR", "USD", "EUR", "GBP", "USDT"].filter((v, i, a) => v && a.indexOf(v) === i).map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Date</Label>
                      <Input type="date" value={pf.entry_date} onChange={(e) => setPf({ ...pf, entry_date: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Amount ({activeCurrency})</Label>
                      <NumberInput currency={activeCurrency} value={pf.amount} onChange={(e) => setPf({ ...pf, amount: e.target.value })} placeholder={fmt(remaining, s.received_currency)} />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Receiving account · {activeCurrency}</Label>
                      <AccountSelect
                        currency={activeCurrency}
                        onlyTypes={methodToTypes[pf.method]}
                        value={pf.account_id}
                        onChange={(v) => setPf({ ...pf, account_id: v })}
                        placeholder={`Pick a ${activeCurrency} ${pf.method.replace("_", " ")} account`}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <Label className="text-xs">Receipt upload <span className="text-red-600">*</span></Label>
                      <Input type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                      {receiptFile && <div className="text-[11px] text-muted-foreground mt-1">{receiptFile.name}</div>}
                      {!receiptFile && hasPaymentReceipt && <div className="text-[11px] text-emerald-700 mt-1">Receipt already uploaded.</div>}
                    </div>
                    <div className="md:col-span-4">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={2} value={pf.notes} onChange={(e) => setPf({ ...pf, notes: e.target.value })} />
                    </div>
                    <div className="md:col-span-4 flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => { setShowPay(false); setReceiptFile(null); }}>Cancel</Button>
                      <Button onClick={() => addPayment.mutate()} disabled={addPayment.isPending || !!paymentSubmitReason} title={paymentSubmitReason || undefined}>
                        Receive payment
                      </Button>
                    </div>
                    {paymentSubmitReason && <div className="md:col-span-4 text-right text-[11px] text-amber-700">{paymentSubmitReason}</div>}
                  </div>
                );
              })()}
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

          <Card id="documents-section">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Documents</CardTitle></CardHeader>
            <CardContent><DocumentsPanel refType="sell" refId={id} docType={docType} onDocTypeChange={setDocType} /></CardContent>
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

function buildTimeline(s: any, payments: any[], hasPaymentReceipt: boolean, hasDeliveryProof: boolean) {
  const arr: { label: string; done: boolean; at?: string }[] = [];
  arr.push({ label: "Deal created", done: true, at: s.created_at?.slice(0, 16).replace("T", " ") });
  arr.push({ label: "Customer payment received", done: payments.length > 0, at: payments[0]?.entry_date });
  if (payments.length > 0) {
    arr.push({ label: `Payment${payments.length > 1 ? "s" : ""} received (${payments.length})`, done: true, at: payments[payments.length - 1].entry_date });
  }
  arr.push({ label: "Payment receipt uploaded", done: hasPaymentReceipt, at: undefined });
  arr.push({ label: `${s.sold_currency} delivered to customer`, done: !!s.currency_delivered, at: s.delivered_at ? new Date(s.delivered_at).toLocaleString() : undefined });
  arr.push({ label: "Delivery proof uploaded", done: hasDeliveryProof, at: undefined });
  arr.push({ label: "Deal closed · profit realized", done: s.deal_status === "closed", at: s.closed_at?.slice(0, 16).replace("T", " ") });
  if (s.deal_status === "cancelled") arr.push({ label: `Cancelled — ${s.cancel_reason ?? ""}`, done: true });
  return arr;
}