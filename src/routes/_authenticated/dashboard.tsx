import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { fmt } from "@/lib/exchange";
import {
  ArrowDownToLine, ShoppingCart, TrendingUp, Receipt, ArrowLeftRight,
  Landmark, ChevronDown, ChevronRight, Layers, Users2, Activity,
  PackageCheck, Timer, Boxes, Clock,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const CURRENCY_ACCENT: Record<string, string> = {
  AED: "from-emerald-500/15 to-emerald-500/0 border-emerald-500/30",
  IRR: "from-amber-500/15 to-amber-500/0 border-amber-500/30",
  USD: "from-sky-500/15 to-sky-500/0 border-sky-500/30",
  GBP: "from-violet-500/15 to-violet-500/0 border-violet-500/30",
  EUR: "from-blue-500/15 to-blue-500/0 border-blue-500/30",
  USDT: "from-teal-500/15 to-teal-500/0 border-teal-500/30",
};
const CURRENCY_DOT: Record<string, string> = {
  AED: "bg-emerald-500", IRR: "bg-amber-500", USD: "bg-sky-500",
  GBP: "bg-violet-500", EUR: "bg-blue-500", USDT: "bg-teal-500",
};

function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [openCurrency, setOpenCurrency] = useState<string | null>(null);

  const balancesQ = useQuery({
    queryKey: ["account_balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const lotsQ = useQuery({
    queryKey: ["dashboard_inventory_lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_lots")
        .select("id,lot_code,currency,account_id,original_amount,remaining_amount,cost_basis_rate,cost_basis_currency,source_ref_type,source_description,entry_date,status")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const todayBuysQ = useQuery({
    queryKey: ["today_buys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buy_transactions").select("*").eq("entry_date", today).is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const todaySellsQ = useQuery({
    queryKey: ["today_sells"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sell_transactions").select("*").eq("entry_date", today).is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const openSellsQ = useQuery({
    queryKey: ["dashboard_open_sells"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sell_transactions")
        .select("id,entry_date,deal_status,sold_currency,sold_amount,received_currency,received_amount,received_into_account_id,sold_from_account_id,currency_delivered,customer_name")
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
        if (!paysBy.has(p.sell_id)) paysBy.set(p.sell_id, []);
        paysBy.get(p.sell_id)!.push(p);
      });
      const docsBy = new Map<string, any[]>();
      (docsRes.data ?? []).forEach((d: any) => {
        if (!docsBy.has(d.ref_id)) docsBy.set(d.ref_id, []);
        docsBy.get(d.ref_id)!.push(d);
      });
      const RECEIPT_TYPES = new Set(["payment_receipt","bank_transfer_screenshot","cash_delivery_receipt","whatsapp_confirmation"]);
      const DELIV_TYPES = new Set(["currency_handover_proof","cash_delivery_receipt","bank_transfer_screenshot"]);
      return sells.map((s: any) => {
        const pays = paysBy.get(s.id) ?? [];
        const docs = docsBy.get(s.id) ?? [];
        const paid = pays.filter(p => p.currency === s.received_currency).reduce((n, p) => n + Number(p.amount || 0), 0);
        const payment_received = paid + 0.0001 >= Number(s.received_amount || 0) && Number(s.received_amount || 0) > 0;
        const partially_paid = paid > 0.0001 && !payment_received;
        const receipt_uploaded = docs.some(d => RECEIPT_TYPES.has(d.doc_type)) || pays.some(p => !!p.receipt_url);
        const currency_delivered = !!s.currency_delivered;
        const delivery_proof = docs.some(d => DELIV_TYPES.has(d.doc_type));
        const closed = s.deal_status === "closed";
        let derived: string;
        if (closed) derived = "closed";
        else if (partially_paid) derived = "partially_paid";
        else if (!payment_received) derived = "waiting_payment";
        else if (!receipt_uploaded) derived = "waiting_receipt";
        else if (!currency_delivered) derived = "waiting_currency_delivery";
        else if (!delivery_proof) derived = "waiting_delivery_proof";
        else derived = "ready_to_close";
        return { ...s, paid, currency_delivered, payment_received, receipt_uploaded, delivery_proof, closed, derived_status: derived };
      });
    },
  });
  const closedTodayQ = useQuery({
    queryKey: ["dashboard_closed_today", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sell_transactions").select("id")
        .is("deleted_at", null).eq("deal_status", "closed")
        .gte("closed_at", `${today}T00:00:00`).lte("closed_at", `${today}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
  });
  const walletsQ = useQuery({
    queryKey: ["customer_wallet_balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_wallet_balances").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const recentQ = useQuery({
    queryKey: ["dashboard_recent_activity"],
    queryFn: async () => {
      const [bi, bu, se, ex, tr] = await Promise.all([
        supabase.from("brought_in_money").select("id,created_at,entry_date,amount,currency,brought_by,source_name").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("buy_transactions").select("id,created_at,entry_date,bought_amount,bought_currency,paid_amount,paid_currency").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("sell_transactions").select("id,created_at,entry_date,sold_amount,sold_currency,received_amount,received_currency,customer_name,deal_status").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("expenses").select("id,created_at,entry_date,amount,currency,category").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("transfers").select("id,created_at,entry_date,amount,currency").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
      ]);
      const rows: any[] = [
        ...(bi.data ?? []).map(r => ({ kind: "brought_in", ...r, when: r.created_at, text: `${r.brought_by ?? "Someone"} brought ${fmt(r.amount, r.currency)}${r.source_name ? " · " + r.source_name : ""}` })),
        ...(bu.data ?? []).map(r => ({ kind: "buy", ...r, when: r.created_at, text: `Bought ${fmt(r.bought_amount, r.bought_currency)} for ${fmt(r.paid_amount, r.paid_currency)}` })),
        ...(se.data ?? []).map(r => ({ kind: "sell", ...r, when: r.created_at, text: `Sold ${fmt(r.sold_amount, r.sold_currency)} → ${fmt(r.received_amount, r.received_currency)}${r.customer_name ? " · " + r.customer_name : ""}` })),
        ...(ex.data ?? []).map(r => ({ kind: "expense", ...r, when: r.created_at, text: `Expense ${fmt(r.amount, r.currency)}${r.category ? " · " + r.category : ""}` })),
        ...(tr.data ?? []).map(r => ({ kind: "transfer", ...r, when: r.created_at, text: `Transfer ${fmt(r.amount, r.currency)}` })),
      ];
      return rows.sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 10);
    },
  });

  // ---- derived state ----
  const balances = (balancesQ.data ?? []) as any[];
  const lots = (lotsQ.data ?? []) as any[];

  // Inventory summary per currency (from live lots)
  const inventoryByCurrency = useMemo(() => {
    const byCur = new Map<string, {
      currency: string; available: number; lotCount: number; pendingLots: number;
      accounts: Set<string>; costNum: number; costDen: number;
    }>();
    for (const l of lots) {
      const rem = Number(l.remaining_amount || 0);
      if (rem <= 0 && l.status === "depleted") continue;
      const cur = String(l.currency);
      const entry = byCur.get(cur) ?? { currency: cur, available: 0, lotCount: 0, pendingLots: 0, accounts: new Set<string>(), costNum: 0, costDen: 0 };
      entry.available += rem;
      entry.lotCount += 1;
      if (l.status === "partial") entry.pendingLots += 1;
      if (l.account_id) entry.accounts.add(l.account_id);
      if (l.cost_basis_rate && Number(l.cost_basis_rate) > 0) {
        entry.costNum += Number(l.cost_basis_rate) * rem;
        entry.costDen += rem;
      }
      byCur.set(cur, entry);
    }
    // Also include account count from account_balances for currencies present
    const acctByCur = new Map<string, Set<string>>();
    for (const b of balances) {
      if (Math.abs(Number(b.current_balance || 0)) < 0.0001) continue;
      if (!acctByCur.has(b.currency)) acctByCur.set(b.currency, new Set());
      acctByCur.get(b.currency)!.add(b.account_id);
    }
    for (const [cur, s] of acctByCur) {
      const e = byCur.get(cur);
      if (e) s.forEach(a => e.accounts.add(a));
    }
    return Array.from(byCur.values())
      .filter(e => Math.abs(e.available) > 0.0001)
      .sort((a, b) => (a.currency === "AED" ? -1 : b.currency === "AED" ? 1 : a.currency.localeCompare(b.currency)));
  }, [lots, balances]);

  // Deal status buckets
  const openSells = (openSellsQ.data ?? []) as any[];
  const dealBucket = (s: string) => openSells.filter(d => d.derived_status === s).length;
  const openCount = openSells.length;

  // Expected receivables — unpaid customer money on open deals (NOT inventory)
  const receivablesByCurrency = useMemo(() => {
    const m = new Map<string, { currency: string; expected: number; deals: number }>();
    for (const d of openSells) {
      const owed = Math.max(0, Number(d.received_amount || 0) - Number(d.paid || 0));
      if (owed < 0.0001) continue;
      const cur = String(d.received_currency);
      const e = m.get(cur) ?? { currency: cur, expected: 0, deals: 0 };
      e.expected += owed;
      e.deals += 1;
      m.set(cur, e);
    }
    return Array.from(m.values()).sort((a, b) => a.currency.localeCompare(b.currency));
  }, [openSells]);

  // Customer balances
  const wallets = (walletsQ.data ?? []) as any[];
  const owedByCustomers = wallets.filter(w => Number(w.balance) < -0.0001);
  const owedToCustomers = wallets.filter(w => Number(w.balance) > 0.0001);
  const groupSum = (rows: any[]) => {
    const m = new Map<string, number>();
    rows.forEach(r => m.set(r.currency, (m.get(r.currency) ?? 0) + Math.abs(Number(r.balance || 0))));
    return Array.from(m.entries());
  };

  // Today by currency
  const buys = (todayBuysQ.data ?? []) as any[];
  const sells = (todaySellsQ.data ?? []) as any[];
  const sumByCur = (rows: any[], amountKey: string, curKey: string) => {
    const m = new Map<string, number>();
    rows.forEach(r => m.set(r[curKey], (m.get(r[curKey]) ?? 0) + Number(r[amountKey] || 0)));
    return m;
  };
  const boughtToday = sumByCur(buys, "bought_amount", "bought_currency");
  const soldToday = sumByCur(sells, "sold_amount", "sold_currency");
  const openedToday = sells.length;
  const closedToday = (closedTodayQ.data ?? []).length;

  // Inventory health
  const lotHealth = useMemo(() => {
    const h = { available: 0, partial: 0, depleted: 0 };
    for (const l of lots) {
      if (l.status === "available") h.available += 1;
      else if (l.status === "partial") h.partial += 1;
      else if (l.status === "depleted") h.depleted += 1;
    }
    return h;
  }, [lots]);

  // Grouped account balances (for section 3)
  const groupedAccounts = useMemo(() => {
    // Sort: cash first, then bank, then person_holding/customer_wallet
    const order: Record<string, number> = { cash: 0, aed_bank: 1, toman_bank: 1, foreign_currency: 1, wallet: 2, person_holding: 3, customer_wallet: 4, pending_delivery: 5, other: 6 };
    const byName = new Map<string, { name: string; type: string; lines: { currency: string; amount: number }[] }>();
    for (const b of balances) {
      const amt = Number(b.current_balance || 0);
      if (Math.abs(amt) < 0.0001) continue;
      const key = b.name;
      if (!byName.has(key)) byName.set(key, { name: b.name, type: b.account_type, lines: [] });
      byName.get(key)!.lines.push({ currency: b.currency, amount: amt });
    }
    return Array.from(byName.values()).sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.name.localeCompare(b.name));
  }, [balances]);

  return (
    <>
      <PageHeader
        title="Treasury Dashboard"
        description="Live inventory, deal pipeline, and account positions across every currency."
      />

      {/* SECTION 1 — INVENTORY BY CURRENCY */}
      <SectionTitle icon={<Boxes className="h-4 w-4" />} title="Inventory by currency" hint="Never merged. Each currency stands alone." />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {inventoryByCurrency.length === 0 && (
          <Card className="col-span-full"><CardContent className="p-6 text-sm text-muted-foreground">No inventory yet. Add a Brought-In or Buy to begin.</CardContent></Card>
        )}
        {inventoryByCurrency.map((c) => {
          const isOpen = openCurrency === c.currency;
          const avg = c.costDen > 0 ? c.costNum / c.costDen : null;
          return (
            <button
              key={c.currency}
              type="button"
              onClick={() => setOpenCurrency(isOpen ? null : c.currency)}
              className={`text-left rounded-xl border bg-gradient-to-br p-4 transition-all hover:shadow-lg ${CURRENCY_ACCENT[c.currency] ?? "from-primary/10 to-transparent border-primary/30"} ${isOpen ? "ring-2 ring-primary/40" : ""}`}
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${CURRENCY_DOT[c.currency] ?? "bg-primary"}`} />
                  <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">{c.currency}</span>
                </div>
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="text-2xl md:text-3xl font-bold tracking-tight mt-2 font-mono">{fmt(c.available, c.currency)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Available</div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                <MiniStat label="Accounts" value={String(c.accounts.size)} />
                <MiniStat label="Lots" value={String(c.lotCount)} />
                <MiniStat label="Pending" value={String(c.pendingLots)} tone={c.pendingLots > 0 ? "warn" : undefined} />
              </div>
              <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Avg cost</span>
                <span className="font-mono font-semibold">{avg === null ? "Not applicable" : fmt(avg)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* SECTION 2 — LOT DRILLDOWN */}
      {openCurrency && (
        <Card className="mb-6 border-primary/40" style={{ boxShadow: "var(--shadow-elevated)" }}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              {openCurrency} inventory lots
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" asChild><Link to="/inventory">Full inventory</Link></Button>
              <Button size="sm" variant="ghost" onClick={() => setOpenCurrency(null)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Grouped by account */}
            {(() => {
              const curLots = lots.filter(l => l.currency === openCurrency && (Number(l.remaining_amount) > 0 || l.status !== "depleted"));
              const acctMap = new Map<string, string>();
              balances.forEach((b: any) => acctMap.set(b.account_id, b.name));
              const byAccount = new Map<string, any[]>();
              curLots.forEach(l => {
                const key = l.account_id ?? "unassigned";
                if (!byAccount.has(key)) byAccount.set(key, []);
                byAccount.get(key)!.push(l);
              });
              if (byAccount.size === 0) return <div className="p-6 text-sm text-muted-foreground">No active lots for {openCurrency}.</div>;
              return Array.from(byAccount.entries()).map(([acctId, ls]) => {
                const acctName = acctMap.get(acctId) ?? "Unassigned";
                const acctTotal = ls.reduce((s, l) => s + Number(l.remaining_amount || 0), 0);
                return (
                  <div key={acctId} className="border-b last:border-0">
                    <div className="flex items-center justify-between px-4 py-2 bg-muted/40">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Landmark className="h-3.5 w-3.5 text-muted-foreground" /> {acctName}
                      </div>
                      <div className="font-mono text-sm">{fmt(acctTotal, openCurrency)}</div>
                    </div>
                    <div className="divide-y">
                      {ls.map(l => {
                        const noBasis = !l.cost_basis_rate || Number(l.cost_basis_rate) <= 0 || l.cost_basis_currency === l.currency;
                        const isDirect = l.source_ref_type === "brought_in" && noBasis;
                        return (
                          <div key={l.id} className="px-4 py-2 grid grid-cols-12 gap-2 items-center text-xs">
                            <div className="col-span-3 font-mono">{l.lot_code}</div>
                            <div className="col-span-3 font-mono font-semibold">{fmt(l.remaining_amount, l.currency)}</div>
                            <div className="col-span-3 text-muted-foreground">
                              {noBasis
                                ? (isDirect ? <span>Direct Deposit</span> : <span>Not applicable</span>)
                                : <span>Rate <span className="font-mono">{fmt(l.cost_basis_rate)}</span> {l.cost_basis_currency}/{l.currency}</span>}
                            </div>
                            <div className="col-span-2 text-muted-foreground truncate">{l.source_description ?? l.source_ref_type ?? "—"}</div>
                            <div className="col-span-1 text-right"><StatusPill status={l.status} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </CardContent>
        </Card>
      )}

      {/* SECTION 7 — QUICK ACTIONS */}
      <SectionTitle icon={<TrendingUp className="h-4 w-4" />} title="Quick actions" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
        <Button asChild size="lg" className="h-16 text-base font-semibold col-span-2 md:col-span-1 shadow-md">
          <Link to="/quick-sell"><TrendingUp className="h-5 w-5 mr-2" /> New Deal</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-16"><Link to="/brought-in"><ArrowDownToLine className="h-5 w-5 mr-2" /> Brought-In</Link></Button>
        <Button asChild size="lg" variant="outline" className="h-16"><Link to="/buy"><ShoppingCart className="h-5 w-5 mr-2" /> Buy</Link></Button>
        <Button asChild size="lg" variant="outline" className="h-16"><Link to="/expenses"><Receipt className="h-5 w-5 mr-2" /> Expense</Link></Button>
        <Button asChild size="lg" variant="outline" className="h-16"><Link to="/transfers"><ArrowLeftRight className="h-5 w-5 mr-2" /> Transfer</Link></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* SECTION 4 — OPEN DEALS */}
        <Card className="lg:col-span-1" style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Timer className="h-4 w-4 text-primary" /> Open deals</CardTitle>
            <Button size="sm" variant="ghost" asChild><Link to="/sell">Open</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tracking-tight">{openCount}</div>
            <div className="text-xs text-muted-foreground mb-3">Deals not yet closed</div>
            <div className="grid grid-cols-2 gap-2">
              <DealTile label="Waiting Payment" count={dealBucket("waiting_payment")} tone="warn" />
              <DealTile label="Waiting Payment Receipt" count={dealBucket("waiting_receipt")} tone="info" />
              <DealTile label="Partially Paid" count={dealBucket("partially_paid")} tone="info" />
              <DealTile label="Waiting Currency Delivery" count={dealBucket("waiting_currency_delivery")} tone="warn" />
              <DealTile label="Waiting Delivery Proof" count={dealBucket("waiting_delivery_proof")} tone="warn" />
              <DealTile label="Ready to Close" count={dealBucket("ready_to_close")} tone="success" />
            </div>
          </CardContent>
        </Card>

        {/* SECTION 5 — CUSTOMER BALANCES */}
        <Card className="lg:col-span-1" style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2"><Users2 className="h-4 w-4 text-primary" /> Customer balances</CardTitle>
            <Button size="sm" variant="ghost" asChild><Link to="/wallets">Wallets</Link></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Customers owe us</div>
                <Badge variant="secondary">{owedByCustomers.length}</Badge>
              </div>
              {groupSum(owedByCustomers).length === 0
                ? <div className="text-sm text-muted-foreground mt-1">No debts.</div>
                : groupSum(owedByCustomers).map(([cur, amt]) => (
                    <div key={cur} className="flex justify-between text-sm mt-1">
                      <span className="text-muted-foreground">{cur}</span>
                      <span className="font-mono font-semibold text-emerald-600">{fmt(amt, cur)}</span>
                    </div>
                  ))}
            </div>
            <div className="pt-3 border-t">
              <div className="flex items-baseline justify-between">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">We owe customers</div>
                <Badge variant="secondary">{owedToCustomers.length}</Badge>
              </div>
              {groupSum(owedToCustomers).length === 0
                ? <div className="text-sm text-muted-foreground mt-1">Nothing owed.</div>
                : groupSum(owedToCustomers).map(([cur, amt]) => (
                    <div key={cur} className="flex justify-between text-sm mt-1">
                      <span className="text-muted-foreground">{cur}</span>
                      <span className="font-mono font-semibold text-destructive">{fmt(amt, cur)}</span>
                    </div>
                  ))}
            </div>
          </CardContent>
        </Card>

        {/* SECTION 6 — TODAY */}
        <Card className="lg:col-span-1" style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Bought</div>
              {boughtToday.size === 0 ? <div className="text-sm text-muted-foreground">—</div> :
                Array.from(boughtToday.entries()).map(([cur, amt]) => (
                  <div key={cur} className="flex justify-between text-sm"><span className="text-muted-foreground">{cur}</span><span className="font-mono">{fmt(amt, cur)}</span></div>
                ))}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Sold</div>
              {soldToday.size === 0 ? <div className="text-sm text-muted-foreground">—</div> :
                Array.from(soldToday.entries()).map(([cur, amt]) => (
                  <div key={cur} className="flex justify-between text-sm"><span className="text-muted-foreground">{cur}</span><span className="font-mono">{fmt(amt, cur)}</span></div>
                ))}
            </div>
            <div className="pt-2 border-t grid grid-cols-2 gap-2">
              <MiniStat label="Deals opened" value={String(openedToday)} />
              <MiniStat label="Deals closed" value={String(closedToday)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 3 — ACCOUNT BALANCES */}
      <SectionTitle icon={<Landmark className="h-4 w-4" />} title="Account balances" hint="Grouped by account, one line per currency." />
      <Card className="mb-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <CardContent className="p-0 divide-y">
          {groupedAccounts.length === 0 && <div className="p-6 text-sm text-muted-foreground">No account activity yet.</div>}
          {groupedAccounts.map(acct => (
            <div key={acct.name} className="p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
              <div className="md:col-span-1">
                <div className="text-sm font-semibold">{acct.name}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{accountTypeLabel(acct.type)}</div>
              </div>
              <div className="md:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {acct.lines.map(l => (
                  <div key={l.currency} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">{l.currency}</span>
                    <span className={"font-mono text-sm " + (l.amount < 0 ? "text-destructive" : "")}>{fmt(l.amount, l.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* SECTION 8 — INVENTORY HEALTH + SECTION 9 — RECENT ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <Card style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><PackageCheck className="h-4 w-4 text-primary" /> Inventory health</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <HealthTile label="Available" count={lotHealth.available} tone="success" />
            <HealthTile label="Partial" count={lotHealth.partial} tone="warn" />
            <HealthTile label="Depleted" count={lotHealth.depleted} tone="muted" />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" style={{ boxShadow: "var(--shadow-soft)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y max-h-80 overflow-y-auto">
            {(recentQ.data ?? []).length === 0 && <div className="p-6 text-sm text-muted-foreground">No activity yet.</div>}
            {(recentQ.data ?? []).map((r: any, idx: number) => (
              <div key={r.kind + r.id + idx} className="px-4 py-2 flex items-center gap-3 text-sm">
                <ActivityDot kind={r.kind} />
                <div className="flex-1 truncate">{r.text}</div>
                <div className="text-[11px] text-muted-foreground shrink-0">{new Date(r.when).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ---------- Presentational helpers ----------

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-md bg-background/60 border border-border/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={"font-mono font-semibold text-sm " + (tone === "warn" ? "text-amber-600" : "")}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    depleted: "bg-muted text-muted-foreground border-border",
  };
  return <span className={"text-[10px] uppercase px-1.5 py-0.5 rounded border " + (map[status] ?? map.depleted)}>{status}</span>;
}

function DealTile({ label, count, tone }: { label: string; count: number; tone: "warn" | "info" | "success" }) {
  const tint = tone === "warn" ? "border-amber-500/30 bg-amber-500/10"
    : tone === "success" ? "border-emerald-500/30 bg-emerald-500/10"
    : "border-sky-500/30 bg-sky-500/10";
  return (
    <div className={"rounded-md border p-2 " + tint}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{count}</div>
    </div>
  );
}

function HealthTile({ label, count, tone }: { label: string; count: number; tone: "success" | "warn" | "muted" }) {
  const tint = tone === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : tone === "warn" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "border-border bg-muted/50 text-muted-foreground";
  return (
    <div className={"rounded-lg border p-3 text-center " + tint}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
    </div>
  );
}

function ActivityDot({ kind }: { kind: string }) {
  const cls: Record<string, string> = {
    brought_in: "bg-emerald-500", buy: "bg-sky-500", sell: "bg-violet-500", expense: "bg-rose-500", transfer: "bg-amber-500",
  };
  return <span className={"h-2 w-2 rounded-full shrink-0 " + (cls[kind] ?? "bg-primary")} />;
}

function accountTypeLabel(t: string) {
  const m: Record<string, string> = {
    cash: "Cash Box", aed_bank: "AED Bank", toman_bank: "IRR Bank", foreign_currency: "FX Bank",
    wallet: "Crypto Wallet", person_holding: "Cash with Person", customer_wallet: "Customer Wallet",
    pending_delivery: "Pending Delivery", other: "Other",
  };
  return m[t] ?? t;
}