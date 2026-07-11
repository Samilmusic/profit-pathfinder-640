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

  const movements = movementsQ.data ?? [];
  const profits = profitQ.data ?? [];
  const docCounts = docsQ.data ?? {};

  // ---- Derive summary
  const giveAmount = t.initial_amount ?? t.capital_amount;
  const giveCcy = t.initial_currency ?? t.capital_currency;
  const receiveAmount = t.final_returned_amount ?? t.intermediate_received;
  const receiveCcy = t.final_currency ?? t.intermediate_currency ?? t.quote_currency;
  const userRate = t.sell_rate;
  const marketRate = t.reference_sell_rate ?? t.reference_mid_rate;
  const rateDiff = userRate && marketRate ? Number(userRate) - Number(marketRate) : null;
  const spreadPct = userRate && marketRate ? ((Number(userRate) - Number(marketRate)) / Number(marketRate)) * 100 : null;
  const profitCcy = t.realized_profit_currency || t.expected_profit_currency || giveCcy;
  const profitAmount = t.realized_profit ?? t.received_profit ?? t.expected_profit ?? 0;

  // ---- Derive progress steps
  const sendMovs = movements.filter((m: any) => ["send_money", "pay_third_party"].includes(m.movement_type));
  const recvMovs = movements.filter((m: any) => ["receive_money", "receive_third_party"].includes(m.movement_type));
  const sendDone = sendMovs.some((m: any) => m.status === "completed");
  const recvDone = recvMovs.some((m: any) => m.status === "completed");
  const sendDocOk = sendMovs.some((m: any) => (docCounts as any)[m.id] > 0);
  const recvDocOk = recvMovs.some((m: any) => (docCounts as any)[m.id] > 0);
  const closed = t.status === "completed";
  const steps = [
    { key: "created", label: "Trade Created", done: true },
    { key: "paid", label: "Customer Paid", done: recvDone },
    { key: "receipt", label: "Receipt Verified", done: recvDocOk },
    { key: "delivered", label: "Currency Delivered", done: sendDone },
    { key: "proof", label: "Delivery Proof", done: sendDocOk },
    { key: "closed", label: "Closed", done: closed },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);

  const statusMeta =
    t.status === "completed" ? { dot: "bg-emerald-500", label: "Closed", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" } :
    t.status === "cancelled" ? { dot: "bg-muted-foreground", label: "Cancelled", cls: "text-muted-foreground bg-muted border-border" } :
    t.status === "awaiting_profit" ? { dot: "bg-amber-500", label: "Awaiting Profit", cls: "text-amber-800 bg-amber-50 border-amber-200" } :
    t.status === "awaiting_docs" ? { dot: "bg-orange-500", label: "Awaiting Docs", cls: "text-orange-800 bg-orange-50 border-orange-200" } :
    t.status === "in_progress" ? { dot: "bg-sky-500", label: "In Progress", cls: "text-sky-800 bg-sky-50 border-sky-200" } :
    { dot: "bg-muted-foreground", label: "Draft", cls: "text-muted-foreground bg-muted border-border" };

  const settlementLabel = closed ? "Completed" : sendDone && recvDone ? "Delivered & Received" : sendDone ? "Delivered" : recvDone ? "Received" : "Pending";

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Back / Actions strip */}
      <div className="flex items-center justify-between gap-2">
        <Link to="/trades" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All trades
        </Link>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Select value={t.status} onValueChange={(v) => setStatus.mutate(v)}>
              <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="awaiting_profit">Awaiting profit</SelectItem>
                <SelectItem value="awaiting_docs">Awaiting docs</SelectItem>
                <SelectItem value="cancelled">Cancel</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => closeTrade.mutate()} disabled={closeTrade.isPending}>
              <Lock className="h-4 w-4 mr-2" />Close Trade
            </Button>
          </div>
        )}
      </div>

      {/* ============ DEAL SUMMARY ============ */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Deal</div>
              <div className="text-2xl font-semibold mt-0.5">#{t.code}</div>
            </div>
            <Badge variant="outline" className={cn("gap-1.5 py-1 px-3 text-xs font-medium", statusMeta.cls)}>
              <span className={cn("h-2 w-2 rounded-full", statusMeta.dot)} />
              {statusMeta.label}
            </Badge>
          </div>

          {/* Customer + Trade flow */}
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] items-center mb-6">
            <div className="space-y-4">
              <SummaryLine label="Customer" value={t.customer?.name ?? "—"} icon={<User className="h-3.5 w-3.5" />} />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Trade</div>
                <div className="flex flex-col gap-1">
                  <div className="text-2xl font-semibold tabular-nums">
                    {fmt(giveAmount, giveCcy)} <span className="text-muted-foreground text-lg font-normal">{giveCcy}</span>
                  </div>
                  <ArrowDown className="h-4 w-4 text-muted-foreground my-0.5" />
                  <div className="text-2xl font-semibold tabular-nums">
                    {fmt(receiveAmount, receiveCcy)} <span className="text-muted-foreground text-lg font-normal">{receiveCcy}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rate / Market / Diff / Profit / Settlement / Created */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4 pt-6 border-t">
            <SummaryField label="Rate" value={userRate ? `${fmt(userRate)}` : "—"} sub={userRate && giveCcy && receiveCcy ? `${giveCcy}/${receiveCcy}` : ""} />
            <SummaryField label="Market" value={marketRate ? fmt(marketRate) : "—"} />
            <SummaryField
              label="Difference"
              value={rateDiff != null ? `${rateDiff > 0 ? "+" : ""}${fmt(rateDiff)}` : "—"}
              sub={rateDiff != null && giveCcy && receiveCcy ? `${giveCcy} per ${receiveCcy}` : ""}
              tone={rateDiff == null ? undefined : rateDiff <= 0 ? "good" : "warn"}
            />
            <SummaryField
              label="Gross Profit"
              value={fmtProfit(profitAmount, profitCcy)}
              tone={Number(profitAmount) > 0 ? "good" : Number(profitAmount) < 0 ? "bad" : undefined}
            />
            <SummaryField label="Settlement" value={settlementLabel} />
            <SummaryField label="Created" value={new Date(t.created_at || t.entry_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} />
          </div>
        </CardContent>
      </Card>

      {/* ============ PROGRESS ============ */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Progress</div>
        <ol className="flex items-center gap-2 overflow-x-auto pb-1">
          {steps.map((s, i) => {
            const isCurrent = i === currentIdx;
            const isDone = s.done;
            return (
              <li key={s.key} className="flex items-center gap-2 shrink-0">
                <div className={cn(
                  "flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium border transition-colors",
                  isDone && "bg-emerald-50 border-emerald-200 text-emerald-800",
                  !isDone && isCurrent && "bg-sky-50 border-sky-200 text-sky-800",
                  !isDone && !isCurrent && "bg-muted/50 border-border text-muted-foreground",
                )}>
                  <span className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                    isDone && "bg-emerald-500 text-white",
                    !isDone && isCurrent && "bg-sky-500 text-white",
                    !isDone && !isCurrent && "bg-muted-foreground/30 text-white",
                  )}>
                    {isDone ? "✓" : i + 1}
                  </span>
                  {s.label}
                </div>
                {i < steps.length - 1 && <div className={cn("h-px w-4 sm:w-6", isDone ? "bg-emerald-300" : "bg-border")} />}
              </li>
            );
          })}
        </ol>
      </div>

      {/* ============ PAYMENTS ============ */}
      <div className="grid gap-4 md:grid-cols-2">
        <PaymentCard
          direction="out"
          currency={giveCcy}
          amount={giveAmount}
          party={t.customer?.name ?? t.counterparty?.name ?? "—"}
          partyLabel="Destination"
          done={sendDone}
        />
        <PaymentCard
          direction="in"
          currency={receiveCcy}
          amount={receiveAmount}
          party={"—"}
          partyLabel="Received into"
          done={recvDone}
          accountId={t.final_account_id ?? t.intermediate_account_id}
        />
      </div>

      {/* ============ PROFIT ============ */}
      <Card className={cn("border-none shadow-sm", Number(profitAmount) > 0 && "bg-emerald-50/40")}>
        <CardContent className="p-8 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Gross Profit
          </div>
          <div className={cn(
            "text-4xl sm:text-5xl font-bold tabular-nums",
            Number(profitAmount) > 0 ? "text-emerald-600" : Number(profitAmount) < 0 ? "text-rose-600" : "text-foreground",
          )}>
            {fmtProfit(profitAmount, profitCcy)}
          </div>
          {spreadPct != null && (
            <div className="text-sm text-muted-foreground pt-2">
              Spread <span className="font-medium text-foreground">{Math.abs(spreadPct).toFixed(2)}%</span>
              {" · "}
              <span className={cn(spreadPct <= -0.5 ? "text-emerald-600" : spreadPct >= 0.5 ? "text-rose-600" : "")}>
                {spreadPct <= -1 ? "Excellent Buy" : spreadPct <= -0.2 ? "Good Buy" : spreadPct >= 1 ? "Expensive" : spreadPct >= 0.2 ? "Above Market" : "At Market"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ TIMELINE ============ */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Timeline</div>
        <Card className="border-none shadow-sm"><CardContent className="p-6">
          <TimelineList
            createdAt={t.created_at}
            closedAt={closed ? (t.closed_at ?? t.updated_at) : null}
            movements={movements}
            profits={profits}
            docCounts={docCounts as any}
          />
        </CardContent></Card>
      </div>

      {/* ============ DOCUMENTS ============ */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Documents</div>
        <Card className="border-none shadow-sm"><CardContent className="p-6">
          <DocumentsPanel refType="trade_cycle" refId={id} compact />
        </CardContent></Card>
      </div>

      {t.notes && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Notes</div>
          <Card className="border-none shadow-sm"><CardContent className="p-6 text-sm whitespace-pre-wrap">{t.notes}</CardContent></Card>
        </div>
      )}

      {/* ============ ADVANCED (collapsed) ============ */}
      <AdvancedSection
        tradeId={id}
        readOnly={readOnly}
        baseCurrency={t.base_currency}
        profitCurrency={t.expected_profit_currency || t.base_currency}
        movements={movements}
        profits={profits}
        docCounts={docCounts as any}
        milad={{ pct: t.milad_share_pct, profit: t.milad_profit }}
        ali={{ pct: t.ali_share_pct, profit: t.ali_profit }}
        profitConfirmed={t.final_profit_confirmed}
        onConfirmProfit={(v) => confirmProfit.mutate(v)}
        profitCcyDisplay={t.expected_profit_currency}
        audit={auditQ.data ?? []}
      />
    </div>
  );
}

function SummaryLine({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="inline-flex items-center gap-1.5 text-lg font-medium">{icon}{value}</div>
    </div>
  );
}

function SummaryField({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const cls =
    tone === "good" ? "text-emerald-600" :
    tone === "warn" ? "text-amber-600" :
    tone === "bad"  ? "text-rose-600" : "";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-base font-semibold tabular-nums", cls)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function PaymentCard({
  direction, currency, amount, party, partyLabel, done, accountId,
}: { direction: "in" | "out"; currency?: string | null; amount?: number | null; party: string; partyLabel: string; done: boolean; accountId?: string | null }) {
  const accountName = useQuery({
    queryKey: ["account_name", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("name").eq("id", accountId!).maybeSingle();
      return (data as any)?.name as string | undefined;
    },
  });
  const displayParty = accountId ? (accountName.data ?? "—") : party;
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{direction === "out" ? "Money Out" : "Money In"}</div>
          <Badge variant="outline" className={cn(
            "text-[11px] gap-1.5 border",
            done ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-muted/50 border-border text-muted-foreground",
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", done ? "bg-emerald-500" : "bg-muted-foreground/50")} />
            {done ? (direction === "out" ? "Delivered" : "Received") : "Pending"}
          </Badge>
        </div>
        <div>
          <div className="text-3xl font-semibold tabular-nums">
            {fmt(amount ?? 0, currency ?? "")}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">{currency ?? "—"}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">{partyLabel}</div>
          <div className="text-sm font-medium">{displayParty}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineList({
  createdAt, closedAt, movements, profits, docCounts,
}: { createdAt: string; closedAt: string | null; movements: any[]; profits: any[]; docCounts: Record<string, number> }) {
  type Ev = { at: string; title: string; sub?: string };
  const events: Ev[] = [];
  if (createdAt) events.push({ at: createdAt, title: "Trade Created" });
  for (const m of movements) {
    const label = MOVEMENT_LABELS[m.movement_type] ?? m.movement_type;
    events.push({
      at: m.created_at,
      title: `${label} · ${m.status === "completed" ? "Completed" : m.status}`,
      sub: `${fmt(m.amount, m.currency)} ${m.currency}`,
    });
    if (docCounts[m.id]) {
      events.push({ at: m.updated_at || m.created_at, title: `Receipt Uploaded`, sub: label });
    }
  }
  for (const p of profits) {
    events.push({
      at: p.created_at,
      title: `Profit ${p.status}`,
      sub: `${fmt(p.amount, p.currency)} ${p.currency}`,
    });
  }
  if (closedAt) events.push({ at: closedAt, title: "Trade Closed" });
  events.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  if (events.length === 0) return <div className="text-sm text-muted-foreground">No activity yet.</div>;
  return (
    <ol className="space-y-4">
      {events.map((e, i) => (
        <li key={i} className="grid grid-cols-[80px_1fr] gap-4 items-start">
          <div className="text-sm text-muted-foreground tabular-nums pt-0.5">
            {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div>
            <div className="text-sm font-medium">{e.title}</div>
            {e.sub && <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{e.sub}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function AdvancedSection({
  tradeId, readOnly, baseCurrency, profitCurrency, movements, profits, docCounts,
  milad, ali, profitConfirmed, onConfirmProfit, profitCcyDisplay, audit,
}: {
  tradeId: string; readOnly: boolean; baseCurrency: string; profitCurrency: string;
  movements: any[]; profits: any[]; docCounts: Record<string, number>;
  milad: { pct: number; profit: number }; ali: { pct: number; profit: number };
  profitConfirmed: boolean; onConfirmProfit: (v: boolean) => void; profitCcyDisplay: string; audit: any[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground py-2"
      >
        Advanced · movements, profits, share, audit
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-4 mt-2">
          {/* Profit share + confirm */}
          <Card className="border-none shadow-sm"><CardContent className="p-6 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Profit share</div>
              <div className="text-sm">Milad {milad.pct}% · <span className="font-medium">{fmtProfit(milad.profit, profitCcyDisplay)}</span></div>
              <div className="text-sm">Ali {ali.pct}% · <span className="font-medium">{fmtProfit(ali.profit, profitCcyDisplay)}</span></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={profitConfirmed} onCheckedChange={(v) => onConfirmProfit(!!v)} disabled={readOnly} />
              Final profit confirmed
            </label>
          </CardContent></Card>

          {/* Movements */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Movements ({movements.length})</div>
              {!readOnly && <AddMovement tradeId={tradeId} defaultCurrency={baseCurrency} />}
            </div>
            {movements.map((m: any) => (
              <MovementCard key={m.id} m={m} docCount={docCounts[m.id] ?? 0} readOnly={readOnly} />
            ))}
            {movements.length === 0 && <div className="text-sm text-muted-foreground">No movements.</div>}
          </div>

          {/* Profits */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Profit Collections ({profits.length})</div>
              {!readOnly && <AddProfit tradeId={tradeId} defaultCurrency={profitCurrency} />}
            </div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Received by</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {profits.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.entry_date}</TableCell>
                      <TableCell>{fmtProfit(p.amount, p.currency)}</TableCell>
                      <TableCell>{p.received_by ?? "—"}</TableCell>
                      <TableCell>{p.status}</TableCell>
                    </TableRow>
                  ))}
                  {profits.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No profit collections.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </div>

          {/* Audit */}
          <div className="space-y-3">
            <div className="text-sm font-medium">Audit</div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Entity</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {audit.map((a: any) => (
                    <TableRow key={a.id}><TableCell className="text-xs">{new Date(a.created_at).toLocaleString()}</TableCell><TableCell className="text-xs">{a.entity_type}</TableCell><TableCell className="text-xs">{a.action}</TableCell></TableRow>
                  ))}
                  {audit.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No audit records.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </div>
        </div>
      )}
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