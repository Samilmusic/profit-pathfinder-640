import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AccountSelect, useCustomers } from "@/components/account-select";
import { NumberInput } from "@/components/number-input";
import { CURRENCIES, fmt, fmtProfit } from "@/lib/exchange";
import { DocumentsPanel } from "@/components/documents-panel";
import { toast } from "sonner";
import { Plus, CheckCircle2, XCircle, Clock, ArrowLeft, Lock, DollarSign, ArrowDown, ChevronDown, ChevronRight, User, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/trades/$id")({ component: Page });

const MOVEMENT_LABELS: Record<string, string> = {
  send_money: "Send money",
  receive_money: "Receive money",
  pay_third_party: "Pay to 3rd party",
  receive_third_party: "Receive from 3rd party",
  profit_collection: "Profit collection",
  expense: "Expense",
  service_charge: "Service charge",
  internal_transfer: "Internal transfer",
  settlement: "Settlement",
};
const PARTY_LABELS: Record<string, string> = {
  our_account: "Our account",
  customer_account: "Customer account",
  customer: "Customer",
  ali: "Ali",
  milad: "Milad",
  external_person: "External person",
  cash: "Cash",
  other: "Other",
};
const STATUS_ICON: Record<string, any> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  in_transit: <Clock className="h-3.5 w-3.5" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5" />,
  failed: <XCircle className="h-3.5 w-3.5" />,
  waived: <XCircle className="h-3.5 w-3.5" />,
};

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const customers = useCustomers();

  const tradeQ = useQuery({
    queryKey: ["trade_cycle", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("trade_cycles" as any)
        .select("*, customer:customers!trade_cycles_customer_id_fkey(name), counterparty:customers!trade_cycles_counterparty_id_fkey(name)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const movementsQ = useQuery({
    queryKey: ["trade_movements", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("trade_movements" as any)
        .select("*").eq("trade_id", id).is("deleted_at", null).order("seq").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const profitQ = useQuery({
    queryKey: ["trade_profits", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("trade_profit_collections" as any)
        .select("*").eq("trade_id", id).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const docsQ = useQuery({
    queryKey: ["trade_movement_docs", id],
    enabled: !!movementsQ.data,
    queryFn: async () => {
      const ids = (movementsQ.data ?? []).map((m: any) => m.id);
      if (ids.length === 0) return {};
      const { data } = await supabase.from("documents").select("ref_id").eq("ref_type", "trade_movement").in("ref_id", ids);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((d: any) => { counts[d.ref_id] = (counts[d.ref_id] ?? 0) + 1; });
      return counts;
    },
  });

  const auditQ = useQuery({
    queryKey: ["trade_audit", id],
    queryFn: async () => {
      const { data } = await supabase.from("audit_events")
        .select("*").or(`entity_id.eq.${id}`)
        .order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const t = tradeQ.data;
  const readOnly = t?.status === "completed" || t?.status === "cancelled";

  const closeTrade = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trade_cycles" as any).update({ status: "completed", final_profit_confirmed: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Trade closed"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("trade_cycles" as any).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["trade_cycle", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const confirmProfit = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase.from("trade_cycles" as any).update({ final_profit_confirmed: v }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trade_cycle", id] }),
  });

  if (tradeQ.isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!t) return <div className="p-6">Trade not found. <Link to="/trades" className="text-primary">Back</Link></div>;

  return (
    <div>
      <div className="mb-3"><Link to="/trades" className="text-sm text-muted-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> All trades</Link></div>
      <PageHeader
        title={`Trade ${t.code}`}
        description={t.title || `${t.base_currency}${t.quote_currency ? "/" + t.quote_currency : ""}`}
        actions={
          <>
            {!readOnly && (
              <>
                <Select value={t.status} onValueChange={(v) => setStatus.mutate(v)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="awaiting_profit">Awaiting profit</SelectItem>
                    <SelectItem value="awaiting_docs">Awaiting docs</SelectItem>
                    <SelectItem value="cancelled">Cancel</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => closeTrade.mutate()} disabled={closeTrade.isPending}><Lock className="h-4 w-4 mr-2" />Close Trade</Button>
              </>
            )}
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Kpi label="Capital" value={fmtProfit(t.capital_amount, t.capital_currency)} />
        <Kpi label="Expected profit" value={fmtProfit(t.expected_profit, t.expected_profit_currency)} />
        <Kpi label="Received profit" value={fmtProfit(t.received_profit, t.expected_profit_currency)} tone="good" />
        <Kpi label="Pending profit" value={fmtProfit(t.pending_profit, t.expected_profit_currency)} tone="warn" />
        <Kpi label="Expenses" value={fmtProfit(t.related_expenses, t.expected_profit_currency)} />
        <Kpi label="Net profit" value={fmtProfit(t.net_profit, t.expected_profit_currency)} tone="good" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground mb-1">Customer</div>
          <div className="font-medium">{t.customer?.name ?? "—"}</div>
          {t.counterparty && <div className="text-sm text-muted-foreground mt-1">Counterparty: {t.counterparty.name}</div>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground mb-1">Profit share</div>
          <div className="text-sm">Milad {t.milad_share_pct}% · <span className="font-medium">{fmtProfit(t.milad_profit, t.expected_profit_currency)}</span></div>
          <div className="text-sm">Ali {t.ali_share_pct}% · <span className="font-medium">{fmtProfit(t.ali_profit, t.expected_profit_currency)}</span></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground mb-1">Closing checklist</div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={t.final_profit_confirmed} onCheckedChange={(v) => confirmProfit.mutate(!!v)} disabled={readOnly} />
            Final profit confirmed
          </label>
          <div className="text-xs text-muted-foreground mt-2">Status: <b>{t.status}</b></div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="matrix" className="mb-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="matrix">Settlement Matrix</TabsTrigger>
          <TabsTrigger value="movements">Movements ({(movementsQ.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="profits">Profits ({(profitQ.data ?? []).length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-4">
          <SettlementMatrix rows={movementsQ.data ?? []} docCounts={docsQ.data ?? {}} />
        </TabsContent>

        <TabsContent value="movements" className="mt-4 space-y-3">
          {!readOnly && <AddMovement tradeId={id} defaultCurrency={t.base_currency} />}
          {(movementsQ.data ?? []).map((m: any) => (
            <MovementCard key={m.id} m={m} docCount={(docsQ.data as any)?.[m.id] ?? 0} readOnly={readOnly} />
          ))}
          {(movementsQ.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">No movements yet.</div>}
        </TabsContent>

        <TabsContent value="profits" className="mt-4 space-y-3">
          {!readOnly && <AddProfit tradeId={id} defaultCurrency={t.expected_profit_currency || t.base_currency} />}
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Account</TableHead><TableHead>Received by</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {(profitQ.data ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.entry_date}</TableCell>
                    <TableCell>{fmtProfit(p.amount, p.currency)}</TableCell>
                    <TableCell className="text-xs">{p.account_id ?? "—"}</TableCell>
                    <TableCell>{p.received_by ?? "—"}</TableCell>
                    <TableCell>{p.status}</TableCell>
                  </TableRow>
                ))}
                {(profitQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No profit collections.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card><CardContent className="p-4">
            <ol className="relative border-l border-border pl-4 space-y-4">
              {[...(movementsQ.data ?? []), ...(profitQ.data ?? []).map((p: any) => ({ ...p, movement_type: "profit_collection", is_profit: true }))]
                .sort((a: any, b: any) => (a.created_at || "").localeCompare(b.created_at || ""))
                .map((e: any) => (
                  <li key={e.id} className="ml-2">
                    <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-primary" />
                    <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                    <div className="text-sm"><b>{MOVEMENT_LABELS[e.movement_type] ?? e.movement_type}</b> · {fmtProfit(e.amount, e.currency)} · {e.status}</div>
                    {e.notes && <div className="text-xs text-muted-foreground">{e.notes}</div>}
                  </li>
                ))}
            </ol>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Entity</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(auditQ.data ?? []).map((a: any) => (
                  <TableRow key={a.id}><TableCell className="text-xs">{new Date(a.created_at).toLocaleString()}</TableCell><TableCell className="text-xs">{a.entity_type}</TableCell><TableCell className="text-xs">{a.action}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {t.notes && <Card className="mt-4"><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground mb-1">Notes</div><div className="text-sm whitespace-pre-wrap">{t.notes}</div></CardContent></Card>}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const cls = tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <Card><CardContent className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${cls}`}>{value}</div>
    </CardContent></Card>
  );
}

function SettlementMatrix({ rows, docCounts }: { rows: any[]; docCounts: Record<string, number> }) {
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Type</TableHead><TableHead>From</TableHead><TableHead></TableHead><TableHead>To</TableHead>
          <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead>Proof</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((m: any) => (
            <TableRow key={m.id}>
              <TableCell className="text-xs">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</TableCell>
              <TableCell className="text-xs">{m.from_label || PARTY_LABELS[m.from_kind] || "—"}</TableCell>
              <TableCell>→</TableCell>
              <TableCell className="text-xs">{m.to_label || PARTY_LABELS[m.to_kind] || "—"}</TableCell>
              <TableCell className="text-right font-medium">{fmtProfit(m.amount, m.currency)}</TableCell>
              <TableCell className="text-xs inline-flex items-center gap-1">{STATUS_ICON[m.status]} {m.status}</TableCell>
              <TableCell className="text-xs">
                {docCounts[m.id] ? <span className="text-emerald-600">✓ {docCounts[m.id]}</span> : (m.doc_required ? <span className="text-red-600">Missing</span> : <span className="text-muted-foreground">—</span>)}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No movements yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function AddMovement({ tradeId, defaultCurrency }: { tradeId: string; defaultCurrency: string }) {
  const qc = useQueryClient();
  const customers = useCustomers();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<any>({
    entry_date: today, movement_type: "send_money",
    from_kind: "our_account", from_account_id: "", from_customer_id: "", from_label: "",
    to_kind: "customer", to_account_id: "", to_customer_id: "", to_label: "",
    amount: "", currency: defaultCurrency, rate: "", purpose: "",
    related_customer_id: "", doc_required: true, status: "pending", notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        trade_id: tradeId, entry_date: f.entry_date, movement_type: f.movement_type,
        from_kind: f.from_kind, from_account_id: f.from_account_id || null, from_customer_id: f.from_customer_id || null, from_label: f.from_label || null,
        to_kind: f.to_kind, to_account_id: f.to_account_id || null, to_customer_id: f.to_customer_id || null, to_label: f.to_label || null,
        amount: Number(f.amount || 0), currency: f.currency, rate: f.rate ? Number(f.rate) : null,
        purpose: f.purpose || null, related_customer_id: f.related_customer_id || null,
        doc_required: f.doc_required, status: f.status, notes: f.notes || null,
      };
      const { error } = await supabase.from("trade_movements" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Movement added"); qc.invalidateQueries(); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Movement</Button></DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Movement</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></div>
          <div>
            <Label>Movement type</Label>
            <Select value={f.movement_type} onValueChange={(v) => setF({ ...f, movement_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MOVEMENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <fieldset className="md:col-span-2 border rounded-lg p-3">
            <legend className="text-xs px-1 text-muted-foreground">FROM</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Select value={f.from_kind} onValueChange={(v) => setF({ ...f, from_kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PARTY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              {f.from_kind === "our_account" && <div className="md:col-span-2"><AccountSelect value={f.from_account_id} onChange={(v) => setF({ ...f, from_account_id: v })} currency={f.currency} placeholder="Our account" /></div>}
              {(f.from_kind === "customer_account" || f.from_kind === "customer") && (
                <div className="md:col-span-2">
                  <Select value={f.from_customer_id} onValueChange={(v) => setF({ ...f, from_customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Customer" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {["external_person", "cash", "other", "ali", "milad"].includes(f.from_kind) && (
                <div className="md:col-span-2"><Input placeholder="Label (e.g. name of person / bank)" value={f.from_label} onChange={(e) => setF({ ...f, from_label: e.target.value })} /></div>
              )}
            </div>
          </fieldset>

          <fieldset className="md:col-span-2 border rounded-lg p-3">
            <legend className="text-xs px-1 text-muted-foreground">TO</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Select value={f.to_kind} onValueChange={(v) => setF({ ...f, to_kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PARTY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              {f.to_kind === "our_account" && <div className="md:col-span-2"><AccountSelect value={f.to_account_id} onChange={(v) => setF({ ...f, to_account_id: v })} currency={f.currency} placeholder="Our account" /></div>}
              {(f.to_kind === "customer_account" || f.to_kind === "customer") && (
                <div className="md:col-span-2">
                  <Select value={f.to_customer_id} onValueChange={(v) => setF({ ...f, to_customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Customer" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {["external_person", "cash", "other", "ali", "milad"].includes(f.to_kind) && (
                <div className="md:col-span-2"><Input placeholder="Label" value={f.to_label} onChange={(e) => setF({ ...f, to_label: e.target.value })} /></div>
              )}
            </div>
          </fieldset>

          <div>
            <Label>Currency</Label>
            <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Amount</Label><NumberInput currency={f.currency} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></div>
          <div><Label>Rate (optional)</Label><NumberInput value={f.rate} onChange={(v) => setF({ ...f, rate: v })} /></div>
          <div><Label>Purpose</Label><Input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></div>

          <div>
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_transit">In transit</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="waived">Waived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 mt-6 text-sm"><Checkbox checked={f.doc_required} onCheckedChange={(v) => setF({ ...f, doc_required: !!v })} />Document required</label>

          <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>
        <div className="flex justify-end"><Button onClick={() => create.mutate()} disabled={create.isPending}>Add Movement</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function MovementCard({ m, docCount, readOnly }: { m: any; docCount: number; readOnly: boolean }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("trade_movements" as any).update({ status }).eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Updated"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <div className="text-sm font-medium">{MOVEMENT_LABELS[m.movement_type]} · {fmtProfit(m.amount, m.currency)}</div>
            <div className="text-xs text-muted-foreground">{m.from_label || PARTY_LABELS[m.from_kind]} → {m.to_label || PARTY_LABELS[m.to_kind]} · {m.entry_date}</div>
          </div>
          <div className="flex items-center gap-2">
            {!readOnly ? (
              <Select value={m.status} onValueChange={(v) => setStatus.mutate(v)}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_transit">In transit</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="waived">Waived</SelectItem>
                </SelectContent>
              </Select>
            ) : <span className="text-xs">{m.status}</span>}
            <Button size="sm" variant="outline" onClick={() => setExpanded(!expanded)}>{docCount ? `${docCount} docs` : "Docs"}</Button>
          </div>
        </div>
        {expanded && <div className="mt-3 border-t pt-3"><DocumentsPanel refType="trade_movement" refId={m.id} compact /></div>}
      </CardContent>
    </Card>
  );
}

function AddProfit({ tradeId, defaultCurrency }: { tradeId: string; defaultCurrency: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<any>({
    entry_date: today, amount: "", currency: defaultCurrency,
    account_id: "", received_by: "milad", status: "received", notes: "",
  });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trade_profit_collections" as any).insert({
        trade_id: tradeId, entry_date: f.entry_date, amount: Number(f.amount || 0),
        currency: f.currency, account_id: f.account_id || null, received_by: f.received_by,
        status: f.status, notes: f.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profit recorded"); qc.invalidateQueries(); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary"><DollarSign className="h-4 w-4 mr-2" />Record Profit</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record Profit Collection</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></div>
          <div><Label>Currency</Label><Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Amount</Label><NumberInput currency={f.currency} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></div>
          <div><Label>Status</Label><Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="received">Received</SelectItem><SelectItem value="waived">Waived</SelectItem><SelectItem value="kept_in_wallet">Kept in wallet</SelectItem></SelectContent></Select></div>
          <div className="col-span-2"><Label>Account (if received)</Label><AccountSelect value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} currency={f.currency} /></div>
          <div><Label>Received by</Label><Select value={f.received_by} onValueChange={(v) => setF({ ...f, received_by: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="milad">Milad</SelectItem><SelectItem value="ali">Ali</SelectItem><SelectItem value="cash_box">Cash Box</SelectItem><SelectItem value="bank">Bank</SelectItem></SelectContent></Select></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>
        <div className="flex justify-end"><Button onClick={() => create.mutate()} disabled={create.isPending}>Save</Button></div>
      </DialogContent>
    </Dialog>
  );
}