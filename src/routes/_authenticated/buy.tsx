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
import { CustomerBankAccountPicker, touchBankAccount } from "@/components/customer-bank-account-picker";
import { CURRENCIES, OWNERS, fmt } from "@/lib/exchange";
import { toast } from "sonner";
import { Plus, FileText } from "lucide-react";
import { SettlementStatusBadge } from "@/components/settlement-status-badge";
import { TxnDetailDialog } from "@/components/txn-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { RecordActions } from "@/components/record-actions";
import { EDIT_FIELDS } from "@/lib/edit-fields";

export const Route = createFileRoute("/_authenticated/buy")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<any | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const customers = useCustomers();
  const [f, setF] = useState({
    entry_date: today, bought_currency: "AED", bought_amount: "", buy_rate: "",
    paid_currency: "IRR", paid_from_account_id: "", received_into_account_id: "",
    customer_id: "", owner: "shared", notes: "", customer_bank_account_id: "",
    trade_cycle_id: "",
  });

  const paid_amount = useMemo(() => {
    const a = Number(f.bought_amount); const r = Number(f.buy_rate);
    return a && r ? a * r : 0;
  }, [f.bought_amount, f.buy_rate]);

  // Open cycles this buy could close (paid ccy = intermediate, bought ccy = initial)
  const openCyclesQ = useQuery({
    queryKey: ["v_open_cycles_for_buy", f.paid_currency, f.bought_currency],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_open_cycles").select("*")
        .eq("intermediate_currency", f.paid_currency)
        .eq("initial_currency", f.bought_currency);
      if (error) throw error;
      return (data ?? []).filter((c: any) => Number(c.intermediate_remaining) > 0);
    },
  });

  const q = useQuery({
    queryKey: ["buys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buy_transactions").select("*").is("deleted_at", null).order("entry_date", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        entry_date: f.entry_date,
        bought_currency: f.bought_currency,
        bought_amount: Number(f.bought_amount),
        buy_rate: Number(f.buy_rate),
        paid_currency: f.paid_currency,
        paid_amount,
        paid_from_account_id: f.paid_from_account_id || null,
        received_into_account_id: f.received_into_account_id || null,
        customer_id: f.customer_id || null,
        owner: f.owner,
        notes: f.notes || null,
        created_by: u.user?.id,
        trade_cycle_id: f.trade_cycle_id || null,
      };
      const { error } = await supabase.from("buy_transactions").insert(payload);
      if (error) throw error;
      await touchBankAccount(f.customer_bank_account_id);
    },
    onSuccess: () => { toast.success("Buy recorded"); qc.invalidateQueries(); setOpen(false); setF({ ...f, bought_amount: "", buy_rate: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Buy Transactions"
        description="Buy currency using an existing balance. Updates inventory and average cost."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New buy</Button></DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>New buy transaction</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid md:grid-cols-2 gap-3">
                <F label="Date"><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></F>
                <F label="Owner">
                  <Select value={f.owner} onValueChange={(v) => setF({ ...f, owner: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OWNERS.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Bought currency">
                  <Select value={f.bought_currency} onValueChange={(v) => setF({ ...f, bought_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Bought amount"><Input type="number" step="0.0001" value={f.bought_amount} onChange={(e) => setF({ ...f, bought_amount: e.target.value })} required /></F>
                <F label="Buy rate (paid per 1 bought)">
                  <div className="flex flex-col gap-1">
                    <Input type="number" step="0.00000001" value={f.buy_rate} onChange={(e) => setF({ ...f, buy_rate: e.target.value })} required />
                    {(f.bought_currency === "AED" || f.bought_currency === "USD") && (
                      <UseMarketRateButton
                        currency={f.bought_currency}
                        which="buy"
                        onApply={(r) => setF({ ...f, buy_rate: String(r) })}
                        className="self-start"
                      />
                    )}
                  </div>
                </F>
                <F label="Paid currency">
                  <Select value={f.paid_currency} onValueChange={(v) => setF({ ...f, paid_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Paid amount (auto)"><Input readOnly value={paid_amount ? fmt(paid_amount, f.paid_currency) : ""} /></F>
                <F label="Paid from account"><AccountSelect currency={f.paid_currency} value={f.paid_from_account_id} onChange={(v) => setF({ ...f, paid_from_account_id: v })} /></F>
                <F label="Received into account"><AccountSelect currency={f.bought_currency} value={f.received_into_account_id} onChange={(v) => setF({ ...f, received_into_account_id: v })} /></F>
                <F label="Counterparty / customer">
                  <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <div className="md:col-span-2">
                  <CustomerBankAccountPicker
                    customerId={f.customer_id || null}
                    currency={f.paid_currency}
                    value={f.customer_bank_account_id || null}
                    onChange={(id) => setF((p) => ({ ...p, customer_bank_account_id: id ?? "" }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <F label={`Link to open Trade Cycle (buyback ${f.paid_currency} → ${f.bought_currency})`}>
                    <Select value={f.trade_cycle_id || "none"} onValueChange={(v) => setF({ ...f, trade_cycle_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Not linked (treated as fresh buy)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not linked</SelectItem>
                        {(openCyclesQ.data ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.code} · {fmt(c.intermediate_remaining, c.intermediate_currency)} {c.intermediate_currency} left · initial {fmt(c.initial_amount, c.initial_currency)} @ {fmt(c.sell_rate)}
                          </SelectItem>
                        ))}
                        {(openCyclesQ.data ?? []).length === 0 && (
                          <div className="px-2 py-3 text-xs text-muted-foreground text-center">No open cycles awaiting {f.paid_currency}→{f.bought_currency} buyback.</div>
                        )}
                      </SelectContent>
                    </Select>
                    {f.trade_cycle_id && (
                      <Badge variant="outline" className="mt-2 text-[11px]">Realised profit will post to this cycle on save.</Badge>
                    )}
                  </F>
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
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Bought</TableHead><TableHead>Rate</TableHead><TableHead>Paid</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.entry_date}</TableCell>
                <TableCell className="font-mono">{fmt(r.bought_amount, r.bought_currency)}</TableCell>
                <TableCell className="font-mono">{fmt(r.buy_rate)}</TableCell>
                <TableCell className="font-mono">{fmt(r.paid_amount, r.paid_currency)}</TableCell>
                <TableCell className="capitalize">{r.owner}</TableCell>
                <TableCell><SettlementStatusBadge value={r.settlement_status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setDetailRow(r)}>
                      <FileText className="h-4 w-4 mr-1" /> Manage
                    </Button>
                    <RecordActions
                      table="buy_transactions"
                      row={r}
                      onView={() => setDetailRow(r)}
                      invalidateKeys={["buys"]}
                      fields={EDIT_FIELDS.buy_transactions}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No buys yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
      <TxnDetailDialog
        open={!!detailRow}
        onOpenChange={(v) => !v && setDetailRow(null)}
        table="buy_transactions"
        row={detailRow}
        showHolders
      />
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}