import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { fmt } from "@/lib/exchange";
import { holderLabel } from "@/lib/settlement";
import {
  ArrowDownToLine, ShoppingCart, TrendingUp, Receipt, ArrowLeftRight,
  Users, Wallet as WalletIcon, AlertTriangle, ClipboardList, HandCoins,
  ShieldCheck, Landmark, Send, ArrowUpFromLine, Radar, LineChart as LineChartIcon,
} from "lucide-react";
import { fmtProfit } from "@/lib/exchange";
import {
  LineChart, Line as RLine, XAxis, Tooltip, ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const quickActions = [
  { to: "/brought-in", label: "Add Brought-In", icon: ArrowDownToLine },
  { to: "/buy", label: "New Buy", icon: ShoppingCart },
  { to: "/sell", label: "New Sell", icon: TrendingUp },
  { to: "/expenses", label: "Add Expense", icon: Receipt },
  { to: "/transfers", label: "Transfer", icon: ArrowLeftRight },
  { to: "/customers", label: "Add Customer", icon: Users },
  { to: "/accounts", label: "Add Account", icon: WalletIcon },
  { to: "/deposits", label: "Customer Deposit", icon: ArrowUpFromLine },
  { to: "/payment-orders", label: "Payment Order", icon: Send },
  { to: "/wallets", label: "Customer Wallets", icon: Landmark },
  { to: "/trust", label: "Trust vs Company", icon: ShieldCheck },
] as const;

function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);

  const kpiAssetsQ = useQuery({
    queryKey: ["v_total_assets_by_currency"],
    queryFn: async () => (await supabase.from("v_total_assets_by_currency").select("*")).data ?? [],
  });
  const kpiCashQ = useQuery({
    queryKey: ["v_cash_available"],
    queryFn: async () => (await supabase.from("v_cash_available").select("*")).data ?? [],
  });
  const kpiCircQ = useQuery({
    queryKey: ["v_money_in_circulation"],
    queryFn: async () => (await supabase.from("v_money_in_circulation").select("*")).data ?? [],
  });
  const kpiTodayQ = useQuery({
    queryKey: ["v_today_profit"],
    queryFn: async () => (await supabase.from("v_today_profit").select("*").maybeSingle()).data,
  });
  const kpiMonthQ = useQuery({
    queryKey: ["v_month_profit"],
    queryFn: async () => (await supabase.from("v_month_profit").select("*").maybeSingle()).data,
  });
  const kpiSeriesQ = useQuery({
    queryKey: ["v_daily_profit_series"],
    queryFn: async () => (await supabase.from("v_daily_profit_series").select("*")).data ?? [],
  });
  const kpiAliQ = useQuery({
    queryKey: ["v_ali_capital_summary"],
    queryFn: async () => (await supabase.from("v_ali_capital_summary").select("*").maybeSingle()).data,
  });

  const balancesQ = useQuery({
    queryKey: ["account_balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const balByTypeQ = useQuery({
    queryKey: ["v_balances_by_currency_type"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_balances_by_currency_type").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const inventoryQ = useQuery({
    queryKey: ["currency_inventory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currency_inventory").select("*");
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
  const todayExpensesQ = useQuery({
    queryKey: ["today_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").eq("entry_date", today).is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const balances = balancesQ.data ?? [];
  const totalByCurrency = (cur: string) =>
    balances.filter((b: any) => b.currency === cur).reduce((s: number, b: any) => s + Number(b.current_balance || 0), 0);
  const cashTotal = balances.filter((b: any) => b.account_type === "cash").reduce((s: number, b: any) => s + Number(b.current_balance || 0), 0);

  const grossProfit = (todaySellsQ.data ?? []).reduce((s: number, r: any) => s + Number(r.gross_profit || 0), 0);
  const miladShare = (todaySellsQ.data ?? []).reduce((s: number, r: any) => s + Number(r.milad_profit || 0), 0);
  const aliShare = (todaySellsQ.data ?? []).reduce((s: number, r: any) => s + Number(r.ali_profit || 0), 0);
  const businessExpensesReducingProfit = (todayExpensesQ.data ?? [])
    .filter((e: any) => e.reduces_profit)
    .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const netProfit = grossProfit - businessExpensesReducingProfit;

  const lowBalance = balances.filter((b: any) => Number(b.current_balance) < 0);

  const pendingBuysQ = useQuery({
    queryKey: ["action_center", "buys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buy_transactions").select("*").is("deleted_at", null).not("settlement_status", "in", "(completed,cancelled)").order("entry_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const pendingSellsQ = useQuery({
    queryKey: ["action_center", "sells"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sell_transactions").select("*").is("deleted_at", null).not("settlement_status", "in", "(completed,cancelled)").order("entry_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const holdingQ = useQuery({
    queryKey: ["action_center", "holdings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*").eq("account_type", "person_holding");
      if (error) throw error;
      return (data ?? []).filter((b: any) => Math.abs(Number(b.current_balance || 0)) > 0.0001);
    },
  });

  const trustQ = useQuery({
    queryKey: ["company_vs_customer_funds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_vs_customer_funds").select("*");
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
  const pendingDepositsQ = useQuery({
    queryKey: ["action_center", "deposits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_deposits").select("*, customer:customers(name)").is("deleted_at", null).neq("settlement_status", "completed").neq("settlement_status", "cancelled").order("entry_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const pendingOrdersQ = useQuery({
    queryKey: ["action_center", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_orders").select("*, customer:customers(name)").is("deleted_at", null).neq("settlement_status", "completed").neq("settlement_status", "cancelled").order("entry_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const scTodayQ = useQuery({
    queryKey: ["sc_today", today],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_charges").select("*").eq("entry_date", today);
      if (error) throw error;
      return data ?? [];
    },
  });

  const alerts: { text: string; tone: "warn" | "info" }[] = [];
  (pendingBuysQ.data ?? []).forEach((r: any) => {
    if (r.money_holder_type && r.money_holder_type !== "customer") {
      alerts.push({ text: `${fmt(r.paid_amount, r.paid_currency)} sitting with ${holderLabel(r.money_holder_type)} — buy from ${r.entry_date}`, tone: "warn" });
    }
    if (r.currency_holder_type && r.currency_holder_type !== "customer") {
      alerts.push({ text: `${fmt(r.bought_amount, r.bought_currency)} currency with ${holderLabel(r.currency_holder_type)} — must be delivered`, tone: "warn" });
    }
  });
  (pendingSellsQ.data ?? []).forEach((r: any) => {
    if (r.settlement_status === "payment_received") {
      alerts.push({ text: `Payment received for sell on ${r.entry_date} — currency delivery pending`, tone: "warn" });
    }
    if (r.settlement_status === "currency_delivered") {
      alerts.push({ text: `Currency delivered on ${r.entry_date} — payment / receipt still pending`, tone: "warn" });
    }
    if (r.settlement_status === "awaiting_receipt") {
      alerts.push({ text: `Sell on ${r.entry_date} — receipt / final proof missing`, tone: "warn" });
    }
  });
  (holdingQ.data ?? []).forEach((b: any) => {
    alerts.push({ text: `${fmt(b.current_balance, b.currency)} held in ${b.name}`, tone: "info" });
  });
  (walletsQ.data ?? []).forEach((w: any) => {
    const bal = Number(w.balance || 0);
    if (bal < -0.0001) {
      alerts.push({ text: `${w.customer_name} owes us ${fmt(-bal, w.currency)} (wallet debt)`, tone: "warn" });
    } else if (bal > 0.0001) {
      alerts.push({ text: `We hold ${fmt(bal, w.currency)} for ${w.customer_name}`, tone: "info" });
    }
  });
  (pendingDepositsQ.data ?? []).forEach((r: any) => {
    alerts.push({ text: `Deposit from ${r.customer?.name} ${fmt(r.amount, r.currency)} — needs receipt & completion`, tone: "warn" });
  });
  (pendingOrdersQ.data ?? []).forEach((r: any) => {
    alerts.push({ text: `Payment order for ${r.customer?.name} ${fmt(r.amount, r.currency)} → ${r.receiver_name || r.destination_bank || "receiver"} pending`, tone: "warn" });
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live view of balances, today's activity, and profit sharing."
      />

      {/* Premium KPI hero row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <HeroKpi
          label="Total assets"
          value={fmtProfit((kpiAssetsQ.data ?? []).reduce((s: number, r: any) => s + Number(r.balance || 0), 0))}
          hint={`${(kpiAssetsQ.data ?? []).length} currencies`}
          tone="primary"
        />
        <HeroKpi
          label="Today's profit"
          value={fmtProfit(Number((kpiTodayQ.data as any)?.gross_profit ?? 0))}
          hint={`${(kpiTodayQ.data as any)?.sell_count ?? 0} sells`}
          tone="success"
        />
        <HeroKpi
          label="This month"
          value={fmtProfit(Number((kpiMonthQ.data as any)?.gross_profit ?? 0))}
          hint={`${(kpiMonthQ.data as any)?.sell_count ?? 0} sells`}
          tone="success"
        />
        <HeroKpi
          label="Cash available"
          value={fmtProfit((kpiCashQ.data ?? []).reduce((s: number, r: any) => s + Number(r.balance || 0), 0))}
          hint="Cash + banks"
          tone="info"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MiniKpi
          label="Money in circulation"
          value={fmtProfit((kpiCircQ.data ?? []).reduce((s: number, r: any) => s + Number(r.balance || 0), 0))}
        />
        <MiniKpi
          label="Customer funds"
          value={fmtProfit((trustQ.data ?? []).filter((r: any) => r.bucket === "customer").reduce((s: number, r: any) => s + Number(r.balance || 0), 0))}
        />
        <MiniKpi
          label="Service fees (today)"
          value={fmtProfit((scTodayQ.data ?? []).reduce((s: number, r: any) => s + Number(r.amount||0), 0))}
        />
        <MiniKpi
          label="ROI (Ali)"
          value={(() => {
            const c = kpiAliQ.data as any;
            const inb = Number(c?.total_brought_in ?? 0);
            const p = Number(c?.total_profit_share ?? 0);
            return inb > 0 ? ((p / inb) * 100).toFixed(1) + "%" : "—";
          })()}
        />
      </div>

      <Card className="mb-6 backdrop-blur bg-card/80" style={{ boxShadow: "var(--shadow-elevated)" }}>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2"><LineChartIcon className="h-4 w-4 text-primary" /> Profit trend (30 days)</CardTitle>
          <Button asChild size="sm" variant="ghost"><Link to="/ali-investor"><Radar className="h-4 w-4 mr-1" /> Ali view</Link></Button>
        </CardHeader>
        <CardContent className="h-48">
          <ResponsiveContainer>
            <LineChart data={(kpiSeriesQ.data ?? []) as any[]}>
              <XAxis dataKey="day" tickFormatter={(v) => String(v).slice(5)} fontSize={10} />
              <Tooltip />
              <RLine type="monotone" dataKey="gross_profit" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Button asChild size="lg" className="h-16 text-base font-semibold col-span-2 md:col-span-1 shadow-md">
          <Link to="/quick-sell"><TrendingUp className="h-5 w-5 mr-2" /> New Sell</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-16"><Link to="/buy"><ShoppingCart className="h-5 w-5 mr-2" /> Buy</Link></Button>
        <Button asChild size="lg" variant="outline" className="h-16"><Link to="/brought-in"><ArrowDownToLine className="h-5 w-5 mr-2" /> Brought In</Link></Button>
        <Button asChild size="lg" variant="outline" className="h-16"><Link to="/expenses"><Receipt className="h-5 w-5 mr-2" /> Expense</Link></Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="AED balance" value={fmt(totalByCurrency("AED"), "AED")} />
        <StatCard label="Toman balance" value={fmt(totalByCurrency("IRR"), "IRR")} />
        <StatCard label="USD balance" value={fmt(totalByCurrency("USD"), "USD")} />
        <StatCard label="Cash total (mixed)" value={fmt(cashTotal)} />
        <StatCard label="Cash with People" value={String((holdingQ.data ?? []).length) + " lines"} />
      </div>

      <Card className="mb-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /> Balances by currency & account type</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {(() => {
            const rows = (balByTypeQ.data ?? []) as any[];
            const currencies = Array.from(new Set(rows.map(r => r.currency))).sort();
            const types = Array.from(new Set(rows.map(r => r.account_type))).sort();
            const cell = (c: string, t: string) =>
              rows.find(r => r.currency === c && r.account_type === t)?.total_balance;
            const typeLabel: Record<string,string> = {
              cash: "Cash Box", toman_bank: "IRR Bank", aed_bank: "AED Bank",
              foreign_currency: "FX Bank", wallet: "Crypto",
              person_holding: "Cash with Person", customer_wallet: "Customer Wallet",
              pending_delivery: "Pending Delivery", other: "Other",
            };
            if (currencies.length === 0) return <div className="p-4 text-sm text-muted-foreground">No accounts yet.</div>;
            return (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left p-2 font-medium">Currency</th>
                    {types.map(t => <th key={t} className="text-right p-2 font-medium">{typeLabel[t] ?? t}</th>)}
                    <th className="text-right p-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {currencies.map(c => {
                    const total = rows.filter(r => r.currency === c).reduce((s, r) => s + Number(r.total_balance || 0), 0);
                    return (
                      <tr key={c} className="border-t">
                        <td className="p-2 font-medium">{c}</td>
                        {types.map(t => {
                          const v = cell(c, t);
                          return <td key={t} className="text-right p-2 font-mono text-xs">{v === undefined || Number(v) === 0 ? "—" : fmt(Number(v), c)}</td>;
                        })}
                        <td className="text-right p-2 font-mono font-semibold">{fmt(total, c)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </CardContent>
      </Card>

      <Card className="mb-6 border-emerald-500/30" style={{ boxShadow: "var(--shadow-soft)" }}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Trust separation</CardTitle>
          <Button size="sm" variant="outline" asChild><Link to="/trust">View report</Link></Button>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Company assets</div>
            {(trustQ.data ?? []).filter((r: any) => r.bucket === "company").map((r: any) => (
              <div key={r.currency} className="flex justify-between border-b py-1 last:border-0">
                <span className="text-muted-foreground">{r.currency}</span>
                <span className="font-mono">{fmt(r.balance, r.currency)}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Customer trust funds</div>
            {(trustQ.data ?? []).filter((r: any) => r.bucket === "customer").map((r: any) => (
              <div key={r.currency} className="flex justify-between border-b py-1 last:border-0">
                <span className="text-muted-foreground">{r.currency}</span>
                <span className={"font-mono " + (Number(r.balance) < 0 ? "text-destructive" : "")}>{fmt(r.balance, r.currency)}</span>
              </div>
            ))}
            {(trustQ.data ?? []).filter((r: any) => r.bucket === "customer").length === 0 && (
              <div className="text-xs text-muted-foreground">No customer balances.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 border-warning/40" style={{ boxShadow: "var(--shadow-soft)" }}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Action Center</CardTitle>
          <Button size="sm" variant="outline" asChild><Link to="/pending-settlements">View all</Link></Button>
        </CardHeader>
        <CardContent className="space-y-1 text-sm max-h-72 overflow-y-auto">
          {alerts.length === 0 ? (
            <p className="text-muted-foreground">Nothing pending. All transactions are settled.</p>
          ) : alerts.slice(0, 12).map((a, i) => (
            <div key={i} className="flex items-start gap-2 py-1 border-b last:border-0">
              <span className={a.tone === "warn" ? "text-warning" : "text-sky-600"}>●</span>
              <span className="flex-1">{a.text}</span>
            </div>
          ))}
          {alerts.length > 12 && (
            <div className="text-xs text-muted-foreground pt-2">+ {alerts.length - 12} more…</div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
            {quickActions.map((a) => (
              <Button key={a.to} asChild variant="outline" className="h-20 flex-col gap-1">
                <Link to={a.to}>
                  <a.icon className="h-5 w-5" />
                  <span className="text-xs">{a.label}</span>
                </Link>
              </Button>
            ))}
            <Button asChild variant="outline" className="h-20 flex-col gap-1">
              <Link to="/pending-settlements"><ClipboardList className="h-5 w-5" /><span className="text-xs">Pending</span></Link>
            </Button>
            <Button asChild variant="outline" className="h-20 flex-col gap-1">
              <Link to="/held-by-person"><HandCoins className="h-5 w-5" /><span className="text-xs">Cash with People</span></Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Today at a glance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Buys" value={`${todayBuysQ.data?.length ?? 0}`} />
            <Row label="Sells" value={`${todaySellsQ.data?.length ?? 0}`} />
            <Row label="Expenses" value={`${todayExpensesQ.data?.length ?? 0}`} />
            <Row label="Gross profit" value={fmt(grossProfit)} />
            <Row label="Business expenses (reduce profit)" value={fmt(businessExpensesReducingProfit)} />
            <Row label="Net profit" value={fmt(netProfit)} accent />
            <Row label="Service charges (today)" value={(scTodayQ.data ?? []).length === 0 ? "—" : (scTodayQ.data ?? []).reduce((s: number, r: any) => s + Number(r.amount||0), 0).toFixed(2)} />
            <Row label="Milad share" value={fmt(miladShare)} />
            <Row label="Ali share" value={fmt(aliShare)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lowBalance.length === 0 ? (
              <p className="text-muted-foreground">No negative balances. All good.</p>
            ) : (
              lowBalance.map((b: any) => (
                <div key={b.account_id} className="flex justify-between">
                  <span>{b.name}</span>
                  <Badge variant="destructive">{fmt(b.current_balance, b.currency)}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Currency inventory</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(inventoryQ.data ?? []).map((i: any) => (
              <div key={i.currency} className="rounded-lg border p-3 bg-secondary/40">
                <div className="text-xs text-muted-foreground">{i.currency}</div>
                <div className="text-lg font-semibold">{fmt(i.total_amount)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ boxShadow: "var(--shadow-soft)" }}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold tracking-tight mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function HeroKpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone: "primary" | "success" | "info" }) {
  const accent =
    tone === "success" ? "from-emerald-500/10 to-transparent border-emerald-500/30" :
    tone === "info" ? "from-sky-500/10 to-transparent border-sky-500/30" :
    "from-primary/10 to-transparent border-primary/30";
  return (
    <Card className={"backdrop-blur bg-gradient-to-br " + accent} style={{ boxShadow: "var(--shadow-elevated)" }}>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-2xl md:text-3xl font-bold tracking-tight mt-1">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="backdrop-blur bg-card/70" style={{ boxShadow: "var(--shadow-soft)" }}>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tracking-tight mt-0.5">{value}</div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-semibold text-accent" : "font-medium"}>{value}</span>
    </div>
  );
}