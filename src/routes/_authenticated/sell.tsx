import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
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
import { CURRENCIES, fmt } from "@/lib/exchange";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sell")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const customers = useCustomers();

  const [f, setF] = useState({
    entry_date: today, sold_currency: "AED", sold_amount: "", sell_rate: "",
    received_currency: "IRR", sold_from_account_id: "", received_into_account_id: "",
    customer_id: "", customer_phone: "", customer_account_ref: "",
    milad_pct: "50", ali_pct: "50", notes: "",
  });

  const received_amount = useMemo(() => {
    const a = Number(f.sold_amount); const r = Number(f.sell_rate);
    return a && r ? a * r : 0;
  }, [f.sold_amount, f.sell_rate]);

  const q = useQuery({
    queryKey: ["sells"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sell_transactions").select("*").is("deleted_at", null).order("entry_date", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const milad = Number(f.milad_pct); const ali = Number(f.ali_pct);
      if (Math.abs(milad + ali - 100) > 0.01) throw new Error("Milad % + Ali % must equal 100");
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        entry_date: f.entry_date,
        sold_currency: f.sold_currency,
        sold_amount: Number(f.sold_amount),
        sell_rate: Number(f.sell_rate),
        received_currency: f.received_currency,
        received_amount,
        sold_from_account_id: f.sold_from_account_id || null,
        received_into_account_id: f.received_into_account_id || null,
        customer_id: f.customer_id || null,
        customer_phone: f.customer_phone || null,
        customer_account_ref: f.customer_account_ref || null,
        milad_pct: milad, ali_pct: ali,
        notes: f.notes || null,
        created_by: u.user?.id,
      };
      const { error } = await supabase.from("sell_transactions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sell recorded"); qc.invalidateQueries(); setOpen(false); setF({ ...f, sold_amount: "", sell_rate: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Sell Transactions"
        description="Sell currency from inventory. Profit is auto-calculated against average buy rate."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New sell</Button></DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>New sell transaction</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid md:grid-cols-2 gap-3">
                <F label="Date"><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></F>
                <F label="Customer">
                  <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Sold currency">
                  <Select value={f.sold_currency} onValueChange={(v) => setF({ ...f, sold_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Sold amount"><Input type="number" step="0.0001" value={f.sold_amount} onChange={(e) => setF({ ...f, sold_amount: e.target.value })} required /></F>
                <F label="Sell rate (received per 1 sold)"><Input type="number" step="0.00000001" value={f.sell_rate} onChange={(e) => setF({ ...f, sell_rate: e.target.value })} required /></F>
                <F label="Received currency">
                  <Select value={f.received_currency} onValueChange={(v) => setF({ ...f, received_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Received amount (auto)"><Input readOnly value={received_amount ? fmt(received_amount, f.received_currency) : ""} /></F>
                <F label="Sold from account"><AccountSelect currency={f.sold_currency} value={f.sold_from_account_id} onChange={(v) => setF({ ...f, sold_from_account_id: v })} /></F>
                <F label="Received into account"><AccountSelect currency={f.received_currency} value={f.received_into_account_id} onChange={(v) => setF({ ...f, received_into_account_id: v })} /></F>
                <F label="Customer phone"><Input value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} /></F>
                <F label="Customer account/card ref"><Input value={f.customer_account_ref} onChange={(e) => setF({ ...f, customer_account_ref: e.target.value })} /></F>
                <F label="Milad %"><Input type="number" value={f.milad_pct} onChange={(e) => setF({ ...f, milad_pct: e.target.value, ali_pct: String(100 - Number(e.target.value)) })} /></F>
                <F label="Ali %"><Input type="number" value={f.ali_pct} onChange={(e) => setF({ ...f, ali_pct: e.target.value, milad_pct: String(100 - Number(e.target.value)) })} /></F>
                <div className="md:col-span-2"><F label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></F></div>
                <div className="md:col-span-2 flex justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>Save</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Sold</TableHead><TableHead>Rate</TableHead><TableHead>Received</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Milad</TableHead><TableHead className="text-right">Ali</TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="font-mono">{fmt(r.sold_amount, r.sold_currency)}</TableCell>
                <TableCell className="font-mono">{fmt(r.sell_rate)}</TableCell>
                <TableCell className="font-mono">{fmt(r.received_amount, r.received_currency)}</TableCell>
                <TableCell className="text-right font-mono text-accent">{fmt(r.gross_profit)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.milad_profit)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.ali_profit)}</TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No sells yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}