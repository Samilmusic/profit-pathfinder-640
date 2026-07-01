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
import { Switch } from "@/components/ui/switch";
import { AccountSelect } from "@/components/account-select";
import { CURRENCIES, fmt } from "@/lib/exchange";
import { EXPENSE_KINDS, MONEY_LOCATIONS } from "@/lib/settlement";
import { toast } from "sonner";
import { Plus, FileText } from "lucide-react";
import { SettlementStatusBadge } from "@/components/settlement-status-badge";
import { TxnDetailDialog } from "@/components/txn-detail-dialog";

export const Route = createFileRoute("/_authenticated/expenses")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<any | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    entry_date: today, paid_by: "milad", paid_from_account_id: "", amount: "", currency: "AED",
    category: "business", expense_kind: "business", money_location: "cash_box",
    is_business: true, reduces_profit: true, notes: "",
  });

  const q = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").is("deleted_at", null).order("entry_date", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        ...f, amount: Number(f.amount), paid_by: f.paid_by as any, category: f.category as any,
        expense_kind: f.expense_kind as any, money_location: f.money_location as any,
        paid_from_account_id: f.paid_from_account_id || null, created_by: u.user?.id,
      };
      const { error } = await supabase.from("expenses").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Expense recorded"); qc.invalidateQueries(); setOpen(false); setF({ ...f, amount: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Business or personal expenses. Only business expenses reduce net profit."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New expense</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New expense</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid md:grid-cols-2 gap-3">
                <F label="Date"><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></F>
                <F label="Paid by">
                  <Select value={f.paid_by} onValueChange={(v) => setF({ ...f, paid_by: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="milad">Milad</SelectItem><SelectItem value="ali">Ali</SelectItem></SelectContent>
                  </Select>
                </F>
                <F label="Currency">
                  <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Amount"><Input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></F>
                <F label="Paid from account"><AccountSelect currency={f.currency} value={f.paid_from_account_id} onChange={(v) => setF({ ...f, paid_from_account_id: v })} /></F>
                <F label="Kind">
                  <Select value={f.expense_kind} onValueChange={(v) => setF({ ...f, expense_kind: v, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EXPENSE_KINDS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Money location">
                  <Select value={f.money_location} onValueChange={(v) => setF({ ...f, money_location: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONEY_LOCATIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div><Label>Business expense</Label></div>
                  <Switch checked={f.is_business} onCheckedChange={(v) => setF({ ...f, is_business: v })} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div><Label>Reduces net profit</Label></div>
                  <Switch checked={f.reduces_profit} onCheckedChange={(v) => setF({ ...f, reduces_profit: v })} />
                </div>
                <div className="md:col-span-2"><F label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></F></div>
                <div className="md:col-span-2 flex justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>Save</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>By</TableHead><TableHead>Category</TableHead><TableHead>Business?</TableHead><TableHead>Cuts profit?</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="capitalize">{r.paid_by}</TableCell>
                <TableCell className="capitalize">{r.category.replace("_", " ")}</TableCell>
                <TableCell>{r.is_business ? "Yes" : "No"}</TableCell>
                <TableCell>{r.reduces_profit ? "Yes" : "No"}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.amount, r.currency)}</TableCell>
                <TableCell><SettlementStatusBadge value={r.settlement_status} /></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setDetailRow(r)}>
                    <FileText className="h-4 w-4 mr-1" /> Manage
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No expenses yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
      <TxnDetailDialog
        open={!!detailRow}
        onOpenChange={(v) => !v && setDetailRow(null)}
        table="expenses"
        row={detailRow}
      />
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}