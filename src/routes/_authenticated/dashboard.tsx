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
} from "lucide-react";

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
] as const;

function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);

  const balancesQ = useQuery({
    queryKey: ["account_balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*");
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

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live view of balances, today's activity, and profit sharing."
      />

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
        <StatCard label="Held by people" value={String((holdingQ.data ?? []).length) + " lines"} />
      </div>

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
              <Link to="/held-by-person"><HandCoins className="h-5 w-5" /><span className="text-xs">Held by Person</span></Link>
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

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-semibold text-accent" : "font-medium"}>{value}</span>
    </div>
  );
}