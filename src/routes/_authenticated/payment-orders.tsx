import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountSelect, useCustomers } from "@/components/account-select";
import { NumberInput } from "@/components/number-input";
import { CURRENCIES, FEE_KINDS, PAYMENT_METHODS, fmt, roundAmount } from "@/lib/exchange";
import { SmartLabels } from "@/components/settlement-status-badge";
import { DocumentsPanel } from "@/components/documents-panel";
import { toast } from "sonner";
import { Plus, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payment-orders")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const customers = useCustomers();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<any>({
    entry_date: today, customer_id: "", currency: "AED", amount: "",
    method: "bank_transfer", source_wallet_account_id: "", paid_from_account_id: "",
    destination_bank: "", receiver_name: "", receiver_account: "", iban_card: "", country: "",
    fee_kind: "fixed", fee_input: "", notes: "",
  });

  // Auto-pick customer's wallet
  const walletQ = useQuery({
    queryKey: ["cust_wallet_po", f.customer_id, f.currency],
    enabled: !!f.customer_id && !!f.currency,
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, opening_balance")
        .eq("holder_customer_id", f.customer_id).eq("currency", f.currency)
        .eq("account_type", "customer_wallet").is("deleted_at", null).limit(1);
      return data?.[0] ?? null;
    },
  });
  useEffect(() => { const id = walletQ.data?.id; if (id) setF((p: any) => ({ ...p, source_wallet_account_id: id })); }, [walletQ.data]);

  const walletBalanceQ = useQuery({
    queryKey: ["wallet_balance", f.source_wallet_account_id],
    enabled: !!f.source_wallet_account_id,
    queryFn: async () => {
      const { data } = await supabase.from("customer_wallet_balances").select("balance").eq("account_id", f.source_wallet_account_id).maybeSingle();
      return Number(data?.balance ?? 0);
    },
  });

  const amountNum = Number(f.amount || 0);
  const feeNum = useMemo(() => {
    const fi = Number(f.fee_input || 0);
    if (f.fee_kind === "percent") return roundAmount((amountNum * fi) / 100, f.currency);
    return roundAmount(fi, f.currency);
  }, [f.fee_kind, f.fee_input, amountNum, f.currency]);
  const totalOut = roundAmount(amountNum + feeNum, f.currency);
  const overdraft = walletBalanceQ.data !== undefined && totalOut > walletBalanceQ.data;

  const q = useQuery({
    queryKey: ["payment_orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_orders")
        .select("*, customer:customers(name), paid_from:accounts!payment_orders_paid_from_account_id_fkey(name)")
        .is("deleted_at", null).order("entry_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!f.customer_id) throw new Error("Pick a customer");
      if (!f.source_wallet_account_id) throw new Error("Customer wallet not found");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("payment_orders").insert({
        entry_date: f.entry_date, customer_id: f.customer_id, currency: f.currency,
        amount: Number(f.amount), method: f.method,
        source_wallet_account_id: f.source_wallet_account_id,
        paid_from_account_id: f.paid_from_account_id || null,
        destination_bank: f.destination_bank || null, receiver_name: f.receiver_name || null,
        receiver_account: f.receiver_account || null, iban_card: f.iban_card || null,
        country: f.country || null,
        service_charge_amount: feeNum, service_charge_currency: f.currency,
        fee_kind: f.fee_kind, fee_input: Number(f.fee_input || 0) || null,
        notes: f.notes || null, created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment order saved as draft"); qc.invalidateQueries(); setOpen(false); setF({ ...f, amount: "", fee_input: "", notes: "", receiver_name: "", receiver_account: "", iban_card: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Payment Orders" description="Customer instructions to send their money out. Deducts wallet on completion." actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="lg" className="h-12"><Plus className="h-4 w-4 mr-1" /> New payment order</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New payment order</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid md:grid-cols-2 gap-3">
              <F label="Date"><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></F>
              <F label="Customer">
                <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Currency">
                <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Method">
                <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Amount"><NumberInput currency={f.currency} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></F>
              <F label="Fee kind">
                <Select value={f.fee_kind} onValueChange={(v) => setF({ ...f, fee_kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FEE_KINDS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label={f.fee_kind === "percent" ? "Fee (%)" : "Fee amount"}>
                <NumberInput currency={f.currency} value={f.fee_input} onChange={(v) => setF({ ...f, fee_input: v })} />
              </F>
              <F label="Paid out from (company account, optional)">
                <AccountSelect value={f.paid_from_account_id} onChange={(v) => setF({ ...f, paid_from_account_id: v })} currency={f.currency} excludeTypes={["customer_wallet"]} />
              </F>
              <F label="Destination bank"><Input value={f.destination_bank} onChange={(e) => setF({ ...f, destination_bank: e.target.value })} /></F>
              <F label="Receiver name"><Input value={f.receiver_name} onChange={(e) => setF({ ...f, receiver_name: e.target.value })} /></F>
              <F label="Receiver account"><Input value={f.receiver_account} onChange={(e) => setF({ ...f, receiver_account: e.target.value })} /></F>
              <F label="IBAN / Card"><Input value={f.iban_card} onChange={(e) => setF({ ...f, iban_card: e.target.value })} /></F>
              <F label="Country"><Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></F>
              <div className="md:col-span-2"><F label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></F></div>
              <div className="md:col-span-2 rounded-lg border p-3 bg-secondary/40 text-sm space-y-1">
                <div className="flex justify-between"><span>Amount</span><span className="font-mono">{fmt(amountNum, f.currency)}</span></div>
                <div className="flex justify-between"><span>Service charge</span><span className="font-mono">{fmt(feeNum, f.currency)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total out of wallet</span><span className="font-mono">{fmt(totalOut, f.currency)}</span></div>
                {walletBalanceQ.data !== undefined && (
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Current wallet balance</span><span className="font-mono">{fmt(walletBalanceQ.data, f.currency)}</span></div>
                )}
                {overdraft && (
                  <div className="flex items-center gap-2 text-destructive text-xs pt-1"><AlertTriangle className="h-3 w-3" /> Overdraft — customer wallet doesn't have enough funds.</div>
                )}
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={create.isPending}>Save draft</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      } />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Method</TableHead><TableHead>Receiver</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Fee</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="font-medium">{r.customer?.name}</TableCell>
                <TableCell className="capitalize text-xs">{r.method.replace("_", " ")}</TableCell>
                <TableCell className="text-sm">{r.receiver_name || "—"}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.amount, r.currency)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{fmt(r.service_charge_amount, r.currency)}</TableCell>
                <TableCell><SmartLabels row={r} /></TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No payment orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
      <PODetail id={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function PODetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["po", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("payment_orders").select("*, customer:customers(name)").eq("id", id!).maybeSingle();
      return data;
    },
  });
  const [note, setNote] = useState("");
  useEffect(() => { setNote(q.data?.completion_note ?? ""); }, [q.data]);
  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payment_orders").update({ settlement_status: "completed", completion_note: note }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment order completed"); qc.invalidateQueries(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Payment order — {q.data?.customer?.name}</DialogTitle></DialogHeader>
        {q.data && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">{q.data.entry_date} · {fmt(q.data.amount, q.data.currency)} · fee {fmt(q.data.service_charge_amount, q.data.currency)}</div>
            <div className="text-sm grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Receiver:</span> {q.data.receiver_name || "—"}</div>
              <div><span className="text-muted-foreground">Bank:</span> {q.data.destination_bank || "—"}</div>
              <div><span className="text-muted-foreground">IBAN/Card:</span> {q.data.iban_card || "—"}</div>
              <div><span className="text-muted-foreground">Country:</span> {q.data.country || "—"}</div>
            </div>
            <SmartLabels row={q.data} />
            <DocumentsPanel refType="payment_order" refId={q.data.id} />
            <div><Label className="text-xs">Confirmation note (required to complete)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transfer confirmed / delivered…" /></div>
            {q.data.settlement_status !== "completed" && (
              <Button className="w-full" onClick={() => complete.mutate()} disabled={complete.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Mark completed & debit wallet
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}