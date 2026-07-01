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
import { CURRENCIES, fmt } from "@/lib/exchange";
import { SmartLabels } from "@/components/settlement-status-badge";
import { DocumentsPanel } from "@/components/documents-panel";
import { toast } from "sonner";
import { Plus, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/deposits")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const customers = useCustomers();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<any>({
    entry_date: today, customer_id: "", currency: "AED", amount: "",
    deposit_account_id: "", wallet_account_id: "", notes: "",
  });

  // Auto-pick the customer's wallet in that currency
  const walletQ = useQuery({
    queryKey: ["cust_wallet", f.customer_id, f.currency],
    enabled: !!f.customer_id && !!f.currency,
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id")
        .eq("holder_customer_id", f.customer_id).eq("currency", f.currency)
        .eq("account_type", "customer_wallet").is("deleted_at", null).limit(1);
      return data?.[0]?.id ?? null;
    },
  });
  useEffect(() => { if (walletQ.data) setF((p: any) => ({ ...p, wallet_account_id: walletQ.data })); }, [walletQ.data]);

  const q = useQuery({
    queryKey: ["customer_deposits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_deposits")
        .select("*, customer:customers(name), deposit_account:accounts!customer_deposits_deposit_account_id_fkey(name)")
        .is("deleted_at", null).order("entry_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!f.customer_id) throw new Error("Pick a customer");
      if (!f.deposit_account_id) throw new Error("Pick a receiving company account");
      if (!f.wallet_account_id) throw new Error("Customer wallet not found for that currency");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("customer_deposits").insert({
        entry_date: f.entry_date, customer_id: f.customer_id, currency: f.currency,
        amount: Number(f.amount), deposit_account_id: f.deposit_account_id,
        wallet_account_id: f.wallet_account_id, notes: f.notes || null,
        created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deposit saved as draft. Upload receipt & complete to credit wallet."); qc.invalidateQueries(); setOpen(false); setF({ ...f, amount: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Customer Deposits" description="Money customers place with us with no immediate exchange. Increases their wallet." actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="lg" className="h-12"><Plus className="h-4 w-4 mr-1" /> New deposit</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New customer deposit</DialogTitle></DialogHeader>
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
              <F label="Amount"><NumberInput currency={f.currency} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></F>
              <div className="md:col-span-2"><F label="Received into company account">
                <AccountSelect value={f.deposit_account_id} onChange={(v) => setF({ ...f, deposit_account_id: v })} currency={f.currency} excludeTypes={["customer_wallet"]} />
              </F></div>
              <div className="md:col-span-2"><F label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></F></div>
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
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Received into</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="font-medium">{r.customer?.name}</TableCell>
                <TableCell>{r.deposit_account?.name}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.amount, r.currency)}</TableCell>
                <TableCell><SmartLabels row={r} /></TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}>Open</Button></TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No deposits yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
      <DepositDetail id={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function DepositDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["deposit", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("customer_deposits").select("*, customer:customers(name)").eq("id", id!).maybeSingle();
      return data;
    },
  });
  const [note, setNote] = useState("");
  useEffect(() => { setNote(q.data?.completion_note ?? ""); }, [q.data]);
  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customer_deposits").update({ settlement_status: "completed", completion_note: note }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deposit completed — wallet credited"); qc.invalidateQueries(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Deposit — {q.data?.customer?.name}</DialogTitle></DialogHeader>
        {q.data && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">{q.data.entry_date} · {fmt(q.data.amount, q.data.currency)}</div>
            <SmartLabels row={q.data} />
            <DocumentsPanel refType="deposit" refId={q.data.id} />
            <div><Label className="text-xs">Confirmation note (required to complete)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Confirmed receipt in bank / cash box…" /></div>
            {q.data.settlement_status !== "completed" && (
              <Button className="w-full" onClick={() => complete.mutate()} disabled={complete.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Mark completed & credit wallet
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}