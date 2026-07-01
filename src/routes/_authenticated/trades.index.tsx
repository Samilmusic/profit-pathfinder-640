import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { useCustomers } from "@/components/account-select";
import { NumberInput } from "@/components/number-input";
import { CURRENCIES, fmtProfit } from "@/lib/exchange";
import { toast } from "sonner";
import { Plus, ArrowRight } from "lucide-react";
import { RecordActions } from "@/components/record-actions";
import { EDIT_FIELDS } from "@/lib/edit-fields";

export const Route = createFileRoute("/_authenticated/trades/")({ component: Page });

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  awaiting_profit: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  awaiting_docs: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-300",
  open: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  partially_closed: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  profit_pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  loss: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  missing_receipt: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
};

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const customers = useCustomers();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<any>({
    entry_date: today, title: "", customer_id: "", counterparty_id: "",
    base_currency: "AED", quote_currency: "IRR",
    capital_amount: "", capital_currency: "AED",
    expected_profit: "", expected_profit_currency: "AED",
    milad_share_pct: 50, ali_share_pct: 50, notes: "",
  });

  const q = useQuery({
    queryKey: ["trade_cycles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trade_cycles" as any)
        .select("*, customer:customers!trade_cycles_customer_id_fkey(name), counterparty:customers!trade_cycles_counterparty_id_fkey(name)")
        .is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        entry_date: f.entry_date,
        title: f.title || null,
        customer_id: f.customer_id || null,
        counterparty_id: f.counterparty_id || null,
        base_currency: f.base_currency,
        quote_currency: f.quote_currency || null,
        capital_amount: Number(f.capital_amount || 0),
        capital_currency: f.capital_currency || f.base_currency,
        expected_profit: Number(f.expected_profit || 0),
        expected_profit_currency: f.expected_profit_currency || f.base_currency,
        milad_share_pct: Number(f.milad_share_pct),
        ali_share_pct: 100 - Number(f.milad_share_pct),
        notes: f.notes || null,
        status: "in_progress",
      };
      const { data, error } = await supabase.from("trade_cycles" as any).insert(payload).select("id").single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: (id) => {
      toast.success("Trade cycle created");
      qc.invalidateQueries({ queryKey: ["trade_cycles"] });
      setOpen(false);
      navigate({ to: "/trades/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Trade Cycles"
        description="Multi-leg trades with third-party payments and separate profit collection."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Trade</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New Trade Cycle</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label>Date</Label><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></div>
                <div><Label>Title (optional)</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. AED→IRR for Customer A" /></div>
                <div>
                  <Label>Customer</Label>
                  <Select value={f.customer_id} onValueChange={(v) => setF({ ...f, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Counterparty (optional)</Label>
                  <Select value={f.counterparty_id} onValueChange={(v) => setF({ ...f, counterparty_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Base currency</Label>
                  <Select value={f.base_currency} onValueChange={(v) => setF({ ...f, base_currency: v, capital_currency: v, expected_profit_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quote currency</Label>
                  <Select value={f.quote_currency} onValueChange={(v) => setF({ ...f, quote_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Capital used</Label><NumberInput currency={f.capital_currency} value={f.capital_amount} onChange={(v) => setF({ ...f, capital_amount: v })} /></div>
                <div>
                  <Label>Capital currency</Label>
                  <Select value={f.capital_currency} onValueChange={(v) => setF({ ...f, capital_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Expected profit</Label><NumberInput currency={f.expected_profit_currency} value={f.expected_profit} onChange={(v) => setF({ ...f, expected_profit: v })} /></div>
                <div>
                  <Label>Profit currency</Label>
                  <Select value={f.expected_profit_currency} onValueChange={(v) => setF({ ...f, expected_profit_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Milad share %</Label><Input type="number" value={f.milad_share_pct} onChange={(e) => setF({ ...f, milad_share_pct: e.target.value })} /></div>
                <div><Label>Ali share % (auto)</Label><Input type="number" value={100 - Number(f.milad_share_pct || 0)} disabled /></div>
                <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
              </div>
              <div className="flex justify-end pt-2"><Button onClick={() => create.mutate()} disabled={create.isPending}>Create Trade</Button></div>
            </DialogContent>
          </Dialog>
        }
      />

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead>
            <TableHead>Cycle</TableHead>
            <TableHead className="text-right">Initial</TableHead>
            <TableHead className="text-right">Intermediate rec / used / left</TableHead>
            <TableHead className="text-right">Returned</TableHead>
            <TableHead className="text-right">Est. profit</TableHead>
            <TableHead className="text-right">Realised</TableHead>
            <TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((t: any) => (
              <TableRow key={t.id} className="hover:bg-muted/40">
                <TableCell className="font-mono text-xs">{t.code}</TableCell>
                <TableCell>{t.entry_date}</TableCell>
                <TableCell>{t.customer?.name ?? "—"}{t.counterparty ? <span className="text-muted-foreground"> → {t.counterparty.name}</span> : null}</TableCell>
                <TableCell className="text-xs">
                  {(t.initial_currency ?? t.base_currency)}
                  {" → "}{(t.intermediate_currency ?? t.quote_currency)}
                  {" → "}{(t.final_currency ?? t.initial_currency ?? t.base_currency)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtProfit(t.initial_amount ?? t.capital_amount, t.initial_currency ?? t.capital_currency)}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  <div>{fmtProfit(t.intermediate_received, t.intermediate_currency)}</div>
                  <div className="text-muted-foreground">used {fmtProfit(t.intermediate_used, t.intermediate_currency)}</div>
                  <div className={"text-[11px] " + ((Number(t.intermediate_received||0) - Number(t.intermediate_used||0)) > 0 ? "text-amber-600" : "text-muted-foreground")}>
                    left {fmtProfit(Number(t.intermediate_received||0) - Number(t.intermediate_used||0), t.intermediate_currency)}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtProfit(t.final_returned_amount, t.final_currency ?? t.initial_currency)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtProfit(t.estimated_profit, t.intermediate_currency)}</TableCell>
                <TableCell className={"text-right font-mono text-xs font-semibold " + (Number(t.realized_profit||0) < 0 ? "text-destructive" : "text-emerald-600")}>
                  {fmtProfit(t.realized_profit, t.realized_profit_currency ?? t.initial_currency)}
                </TableCell>
                <TableCell><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[t.status] ?? ""}`}>{t.status}</span></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Link to="/trades/$id" params={{ id: t.id }} className="text-primary text-sm inline-flex items-center gap-1">Open <ArrowRight className="h-3 w-3" /></Link>
                    <RecordActions
                      table="trade_cycles"
                      row={t}
                      invalidateKeys={["trades"]}
                      fields={EDIT_FIELDS.trade_cycles}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No cycles yet. Sell AED with "Create Trade Cycle" on to auto-open one.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}