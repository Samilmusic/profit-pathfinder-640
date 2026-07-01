import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountSelect } from "@/components/account-select";
import { CURRENCIES, fmt } from "@/lib/exchange";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/brought-in")({ component: Page });

const REASONS = [
  { value: "capital", label: "Capital" },
  { value: "for_exchange", label: "For exchange" },
  { value: "customer_payment", label: "Customer payment" },
  { value: "temporary_deposit", label: "Temporary deposit" },
  { value: "other", label: "Other" },
];
const BROUGHT_BY = ["milad", "ali", "customer", "other"];

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    entry_date: today, brought_by: "milad", source_name: "", currency: "IRR", amount: "",
    deposit_account_id: "", sender_bank_name: "", sender_account_name: "", sender_account_number: "",
    reason: "for_exchange", notes: "",
  });

  const q = useQuery({
    queryKey: ["brought_in"],
    queryFn: async () => {
      const { data, error } = await supabase.from("brought_in_money").select("*, deposit_account:accounts!brought_in_money_deposit_account_id_fkey(name)").is("deleted_at", null).order("entry_date", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!f.deposit_account_id) throw new Error("Pick a deposit account");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("brought_in_money").insert({
        ...f, amount: Number(f.amount), brought_by: f.brought_by as any, reason: f.reason as any, created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Brought-in money saved"); qc.invalidateQueries(); setOpen(false); setF({ ...f, amount: "", source_name: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Brought-In Money"
        description="Capital or funds brought in by Milad, Ali, customers, or others."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Add brought-in</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Add brought-in money</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid md:grid-cols-2 gap-3">
                <F label="Date"><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></F>
                <F label="Brought by">
                  <Select value={f.brought_by} onValueChange={(v) => setF({ ...f, brought_by: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{BROUGHT_BY.map((v) => <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Source person name"><Input value={f.source_name} onChange={(e) => setF({ ...f, source_name: e.target.value })} /></F>
                <F label="Reason">
                  <Select value={f.reason} onValueChange={(v) => setF({ ...f, reason: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Currency">
                  <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Amount"><Input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></F>
                <F label="Deposit account"><AccountSelect value={f.deposit_account_id} onChange={(v) => setF({ ...f, deposit_account_id: v })} currency={f.currency} /></F>
                <F label="Sender bank"><Input value={f.sender_bank_name} onChange={(e) => setF({ ...f, sender_bank_name: e.target.value })} /></F>
                <F label="Sender account name"><Input value={f.sender_account_name} onChange={(e) => setF({ ...f, sender_account_name: e.target.value })} /></F>
                <F label="Sender account / card"><Input value={f.sender_account_number} onChange={(e) => setF({ ...f, sender_account_number: e.target.value })} /></F>
                <div className="md:col-span-2"><F label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></F></div>
                <div className="md:col-span-2 flex justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>Save</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>By</TableHead><TableHead>Source</TableHead><TableHead>Reason</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="capitalize">{r.brought_by}</TableCell>
                <TableCell>{r.source_name || "—"}</TableCell>
                <TableCell className="capitalize text-sm text-muted-foreground">{r.reason.replace("_", " ")}</TableCell>
                <TableCell>{r.deposit_account?.name}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.amount, r.currency)}</TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nothing brought in yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}