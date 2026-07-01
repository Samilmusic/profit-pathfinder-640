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
import { Plus, FileText } from "lucide-react";
import { SettlementStatusBadge } from "@/components/settlement-status-badge";
import { TxnDetailDialog } from "@/components/txn-detail-dialog";

export const Route = createFileRoute("/_authenticated/transfers")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<any | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    entry_date: today, from_account_id: "", to_account_id: "", amount: "", currency: "AED",
    reason: "", requested_by: "milad", notes: "",
  });

  const q = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transfers").select("*").is("deleted_at", null).order("entry_date", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!f.from_account_id || !f.to_account_id) throw new Error("Pick both accounts");
      const { data: u } = await supabase.auth.getUser();
      const payload: any = { ...f, amount: Number(f.amount), requested_by: f.requested_by as any, created_by: u.user?.id };
      const { error } = await supabase.from("transfers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transfer recorded"); qc.invalidateQueries(); setOpen(false); setF({ ...f, amount: "", reason: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Transfers"
        description="Move funds between your own accounts. No profit is generated."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New transfer</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New transfer</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid md:grid-cols-2 gap-3">
                <F label="Date"><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></F>
                <F label="Requested by">
                  <Select value={f.requested_by} onValueChange={(v) => setF({ ...f, requested_by: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="milad">Milad</SelectItem><SelectItem value="ali">Ali</SelectItem><SelectItem value="customer">Customer</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                  </Select>
                </F>
                <F label="Currency">
                  <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Amount"><Input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></F>
                <F label="From account"><AccountSelect currency={f.currency} value={f.from_account_id} onChange={(v) => setF({ ...f, from_account_id: v })} /></F>
                <F label="To account"><AccountSelect currency={f.currency} value={f.to_account_id} onChange={(v) => setF({ ...f, to_account_id: v })} /></F>
                <div className="md:col-span-2"><F label="Reason"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></F></div>
                <div className="md:col-span-2"><F label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></F></div>
                <div className="md:col-span-2 flex justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>Save</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>By</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="capitalize">{r.requested_by}</TableCell>
                <TableCell>{r.reason || "—"}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.amount, r.currency)}</TableCell>
                <TableCell><SettlementStatusBadge value={r.settlement_status} /></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setDetailRow(r)}>
                    <FileText className="h-4 w-4 mr-1" /> Manage
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No transfers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
      <TxnDetailDialog
        open={!!detailRow}
        onOpenChange={(v) => !v && setDetailRow(null)}
        table="transfers"
        row={detailRow}
      />
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}