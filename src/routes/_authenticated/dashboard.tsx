import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/exchange";
import { getBusinessHealth } from "@/lib/ai/brain.functions";
import { triggerMarketRateRefresh, useLatestMarketRates, useMarketRateHistory } from "@/lib/market-rates";
import { MARKET_CURRENCIES, currencyMeta } from "@/lib/market-currencies";
import {
  ArrowDown, ArrowUp, ArrowRight, RefreshCw, Sparkles, Star, ChevronDown,
  AlertTriangle, CheckCircle2, Clock, Wallet, TrendingUp, Activity,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfSmart = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, "") + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, "") + "M";
  if (Math.abs(n) >= 1e3) return nfInt.format(n);
  return n.toFixed(0);
};

function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(); monthStart.setDate(monthStart.getDate() - 29);
  const yStart = new Date(); yStart.setDate(yStart.getDate() - 1);
  const yISO = yStart.toISOString().slice(0, 10);
  const wISO = weekStart.toISOString().slice(0, 10);
  const mISO = monthStart.toISOString().slice(0, 10);

  // Inventory lots — source of truth for currency holdings
  const lotsQ = useQuery({
    queryKey: ["dash_lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_lots")
        .select("id,lot_code,currency,remaining_amount,cost_basis_rate,cost_basis_currency,account_id,status,entry_date")
        .gt("remaining_amount", 0)
        .neq("status", "depleted")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Live market rates (all supported currencies) for FX + ticker
  const latestRates = useLatestMarketRates();

  // Accounts + ledger entries → cash position
  const accountsQ = useQuery({
    queryKey: ["dash_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id,name,account_type,currency,holder_type,holder_person_name,is_active")
        .is("deleted_at", null)
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const ledgerQ = useQuery({
    queryKey: ["dash_ledger_sums"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ledger_entries").select("account_id,amount");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Open sells → deal counts + action center
  const openSellsQ = useQuery({
    queryKey: ["dash_open_sells_v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sell_transactions")
        .select("id,doc_no,entry_date,deal_status,sold_currency,sold_amount,sell_rate,received_currency,received_amount,currency_delivered,customer_name,customer_id,expected_payment_date,amount_received")
        .is("deleted_at", null)
        .not("deal_status", "in", "(closed,cancelled)")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      const sells = data ?? [];
      if (sells.length === 0) return [];
      const ids = sells.map((s: any) => s.id);
      const [paysRes, docsRes] = await Promise.all([
        supabase.from("sell_payments").select("sell_id,currency,amount,receipt_url").is("deleted_at", null).in("sell_id", ids),
        supabase.from("documents").select("ref_id,doc_type").eq("ref_type", "sell").in("ref_id", ids),
      ]);
      const paysBy = new Map<string, any[]>();
      (paysRes.data ?? []).forEach((p: any) => {
        (paysBy.get(p.sell_id) ?? paysBy.set(p.sell_id, []).get(p.sell_id))!.push(p);
      });
      const docsBy = new Map<string, any[]>();
      (docsRes.data ?? []).forEach((d: any) => {
        (docsBy.get(d.ref_id) ?? docsBy.set(d.ref_id, []).get(d.ref_id))!.push(d);
      });
      const RECEIPT = new Set(["payment_receipt","bank_transfer_screenshot","cash_delivery_receipt","whatsapp_confirmation"]);
      const DELIV = new Set(["currency_handover_proof","cash_delivery_receipt","bank_transfer_screenshot"]);
      return sells.map((s: any) => {
        const pays = paysBy.get(s.id) ?? [];
        const docs = docsBy.get(s.id) ?? [];
        const paid = pays.filter((p) => p.currency === s.received_currency).reduce((n, p) => n + Number(p.amount || 0), 0);
        const payment_received = paid + 0.0001 >= Number(s.received_amount || 0) && Number(s.received_amount || 0) > 0;
        const receipt_uploaded = docs.some((d) => RECEIPT.has(d.doc_type)) || pays.some((p) => !!p.receipt_url);
        const currency_delivered = !!s.currency_delivered;
        const delivery_proof = docs.some((d) => DELIV.has(d.doc_type));
        let derived: string;
        if (!payment_received) derived = "waiting_payment";
        else if (!receipt_uploaded) derived = "waiting_receipt";
        else if (!currency_delivered) derived = "waiting_delivery";
        else if (!delivery_proof) derived = "waiting_delivery";
        else derived = "ready_to_close";
        return { ...s, paid, derived_status: derived };
      });
    },
  });

  // Profit series — today / 7d / 30d, grouped by received currency
  const profitQ = useQuery({
    queryKey: ["dash_profit_range", mISO, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sell_transactions")
        .select("received_currency,gross_profit,closed_at")
        .is("deleted_at", null)
        .eq("deal_status", "closed")
        .gte("closed_at", `${mISO}T00:00:00`)
        .lte("closed_at", `${today}T23:59:59.999`);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recent deals — last 8 sells and buys with rich details
  const recentDealsQ = useQuery({
    queryKey: ["dash_recent_deals_v2"],
    queryFn: async () => {
      const [se, bu] = await Promise.all([
        supabase.from("sell_transactions").select("id,doc_no,created_at,sold_amount,sold_currency,received_amount,received_currency,customer_name,gross_profit,deal_status").is("deleted_at", null).order("created_at", { ascending: false }).limit(8),
        supabase.from("buy_transactions").select("id,doc_no,created_at,bought_amount,bought_currency,paid_amount,paid_currency,supplier_name,rate").is("deleted_at", null).order("created_at", { ascending: false }).limit(8),
      ]);
      const rows: any[] = [
        ...(se.data ?? []).map((r: any) => ({ kind: "sell", when: r.created_at, ...r })),
        ...(bu.data ?? []).map((r: any) => ({ kind: "buy", when: r.created_at, ...r })),
      ];
      return rows.sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 10);
    },
  });

  // Business Health (AI-augmented)
  const runHealth = useServerFn(getBusinessHealth);
  const healthQ = useQuery({
    queryKey: ["dash_business_health"],
    queryFn: async () => runHealth(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const lots = (lotsQ.data ?? []) as any[];
  const openSells = (openSellsQ.data ?? []) as any[];
  const accounts = (accountsQ.data ?? []) as any[];
  const ledgerRows = (ledgerQ.data ?? []) as any[];

  // ── Balances by currency (from lots)
  const availableByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lots) m.set(l.currency, (m.get(l.currency) ?? 0) + Number(l.remaining_amount || 0));
    return m;
  }, [lots]);

  // ── FX conversion table (via bonbast rates vs IRR) — used to express Total in AED
  const midByCcy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of (latestRates.data ?? []) as any[]) {
      if (!r.mid_rate) continue;
      // Prefer bonbast, fall back to manual
      if (!m.has(r.currency) || r.source === "bonbast") m.set(r.currency, Number(r.mid_rate));
    }
    m.set("IRR", 1);
    return m;
  }, [latestRates.data]);
  const aedPerIRR = useMemo(() => {
    const aedMid = midByCcy.get("AED"); // IRR per AED
    return aedMid && aedMid > 0 ? 1 / aedMid : 0;
  }, [midByCcy]);
  const toAED = (amount: number, ccy: string) => {
    if (ccy === "AED") return amount;
    const rate = midByCcy.get(ccy); // IRR per unit ccy
    if (!rate || aedPerIRR <= 0) return 0;
    return amount * rate * aedPerIRR;
  };

  // ── Section 1: Total Liquid Assets
  const currencyTotals = useMemo(() => {
    const arr = Array.from(availableByCurrency.entries())
      .map(([ccy, qty]) => ({ ccy, qty, aed: toAED(qty, ccy) }))
      .filter((r) => r.qty > 0.0001)
      .sort((a, b) => b.aed - a.aed);
    return arr;
  }, [availableByCurrency, midByCcy, aedPerIRR]);
  const totalAED = currencyTotals.reduce((n, r) => n + r.aed, 0);

  // ── Section 1: Profit today/week/month by dominant currency
  const profitBuckets = useMemo(() => {
    const rows = (profitQ.data ?? []) as any[];
    const bucket = (fromIso: string) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        if (!r.closed_at || r.closed_at < `${fromIso}T00:00:00`) continue;
        m.set(r.received_currency, (m.get(r.received_currency) ?? 0) + Number(r.gross_profit || 0));
      }
      const entries = Array.from(m.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      return entries[0] ?? null;
    };
    return { today: bucket(today), week: bucket(wISO), month: bucket(mISO) };
  }, [profitQ.data, today, wISO, mISO]);

  // ── Section 1: Open deals breakdown
  const dealCounts = useMemo(() => {
    const c = { open: openSells.length, waiting_payment: 0, waiting_delivery: 0, ready: 0, overdue: 0 };
    for (const s of openSells) {
      if (s.derived_status === "waiting_payment") c.waiting_payment++;
      else if (s.derived_status === "waiting_delivery") c.waiting_delivery++;
      else if (s.derived_status === "ready_to_close") c.ready++;
      if (s.expected_payment_date && s.expected_payment_date < today && s.derived_status === "waiting_payment") c.overdue++;
    }
    return c;
  }, [openSells, today]);

  // ── Section 3: Action Center items
  const actions = useMemo(() => {
    const items = openSells
      .filter((s) => s.derived_status !== "ready_to_close")
      .map((s) => {
        const age = s.entry_date ? Math.max(0, Math.floor((Date.now() - new Date(s.entry_date).getTime()) / 86400000)) : 0;
        let label = "Follow up";
        let cta = "Open Deal";
        let tone: "warn" | "danger" | "info" = "warn";
        if (s.derived_status === "waiting_payment") {
          const overdue = s.expected_payment_date && s.expected_payment_date < today;
          label = overdue ? "Settlement Overdue" : "Waiting Payment";
          cta = "Receive Payment";
          tone = overdue ? "danger" : "warn";
        } else if (s.derived_status === "waiting_delivery") {
          label = "Waiting Delivery";
          cta = "Confirm Delivery";
          tone = "warn";
        } else if (s.derived_status === "waiting_receipt") {
          label = "Missing Receipt";
          cta = "Upload Receipt";
          tone = "info";
        }
        return { s, age, label, cta, tone };
      })
      .sort((a, b) => (a.tone === "danger" ? -1 : 1) - (b.tone === "danger" ? -1 : 1))
      .slice(0, 6);
    return items;
  }, [openSells, today]);

  // ── Section 4: Cash position by currency, grouped
  const cashByCurrency = useMemo(() => {
    const balByAcc = new Map<string, number>();
    for (const r of ledgerRows) balByAcc.set(r.account_id, (balByAcc.get(r.account_id) ?? 0) + Number(r.amount || 0));
    const groups = new Map<string, any[]>();
    for (const a of accounts) {
      const bal = balByAcc.get(a.id) ?? 0;
      if (Math.abs(bal) < 0.001) continue;
      const holderLabel =
        a.account_type === "person_holding" && a.holder_person_name ? `Held by ${a.holder_person_name}` :
        a.name;
      const arr = groups.get(a.currency) ?? [];
      arr.push({ id: a.id, label: holderLabel, type: a.account_type, balance: bal });
      groups.set(a.currency, arr);
    }
    // Also add inventory-lot cash summary
    return Array.from(groups.entries())
      .map(([ccy, list]) => ({
        ccy,
        list: list.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)),
        total: list.reduce((n, r) => n + r.balance, 0),
      }))
      .sort((a, b) => toAED(b.total, b.ccy) - toAED(a.total, a.ccy));
  }, [accounts, ledgerRows, midByCcy, aedPerIRR]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // ── Section 4b: Avg cost per currency for lot summary
  const avgCostByCcy = useMemo(() => {
    const m = new Map<string, { qty: number; cost: number }>();
    for (const l of lots) {
      const c = m.get(l.currency) ?? { qty: 0, cost: 0 };
      c.qty += Number(l.remaining_amount || 0);
      c.cost += Number(l.remaining_amount || 0) * Number(l.cost_basis_rate || 0);
      m.set(l.currency, c);
    }
    const out = new Map<string, number>();
    for (const [k, v] of m) out.set(k, v.qty > 0 ? v.cost / v.qty : 0);
    return out;
  }, [lots]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-12 pb-16">
      {/* Header */}
      <header className="pt-4">
        <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/70">Treasury Command Center</div>
        <div className="mt-2 flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Today</h1>
          <div className="text-xs text-muted-foreground tabular-nums">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>
      </header>

      {/* SECTION 1 — Business Snapshot */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Liquid Assets */}
        <BigCard label="Total Liquid Assets">
          <div className="text-3xl font-semibold tracking-tight tabular-nums">
            {totalAED > 0 ? `${nfInt.format(totalAED)}` : "—"}
            <span className="ml-1.5 text-xs text-muted-foreground uppercase tracking-wider">AED</span>
          </div>
          <div className="mt-4 space-y-1.5">
            {currencyTotals.slice(0, 4).map((r) => (
              <div key={r.ccy} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{r.ccy}</span>
                <span className="font-mono tabular-nums">{nfSmart(r.qty)}</span>
              </div>
            ))}
            {currencyTotals.length === 0 && <div className="text-xs text-muted-foreground">No inventory</div>}
          </div>
        </BigCard>

        {/* Today's Profit */}
        <BigCard label="Profit">
          <ProfitStrip title="Today" entry={profitBuckets.today} big />
          <div className="mt-4 space-y-1.5 border-t pt-3">
            <ProfitStrip title="This Week" entry={profitBuckets.week} />
            <ProfitStrip title="This Month" entry={profitBuckets.month} />
          </div>
        </BigCard>

        {/* Open Deals */}
        <BigCard label="Open Deals" to="/deals">
          <div className="text-3xl font-semibold tracking-tight tabular-nums">{dealCounts.open}</div>
          <div className="mt-4 space-y-1.5">
            <DealRow label="Waiting Payment" count={dealCounts.waiting_payment} tone="warn" />
            <DealRow label="Waiting Delivery" count={dealCounts.waiting_delivery} tone="info" />
            <DealRow label="Ready to Close" count={dealCounts.ready} tone="ok" />
            <DealRow label="Overdue" count={dealCounts.overdue} tone="danger" />
          </div>
        </BigCard>

        {/* Business Health */}
        <HealthCard health={healthQ.data} loading={healthQ.isLoading} error={healthQ.isError} />
      </section>

      {/* SECTION 2 — Live Market Ticker */}
      <MarketTicker />

      {/* SECTION 3 — Action Center */}
      <section>
        <SectionHead title="Action Center" hint="What needs your attention right now." />
        {actions.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} text="Nothing needs action. All deals are on track." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {actions.map((a) => (
              <Link
                key={a.s.id}
                to="/sells/$id" params={{ id: a.s.id }}
                className="group rounded-2xl border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all flex items-start gap-4"
              >
                <div className={`shrink-0 h-9 w-9 grid place-items-center rounded-full border ${
                  a.tone === "danger" ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : a.tone === "warn" ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                }`}>
                  {a.tone === "danger" ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{a.label}</div>
                  <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                    <div className="font-semibold truncate">{a.s.customer_name || "Unknown customer"}</div>
                    {a.s.doc_no && <div className="text-[11px] text-muted-foreground font-mono">{a.s.doc_no}</div>}
                  </div>
                  <div className="mt-1 text-lg font-mono tabular-nums">
                    {fmt(a.s.received_amount, a.s.received_currency)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {a.age > 0 ? `${a.age} day${a.age > 1 ? "s" : ""} ago` : "Today"}
                    {a.s.expected_payment_date ? ` · Due ${a.s.expected_payment_date}` : ""}
                  </div>
                </div>
                <div className="shrink-0 flex items-center text-xs font-medium text-primary group-hover:translate-x-0.5 transition-transform self-center">
                  {a.cta} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 4 — Live Cash Position */}
      <section>
        <SectionHead title="Cash Position" hint="Real balances across every account and lot." action={
          <Link to="/accounts" className="text-xs text-muted-foreground hover:text-foreground">View accounts <ArrowRight className="inline h-3 w-3" /></Link>
        } />
        {cashByCurrency.length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} text="No cash positions yet." />
        ) : (
          <div className="rounded-2xl border bg-card divide-y overflow-hidden">
            {cashByCurrency.map((g) => {
              const open = expanded[g.ccy] ?? false;
              const avg = avgCostByCcy.get(g.ccy) ?? 0;
              return (
                <div key={g.ccy}>
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [g.ccy]: !open }))}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors text-left"
                  >
                    <div className="text-lg font-semibold tracking-wide">{g.ccy}</div>
                    <div className="flex-1 min-w-0 text-2xl font-mono tabular-nums">
                      {nfSmart(g.total)} <span className="text-xs text-muted-foreground uppercase ml-1">{g.ccy}</span>
                    </div>
                    {avg > 0 && g.ccy !== "IRR" && (
                      <div className="text-[11px] text-muted-foreground tabular-nums hidden sm:block">
                        avg cost <span className="font-mono">{nfInt.format(avg)}</span> IRR
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground shrink-0 hidden sm:block tabular-nums">
                      ≈ {nfInt.format(toAED(g.total, g.ccy))} AED
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <ul className="bg-muted/20 divide-y">
                      {g.list.map((r: any) => (
                        <li key={r.id} className="flex items-center gap-3 px-6 py-2.5 text-sm">
                          <span className={`h-1.5 w-1.5 rounded-full ${r.type === "cash_box" ? "bg-emerald-500" : r.type === "bank" ? "bg-sky-500" : r.type === "person_holding" ? "bg-amber-500" : "bg-muted-foreground"}`} />
                          <div className="flex-1 min-w-0 truncate">{r.label}</div>
                          <div className="font-mono tabular-nums">{nfSmart(r.balance)} <span className="text-[10px] text-muted-foreground uppercase">{g.ccy}</span></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 5 — AI Business Brain */}
      <section>
        <SectionHead
          title="AI Business Brain"
          hint="Real-time analysis of inventory, market, deals and receivables."
          action={
            <Link to="/ai-brain" className="text-xs text-muted-foreground hover:text-foreground">Ask a question <ArrowRight className="inline h-3 w-3" /></Link>
          }
        />
        <AIRecommendation health={healthQ.data} loading={healthQ.isLoading} error={healthQ.isError} />
      </section>

      {/* SECTION 6 — Recent Deals */}
      <section>
        <SectionHead title="Recent Deals" hint="Latest activity across buy and sell." />
        <div className="rounded-2xl border bg-card overflow-hidden">
          {(recentDealsQ.data ?? []).length === 0 && (
            <div className="px-5 py-8 text-sm text-muted-foreground text-center">No deals yet.</div>
          )}
          <ul className="divide-y">
            {(recentDealsQ.data ?? []).map((r: any) => (
              <li key={`${r.kind}-${r.id}`} className="px-5 py-4">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
                  <div className={`shrink-0 text-[10px] uppercase tracking-[0.14em] font-semibold rounded-md px-2 py-1 border ${r.kind === "sell" ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" : "border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/5"}`}>
                    {r.kind === "sell" ? "Sold" : "Bought"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <div className="text-lg font-semibold tabular-nums font-mono">
                        {r.kind === "sell"
                          ? fmt(r.sold_amount, r.sold_currency)
                          : fmt(r.bought_amount, r.bought_currency)}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">{r.doc_no}</div>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {r.kind === "sell" ? (r.customer_name || "Customer") : (r.supplier_name || "Supplier")}
                      {r.kind === "sell" && r.gross_profit ? ` · Profit ${fmt(r.gross_profit, r.received_currency)}` : ""}
                      {r.kind === "buy" && r.rate ? ` · Rate ${nfInt.format(Number(r.rate))}` : ""}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right tabular-nums shrink-0">
                    {relTime(r.when)}
                    {r.kind === "sell" && (
                      <div className={`mt-0.5 text-[10px] uppercase tracking-wider ${r.deal_status === "closed" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{r.deal_status?.replace(/_/g, " ")}</div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

// ── Reusable pieces ────────────────────────────────────────────────

function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80 font-semibold">{title}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </div>
      {action}
    </div>
  );
}

function BigCard({ label, to, children }: { label: string; to?: string; children: React.ReactNode }) {
  const inner = (
    <>
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">{label}</div>
      <div className="mt-4">{children}</div>
    </>
  );
  const cls = "rounded-2xl border bg-card p-5 md:p-6 min-h-[180px] hover:border-primary/30 hover:shadow-sm transition-all";
  if (to) return <Link to={to as any} className={cls}>{inner}</Link>;
  return <div className={cls}>{inner}</div>;
}

function ProfitStrip({ title, entry, big }: { title: string; entry: [string, number] | null; big?: boolean }) {
  if (!entry) {
    return (
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{title}</span>
        <span className={`font-mono tabular-nums text-muted-foreground ${big ? "text-3xl" : "text-xs"}`}>—</span>
      </div>
    );
  }
  const positive = entry[1] > 0;
  const tone = positive ? "text-emerald-600 dark:text-emerald-400" : entry[1] < 0 ? "text-destructive" : "";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{title}</span>
      <span className={`font-mono tabular-nums ${big ? "text-3xl font-semibold" : "text-xs"} ${tone}`}>
        {positive ? "+" : ""}{nfSmart(entry[1])}
        <span className={`ml-1 text-muted-foreground uppercase ${big ? "text-xs" : "text-[10px]"}`}>{entry[0]}</span>
      </span>
    </div>
  );
}

function DealRow({ label, count, tone }: { label: string; count: number; tone: "warn" | "info" | "ok" | "danger" }) {
  const dot = tone === "danger" ? "bg-destructive" : tone === "warn" ? "bg-amber-500" : tone === "info" ? "bg-sky-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className="font-mono tabular-nums">{count}</span>
    </div>
  );
}

function HealthCard({ health, loading, error }: { health: any; loading: boolean; error: boolean }) {
  const status = health?.status ?? (loading ? "loading" : "unknown");
  const dot = status === "healthy" ? "bg-emerald-500" : status === "watch" ? "bg-amber-500" : status === "warning" ? "bg-destructive" : "bg-muted-foreground";
  const label = status === "healthy" ? "Healthy" : status === "watch" ? "Watch" : status === "warning" ? "Warning" : loading ? "Analyzing" : "—";
  const stars: [string, number][] = health?.stars ? [
    ["Liquidity", health.stars.liquidity],
    ["Cash Flow", health.stars.cashFlow],
    ["Receivables", health.stars.receivables],
    ["Inventory", health.stars.inventory],
    ["Op. Risk", health.stars.opRisk],
  ] : [];
  return (
    <div className="rounded-2xl border bg-card p-5 md:p-6 min-h-[180px]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">Business Health</div>
      <div className="mt-4 flex items-baseline gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <div className="text-2xl font-semibold tracking-tight">{label}</div>
        {health?.score != null && <div className="ml-auto text-xs text-muted-foreground tabular-nums font-mono">{health.score}<span className="text-muted-foreground">/100</span></div>}
      </div>
      <div className="mt-4 space-y-1">
        {loading && <div className="text-xs text-muted-foreground">Analyzing…</div>}
        {error && <div className="text-xs text-muted-foreground">Unable to analyze right now.</div>}
        {stars.map(([name, n]) => (
          <div key={name} className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground flex-1">{name}</span>
            <span className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`h-2.5 w-2.5 ${i <= n ? "fill-foreground text-foreground" : "text-muted-foreground/30"}`} />
              ))}
            </span>
          </div>
        ))}
      </div>
      {health?.summary && (
        <div className="mt-4 text-xs text-muted-foreground leading-relaxed border-t pt-3">{health.summary}</div>
      )}
    </div>
  );
}

function AIRecommendation({ health, loading, error }: { health: any; loading: boolean; error: boolean }) {
  if (loading) {
    return (
      <div className="rounded-2xl border bg-card p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-32 bg-muted rounded" />
          <div className="h-5 w-3/4 bg-muted rounded" />
          <div className="h-3 w-full bg-muted rounded" />
        </div>
      </div>
    );
  }
  if (error || !health) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        AI Brain is temporarily unavailable. Check inventory, deals and rates directly.
      </div>
    );
  }
  const isWarning = health.status === "warning" || health.status === "watch";
  return (
    <div className={`rounded-2xl border p-6 md:p-8 ${isWarning ? "bg-amber-500/5 border-amber-500/30" : "bg-card"}`}>
      <div className="flex items-start gap-4">
        <div className={`shrink-0 h-10 w-10 grid place-items-center rounded-full ${isWarning ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary"}`}>
          {isWarning ? <AlertTriangle className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-4 flex-wrap">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
              {isWarning ? "Advisory" : "Business Score"}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{health.score}<span className="text-sm text-muted-foreground">/100</span></div>
            {health.confidence && (
              <div className="ml-auto text-[11px] text-muted-foreground">Confidence <span className="font-mono tabular-nums">{health.confidence}%</span></div>
            )}
          </div>
          <p className="mt-4 text-base md:text-lg leading-relaxed tracking-tight">
            {health.ai_narrative || `${health.summary} ${health.recommendation}`}
          </p>
          {health.totals?.market_value_by_currency?.length > 0 && (
            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {health.totals.market_value_by_currency.slice(0, 4).map((e: any) => (
                <div key={e.currency} className="rounded-lg border bg-background/50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{e.currency}</div>
                  <div className="font-mono tabular-nums text-sm">{nfSmart(e.qty)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6 flex items-center gap-3 text-sm">
      {icon}<span>{text}</span>
    </div>
  );
}

// ── Market Ticker ─────────────────────────────────────────────────

function MarketTicker() {
  const qc = useQueryClient();
  const latest = useLatestMarketRates();
  const refresh = useMutation({
    mutationFn: triggerMarketRateRefresh,
    onSuccess: () => {
      toast.success("Market rates refreshed");
      qc.invalidateQueries({ queryKey: ["market_rates_latest"] });
      qc.invalidateQueries({ queryKey: ["market_rate_history"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Refresh failed"),
  });
  const primary = MARKET_CURRENCIES.filter((c) => c.primary);
  const rowsByCcy = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of (latest.data ?? []) as any[]) {
      if (!m.has(r.currency) || r.source === "bonbast") m.set(r.currency, r);
    }
    return m;
  }, [latest.data]);
  const lastFetched = useMemo(() => {
    let latestT = 0;
    for (const r of (latest.data ?? []) as any[]) {
      if (r.fetched_at) latestT = Math.max(latestT, new Date(r.fetched_at).getTime());
    }
    return latestT ? new Date(latestT) : null;
  }, [latest.data]);
  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80 font-semibold flex items-center gap-2">
            <Activity className="h-3 w-3" /> Live Market
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {lastFetched ? `Last update ${lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for rates"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refresh.isPending ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0">
          {primary.map((c) => {
            const row = rowsByCcy.get(c.code);
            const meta = currencyMeta(c.code);
            return <TickerCell key={c.code} code={c.code} flag={meta.flag} row={row} />;
          })}
        </div>
      </div>
    </section>
  );
}

function TickerCell({ code, flag, row }: { code: string; flag: string; row?: any }) {
  const hist = useMarketRateHistory(code, 24);
  const pts = useMemo(() => {
    const rows = (hist.data ?? []) as any[];
    return rows.map((r) => Number(r.mid_rate)).filter((n) => Number.isFinite(n) && n > 0);
  }, [hist.data]);
  const spark = useMemo(() => {
    if (pts.length < 2) return null;
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = max - min || 1;
    const w = 100, h = 24;
    const step = w / (pts.length - 1);
    const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(" ");
    return { d, w, h };
  }, [pts]);
  const change = pts.length >= 2 ? ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100 : null;
  const up = change != null && change >= 0;
  return (
    <div className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{flag}</span>
          <span className="text-xs font-semibold tracking-wider text-muted-foreground">{code}</span>
        </div>
        {change != null && (
          <span className={`text-[11px] font-medium tabular-nums inline-flex items-center gap-0.5 ${up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
            {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {up ? "+" : ""}{change.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Buy</div>
          <div className="text-base font-mono tabular-nums">{row?.buy_rate ? nfInt.format(row.buy_rate) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sell</div>
          <div className="text-base font-mono tabular-nums">{row?.sell_rate ? nfInt.format(row.sell_rate) : "—"}</div>
        </div>
      </div>
      {spark && (
        <svg viewBox={`0 0 ${spark.w} ${spark.h}`} className={`mt-3 w-full h-6 ${up ? "text-emerald-500" : "text-destructive"}`} preserveAspectRatio="none">
          <path d={spark.d} fill="none" stroke="currentColor" strokeWidth={1.2} />
        </svg>
      )}
    </div>
  );
}

function relTime(iso?: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}
