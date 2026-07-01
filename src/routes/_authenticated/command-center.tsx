import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { fmt } from "@/lib/exchange";
import {
  AlertTriangle, HandCoins, Users, FileWarning, Truck, Wallet,
  ClipboardList, TrendingDown, CalendarClock, Send, ArrowUpFromLine,
} from "lucide-react";
import { Repeat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/command-center")({
  component: CommandCenter,
});

function CommandCenter() {
  const today = new Date().toISOString().slice(0, 10);

  const balancesQ = useQuery({
    queryKey: ["cc_balances"],
    queryFn: async () => (await supabase.from("account_balances").select("*")).data ?? [],
  });
  const walletsQ = useQuery({
    queryKey: ["cc_wallets"],
    queryFn: async () => (await supabase.from("customer_wallet_balances").select("*")).data ?? [],
  });
  const buysQ = useQuery({
    queryKey: ["cc_buys"],
    queryFn: async () => (await supabase.from("buy_transactions").select("*").is("deleted_at", null).not("settlement_status", "in", "(completed,cancelled)")).data ?? [],
  });
  const sellsQ = useQuery({
    queryKey: ["cc_sells"],
    queryFn: async () => (await supabase.from("sell_transactions").select("*").is("deleted_at", null).not("settlement_status", "in", "(completed,cancelled)")).data ?? [],
  });
  const depositsQ = useQuery({
    queryKey: ["cc_deposits"],
    queryFn: async () => (await supabase.from("customer_deposits").select("*, customer:customers(name)").is("deleted_at", null).neq("settlement_status", "completed").neq("settlement_status", "cancelled")).data ?? [],
  });
  const ordersQ = useQuery({
    queryKey: ["cc_orders"],
    queryFn: async () => (await supabase.from("payment_orders").select("*, customer:customers(name)").is("deleted_at", null).neq("settlement_status", "completed").neq("settlement_status", "cancelled")).data ?? [],
  });
  const closingQ = useQuery({
    queryKey: ["cc_closing", today],
    queryFn: async () => (await supabase.from("daily_closings").select("*").eq("closing_date", today)).data ?? [],
  });

  const tradesQ = useQuery({
    queryKey: ["cc_trades"],
    queryFn: async () => (await supabase.from("trade_cycles" as any)
      .select("*, customer:customers!trade_cycles_customer_id_fkey(name)")
      .is("deleted_at", null)
      .not("status", "in", "(completed,cancelled)")).data ?? [],
  });
  const openMovementsQ = useQuery({
    queryKey: ["cc_open_movs"],
    queryFn: async () => (await supabase.from("trade_movements" as any)
      .select("*").is("deleted_at", null)
      .not("status", "in", "(completed,waived,failed)")).data ?? [],
  });

  const balances = balancesQ.data ?? [];
  const heldMilad = balances.filter((b: any) => b.account_type === "person_holding" && b.holder_type === "milad" && Math.abs(Number(b.current_balance || 0)) > 0.0001);
  const heldAli = balances.filter((b: any) => b.account_type === "person_holding" && b.holder_type === "ali" && Math.abs(Number(b.current_balance || 0)) > 0.0001);
  const heldCustomer = balances.filter((b: any) => b.account_type === "person_holding" && b.holder_type === "customer" && Math.abs(Number(b.current_balance || 0)) > 0.0001);
  const negative = balances.filter((b: any) => Number(b.current_balance) < -0.0001 && b.account_type !== "customer_wallet");
  const lowCash = balances.filter((b: any) =>
    ["cash", "aed_bank", "toman_bank", "foreign_currency"].includes(b.account_type) &&
    Number(b.current_balance) > 0 && Number(b.current_balance) < 500
  );

  const missingReceipts = [...(buysQ.data ?? []), ...(sellsQ.data ?? [])].filter((r: any) =>
    r.settlement_status === "awaiting_receipt" || r.settlement_status === "awaiting_payment"
  );
  const pendingDelivery = [...(buysQ.data ?? []), ...(sellsQ.data ?? [])].filter((r: any) =>
    r.settlement_status === "awaiting_delivery" || r.settlement_status === "payment_received"
  );
  const pendingPayment = [...(buysQ.data ?? []), ...(sellsQ.data ?? [])].filter((r: any) =>
    r.settlement_status === "awaiting_payment" || r.settlement_status === "currency_delivered"
  );
  const walletDebt = (walletsQ.data ?? []).filter((w: any) => Number(w.balance) < -0.0001);
  const openTxns = (buysQ.data?.length ?? 0) + (sellsQ.data?.length ?? 0);
  const closingMissing = (closingQ.data ?? []).length === 0;

  const trades: any[] = tradesQ.data ?? [];
  const openMovs: any[] = openMovementsQ.data ?? [];
  const tradesAwaitingProfit = trades.filter((t) => Number(t.received_profit || 0) < Number(t.expected_profit || 0));
  const tradesWithOpenLegs = trades.filter((t) => openMovs.some((m) => m.trade_id === t.id));
  const thirdPartyPending = openMovs.filter((m) =>
    m.movement_type === "pay_third_party" || m.movement_type === "receive_third_party"
  );

  // Cycle-profit alerts: intermediate currency still awaiting buyback
  const cyclesAwaitingBuyback = trades.filter((t: any) =>
    (Number(t.intermediate_received || 0) - Number(t.intermediate_used || 0)) > 0.0001
  );
  const cyclesInLoss = trades.filter((t: any) => Number(t.realized_profit || 0) < 0);

  return (
    <>
      <PageHeader
        title="Command Center"
        description="Everything that needs attention, in one place."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <ActionCard
          icon={HandCoins} tone="warn" title="Held by Milad" count={heldMilad.length}
          empty="Nothing held" to="/held-by-person"
        >
          {heldMilad.map((b: any) => <Line key={b.account_id} label={b.name} value={fmt(b.current_balance, b.currency)} />)}
        </ActionCard>

        <ActionCard
          icon={HandCoins} tone="warn" title="Held by Ali" count={heldAli.length}
          empty="Nothing held" to="/held-by-person"
        >
          {heldAli.map((b: any) => <Line key={b.account_id} label={b.name} value={fmt(b.current_balance, b.currency)} />)}
        </ActionCard>

        <ActionCard
          icon={Users} tone="info" title="Held by Customer" count={heldCustomer.length}
          empty="Nothing held" to="/held-by-person"
        >
          {heldCustomer.slice(0, 5).map((b: any) => <Line key={b.account_id} label={b.name} value={fmt(b.current_balance, b.currency)} />)}
          {heldCustomer.length > 5 && <div className="text-xs text-muted-foreground pt-1">+ {heldCustomer.length - 5} more</div>}
        </ActionCard>

        <ActionCard
          icon={FileWarning} tone="warn" title="Missing receipts" count={missingReceipts.length}
          empty="All receipts uploaded" to="/pending-settlements"
        >
          {missingReceipts.slice(0, 4).map((r: any) => (
            <Line key={r.id} label={r.entry_date} value={fmt(r.paid_amount || r.received_amount, r.paid_currency || r.received_currency)} />
          ))}
        </ActionCard>

        <ActionCard
          icon={Truck} tone="warn" title="Pending delivery" count={pendingDelivery.length}
          empty="No pending deliveries" to="/pending-settlements"
        >
          {pendingDelivery.slice(0, 4).map((r: any) => (
            <Line key={r.id} label={r.entry_date} value={fmt(r.bought_amount || r.sold_amount, r.bought_currency || r.sold_currency)} />
          ))}
        </ActionCard>

        <ActionCard
          icon={ArrowUpFromLine} tone="warn" title="Pending payment" count={pendingPayment.length}
          empty="No pending payments" to="/pending-settlements"
        >
          {pendingPayment.slice(0, 4).map((r: any) => (
            <Line key={r.id} label={r.entry_date} value={fmt(r.paid_amount || r.received_amount, r.paid_currency || r.received_currency)} />
          ))}
        </ActionCard>

        <ActionCard
          icon={TrendingDown} tone="error" title="Customer debt" count={walletDebt.length}
          empty="No customer owes us" to="/wallets"
        >
          {walletDebt.slice(0, 5).map((w: any, i: number) => (
            <Line key={i} label={w.customer_name} value={fmt(-Number(w.balance), w.currency)} />
          ))}
        </ActionCard>

        <ActionCard
          icon={AlertTriangle} tone="error" title="Negative balances" count={negative.length}
          empty="No negative balances" to="/accounts"
        >
          {negative.slice(0, 5).map((b: any) => <Line key={b.account_id} label={b.name} value={fmt(b.current_balance, b.currency)} />)}
        </ActionCard>

        <ActionCard
          icon={Wallet} tone="warn" title="Low cash warnings" count={lowCash.length}
          empty="Cash levels healthy" to="/accounts"
        >
          {lowCash.slice(0, 5).map((b: any) => <Line key={b.account_id} label={b.name} value={fmt(b.current_balance, b.currency)} />)}
        </ActionCard>

        <ActionCard
          icon={ClipboardList} tone="info" title="Open transactions" count={openTxns}
          empty="All settled" to="/pending-settlements"
        >
          <Line label="Open buys" value={String(buysQ.data?.length ?? 0)} />
          <Line label="Open sells" value={String(sellsQ.data?.length ?? 0)} />
          <Line label="Open deposits" value={String(depositsQ.data?.length ?? 0)} />
          <Line label="Open payment orders" value={String(ordersQ.data?.length ?? 0)} />
        </ActionCard>

        <ActionCard
          icon={Send} tone="info" title="Payment orders in flight" count={ordersQ.data?.length ?? 0}
          empty="None" to="/payment-orders"
        >
          {(ordersQ.data ?? []).slice(0, 4).map((r: any) => (
            <Line key={r.id} label={r.customer?.name || "—"} value={fmt(r.amount, r.currency)} />
          ))}
        </ActionCard>

        <ActionCard
          icon={CalendarClock} tone={closingMissing ? "warn" : "info"}
          title="Daily closing" count={closingMissing ? 1 : 0}
          empty="Closed for today" to="/daily-closing"
        >
          <Line label={today} value={closingMissing ? "Not closed" : "Closed"} />
        </ActionCard>

        <ActionCard
          icon={Repeat} tone="warn" title="Trades — profit pending" count={tradesAwaitingProfit.length}
          empty="All trade profits collected" to="/trades"
        >
          {tradesAwaitingProfit.slice(0, 5).map((t: any) => (
            <Line key={t.id} label={`${t.code} · ${t.customer?.name ?? "—"}`} value={fmt((Number(t.expected_profit || 0) - Number(t.received_profit || 0)), t.expected_profit_currency)} />
          ))}
        </ActionCard>

        <ActionCard
          icon={Repeat} tone="warn" title="Trades — open legs" count={tradesWithOpenLegs.length}
          empty="All trade movements settled" to="/trades"
        >
          {tradesWithOpenLegs.slice(0, 5).map((t: any) => (
            <Line key={t.id} label={`${t.code} · ${t.customer?.name ?? "—"}`} value={`${openMovs.filter((m) => m.trade_id === t.id).length} open`} />
          ))}
        </ActionCard>

        <ActionCard
          icon={Send} tone="warn" title="Third-party payments pending" count={thirdPartyPending.length}
          empty="No third-party payments pending" to="/trades"
        >
          {thirdPartyPending.slice(0, 5).map((m: any) => (
            <Line key={m.id} label={m.to_label || m.from_label || m.movement_type} value={fmt(m.amount, m.currency)} />
          ))}
        </ActionCard>
      </div>
    </>
  );
}

function ActionCard({
  icon: Icon, title, count, tone, empty, to, children,
}: {
  icon: any; title: string; count: number; tone: "warn" | "info" | "error";
  empty: string; to: string; children?: React.ReactNode;
}) {
  const border =
    tone === "error" ? "border-destructive/40" :
    tone === "warn" ? "border-warning/40" : "border-border";
  return (
    <Card className={"backdrop-blur bg-card/80 " + border} style={{ boxShadow: "var(--shadow-soft)" }}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Icon className={"h-4 w-4 " + (tone === "error" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-primary")} />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
        {count > 0 ? (
          <Badge variant={tone === "error" ? "destructive" : "secondary"}>{count}</Badge>
        ) : (
          <Badge variant="outline" className="text-emerald-700 border-emerald-300">OK</Badge>
        )}
      </CardHeader>
      <CardContent className="text-sm space-y-1 min-h-[80px]">
        {count === 0 ? (
          <p className="text-muted-foreground text-xs">{empty}</p>
        ) : children}
        <div className="pt-2">
          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <Link to={to}>Open →</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/50 py-1 last:border-0">
      <span className="text-muted-foreground truncate mr-2">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}