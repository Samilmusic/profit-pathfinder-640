import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { fmt } from "@/lib/exchange";
import {
  ArrowDownToLine, ShoppingCart, TrendingUp, Receipt, ArrowLeftRight,
  Users, Wallet as WalletIcon, AlertTriangle,
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

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live view of balances, today's activity, and profit sharing."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="AED balance" value={fmt(totalByCurrency("AED"), "AED")} />
        <StatCard label="Toman balance" value={fmt(totalByCurrency("IRR"), "IRR")} />
        <StatCard label="USD balance" value={fmt(totalByCurrency("USD"), "USD")} />
        <StatCard label="Cash total (mixed)" value={fmt(cashTotal)} />
      </div>

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