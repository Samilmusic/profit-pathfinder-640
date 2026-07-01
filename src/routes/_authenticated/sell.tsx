import { createFileRoute, Link } from "@tanstack/react-router";
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
import { maskAccount } from "@/components/customer-bank-account-form";
import { CURRENCIES, fmt } from "@/lib/exchange";
import { toast } from "sonner";
import { Plus, FileText } from "lucide-react";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { TxnDetailDialog } from "@/components/txn-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RecordActions } from "@/components/record-actions";

export const Route = createFileRoute("/_authenticated/sell")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<any | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const customers = useCustomers();

  const [f, setF] = useState({
    entry_date: today, sold_currency: "AED", sold_amount: "", sell_rate: "",
    received_currency: "IRR", sold_from_account_id: "", received_into_account_id: "",
    customer_id: "", customer_phone: "", customer_account: "", customer_bank_account_id: "",
    milad_pct: "50", ali_pct: "50", notes: "", expected_payment_date: "",
    creates_cycle: true,
  });

  const received_amount = useMemo(() => {
    const a = Number(f.sold_amount); const r = Number(f.sell_rate);
    return a && r ? a * r : 0;
  }, [f.sold_amount, f.sell_rate]);

  // FIFO preview: pull available lots for current source & currency
  const lots = useQuery({
    queryKey: ["sell-fifo-lots", f.sold_currency, f.sold_from_account_id],
    enabled: !!f.sold_currency,
    queryFn: async () => {
      let q = supabase
        .from("inventory_lots_view")
        .select("*")
        .eq("currency", f.sold_currency)
        .gt("remaining_amount", 0)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (f.sold_from_account_id) q = q.eq("account_id", f.sold_from_account_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const preview = useMemo(() => {
    const want = Number(f.sold_amount) || 0;
    const rate = Number(f.sell_rate) || 0;
    const rows: Array<{ lot: any; take: number; cost: number; received: number; profit: number | null }> = [];
    let remaining = want;
    let totalCost = 0;
    let costCcy: string | null = null;
    for (const l of lots.data ?? []) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(l.remaining_amount));
      if (!costCcy) costCcy = l.cost_basis_currency;
      const cost = take * Number(l.cost_basis_rate);
      const received = take * rate;
      const receivedMatches = l.cost_basis_currency === f.received_currency;
      rows.push({ lot: l, take, cost, received, profit: receivedMatches ? received - cost : null });
      totalCost += cost;
      remaining -= take;
    }
    const covered = want - remaining;
    const blended = covered > 0 ? totalCost / covered : 0;
    const receivedCcyMatchesCost = costCcy && costCcy === f.received_currency;
    const gross = receivedCcyMatchesCost ? received_amount - totalCost : 0;
    const milad = gross * Number(f.milad_pct || 0) / 100;
    const ali = gross * Number(f.ali_pct || 0) / 100;
    const available = (lots.data ?? []).reduce((s, l) => s + Number(l.remaining_amount), 0);
    return { rows, covered, shortfall: Math.max(0, remaining), totalCost, blended, costCcy, gross, milad, ali, available, receivedCcyMatchesCost };
  }, [lots.data, f.sold_amount, f.sell_rate, f.received_currency, f.milad_pct, f.ali_pct, received_amount]);

  const q = useQuery({
    queryKey: ["sells"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sell_transactions").select("*").is("deleted_at", null).order("entry_date", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (opts: { closeNow: boolean }) => {
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
        customer_account: f.customer_account || null,
        milad_share_pct: milad, ali_share_pct: ali,
        notes: f.notes || null,
        created_by: u.user?.id,
        creates_cycle: f.creates_cycle,
        expected_payment_date: f.expected_payment_date || null,
        deal_status: "open",
      };
      const { data: inserted, error } = await supabase.from("sell_transactions").insert(payload).select("id").single();
      if (error) throw error;
      await touchBankAccount(f.customer_bank_account_id);
      if (opts.closeNow && inserted?.id) {
        const { error: cerr } = await (supabase as any).rpc("close_sell_deal", { _id: inserted.id, _override: true, _difference_reason: null });
        if (cerr) throw cerr;
      }
      return inserted?.id as string | undefined;
    },
    onSuccess: (_id, vars) => {
      toast.success(vars.closeNow ? "Deal closed" : "Open deal saved — waiting for payment");
      qc.invalidateQueries();
      setOpen(false);
      setF({ ...f, sold_amount: "", sell_rate: "", notes: "" });
    },
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
              <DialogHeader><DialogTitle>New sell — Open Deal</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate({ closeNow: false }); }} className="grid md:grid-cols-2 gap-3">
                <F label="Date"><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></F>
                <F label="Customer">
                  <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <div className="md:col-span-2">
                  <CustomerBankAccountPicker
                    customerId={f.customer_id || null}
                    currency={f.received_currency}
                    value={f.customer_bank_account_id || null}
                    onChange={(id, row) => setF((prev) => ({
                      ...prev,
                      customer_bank_account_id: id ?? "",
                      customer_account: row ? `${row.bank_name} ${row.currency} ${maskAccount(row.card_number || row.account_number || row.iban) || ""}`.trim() : prev.customer_account,
                    }))}
                  />
                </div>
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
                <F label="Sold from account (source)"><AccountSelect currency={f.sold_currency} value={f.sold_from_account_id} onChange={(v) => setF({ ...f, sold_from_account_id: v })} /></F>
                <F label={`Received into ${f.received_currency} account (required to close deal)`}>
                  <AccountSelect currency={f.received_currency} value={f.received_into_account_id} onChange={(v) => setF({ ...f, received_into_account_id: v })} placeholder={`Pick a ${f.received_currency} account`} />
                  {!f.received_into_account_id && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Optional for Open Deal · required before closing.
                    </div>
                  )}
                </F>
                <F label="Expected payment date (optional)">
                  <Input type="date" value={f.expected_payment_date} onChange={(e) => setF({ ...f, expected_payment_date: e.target.value })} />
                </F>
                <div className="md:col-span-2">
                  <Card className="bg-muted/40 border-dashed">
                    <CardContent className="p-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">FIFO cost preview</span>
                        <Badge variant="outline" className="font-mono">Available: {fmt(preview.available, f.sold_currency)} {f.sold_currency}</Badge>
                      </div>
                      {preview.shortfall > 0 && Number(f.sold_amount) > 0 && (
                        <div className="text-destructive text-xs">
                          Not enough inventory — short by {fmt(preview.shortfall, f.sold_currency)} {f.sold_currency}.
                        </div>
                      )}
                      {preview.rows.length > 0 && (
                        <div className="space-y-1">
                          {preview.rows.map(({ lot, take }) => (
                            <div key={lot.id} className="flex justify-between font-mono text-xs">
                              <span>{lot.lot_code} · {lot.account_name || "—"}</span>
                              <span>{fmt(take, f.sold_currency)} × {fmt(lot.cost_basis_rate)} {lot.cost_basis_currency}/{f.sold_currency}</span>
                            </div>
                          ))}
                          {preview.rows.some(r => r.profit !== null) && (
                            <div className="mt-2 rounded border bg-background/60 p-2 space-y-1">
                              <div className="text-[11px] font-medium text-muted-foreground">Per-lot profit</div>
                              {preview.rows.map(({ lot, take, cost, received, profit }) => (
                                <div key={"p-" + lot.id} className="grid grid-cols-4 gap-2 font-mono text-[11px]">
                                  <span className="truncate">{lot.lot_code}</span>
                                  <span className="text-right">{fmt(take, f.sold_currency)}</span>
                                  <span className="text-right text-muted-foreground">c {fmt(cost)} / r {fmt(received)}</span>
                                  <span className={"text-right " + (profit === null ? "text-muted-foreground" : profit >= 0 ? "text-accent" : "text-destructive")}>
                                    {profit === null ? "—" : fmt(profit)} {lot.cost_basis_currency}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="border-t pt-1 grid grid-cols-2 gap-2 text-xs">
                            <div>Blended cost rate</div><div className="text-right font-mono">{fmt(preview.blended)} {preview.costCcy}/{f.sold_currency}</div>
                            <div>Sell rate</div><div className="text-right font-mono">{fmt(Number(f.sell_rate) || 0)}</div>
                            <div>Cost basis</div><div className="text-right font-mono">{fmt(preview.totalCost)} {preview.costCcy}</div>
                            <div>Received</div><div className="text-right font-mono">{fmt(received_amount)} {f.received_currency}</div>
                            <div className="font-medium">Expected profit</div>
                            <div className={"text-right font-mono " + (preview.gross >= 0 ? "text-accent" : "text-destructive")}>
                              {preview.receivedCcyMatchesCost ? `${fmt(preview.gross)} ${preview.costCcy}` : "—"}
                            </div>
                            <div>Milad share</div><div className="text-right font-mono">{fmt(preview.milad)}</div>
                            <div>Ali share</div><div className="text-right font-mono">{fmt(preview.ali)}</div>
                          </div>
                          {!preview.receivedCcyMatchesCost && preview.costCcy && (
                            <div className="text-xs text-muted-foreground">
                              Profit not shown: received currency ({f.received_currency}) differs from cost basis currency ({preview.costCcy}).
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <F label="Customer phone"><Input value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} /></F>
                <F label="Customer account/card ref"><Input value={f.customer_account} onChange={(e) => setF({ ...f, customer_account: e.target.value })} /></F>
                <F label="Milad %"><Input type="number" value={f.milad_pct} onChange={(e) => setF({ ...f, milad_pct: e.target.value, ali_pct: String(100 - Number(e.target.value)) })} /></F>
                <F label="Ali %"><Input type="number" value={f.ali_pct} onChange={(e) => setF({ ...f, ali_pct: e.target.value, milad_pct: String(100 - Number(e.target.value)) })} /></F>
                <div className="md:col-span-2"><F label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></F></div>
                <div className="md:col-span-2 flex items-center justify-between rounded-md border border-dashed p-3 bg-muted/30">
                  <div>
                    <div className="text-sm font-medium">Create Trade Cycle (Cycle Profit)</div>
                    <div className="text-xs text-muted-foreground">
                      Track profit only when {f.received_currency} is later converted back to {f.sold_currency}. Off = instant profit.
                    </div>
                  </div>
                  <Switch checked={f.creates_cycle} onCheckedChange={(v) => setF({ ...f, creates_cycle: v })} />
                </div>
                <div className="md:col-span-2 flex justify-end gap-2">
                  <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      create.isPending || !f.sold_amount || !f.sell_rate ||
                      !f.sold_from_account_id || preview.shortfall > 0 ||
                      !f.received_into_account_id
                    }
                    onClick={() => create.mutate({ closeNow: true })}
                    title="Same-day cash: post received leg immediately"
                  >Save &amp; Close Now</Button>
                  <Button
                    type="submit"
                    disabled={
                      create.isPending || !f.sold_amount || !f.sell_rate ||
                      !f.sold_from_account_id || preview.shortfall > 0
                    }
                    title={
                      preview.shortfall > 0
                        ? `Not enough inventory (short ${fmt(preview.shortfall, f.sold_currency)})`
                        : !f.sold_from_account_id
                          ? "Pick the source account for the sold currency"
                          : "Inventory decreases now; customer owes the receivable"
                    }
                  >Save as Open Deal</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Sold</TableHead><TableHead>Rate</TableHead><TableHead>Received</TableHead><TableHead className="text-right">Profit</TableHead><TableHead className="text-right">Milad</TableHead><TableHead className="text-right">Ali</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link to="/sells/$id" params={{ id: r.id }} className="underline decoration-dotted underline-offset-2">{r.entry_date}</Link>
                </TableCell>
                <TableCell className="font-mono">{fmt(r.sold_amount, r.sold_currency)}</TableCell>
                <TableCell className="font-mono">{fmt(r.sell_rate)}</TableCell>
                <TableCell className="font-mono">{fmt(r.received_amount, r.received_currency)}</TableCell>
                <TableCell className="text-right font-mono text-accent">{fmt(r.gross_profit)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.milad_profit)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.ali_profit)}</TableCell>
                <TableCell><DealStatusBadge value={r.deal_status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/sells/$id" params={{ id: r.id }}>
                        <FileText className="h-4 w-4 mr-1" /> Open deal
                      </Link>
                    </Button>
                    <RecordActions
                      table="sell_transactions"
                      row={r}
                      onView={() => setDetailRow(r)}
                      invalidateKeys={["sells"]}
                      fields={[
                        { key: "entry_date", label: "Date", type: "date" },
                        { key: "sold_amount", label: "Sold amount", type: "number", step: "0.0001" },
                        { key: "sell_rate", label: "Sell rate", type: "number", step: "0.00000001" },
                        { key: "sold_currency", label: "Sold currency", type: "select", options: CURRENCIES.map((c: string) => ({ value: c, label: c })) },
                        { key: "received_currency", label: "Received currency", type: "select", options: CURRENCIES.map((c: string) => ({ value: c, label: c })) },
                        { key: "received_amount", label: "Received amount", type: "number", step: "0.0001" },
                        { key: "notes", label: "Notes", type: "textarea" },
                      ]}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No sells yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
      <TxnDetailDialog
        open={!!detailRow}
        onOpenChange={(v) => !v && setDetailRow(null)}
        table="sell_transactions"
        row={detailRow}
        showHolders
      />
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}