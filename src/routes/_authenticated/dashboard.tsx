import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/exchange";
import { MarketRatesWidget } from "@/components/market-rates-widget";
import {
  ArrowDown, ArrowUp, ArrowRight, TrendingUp,
  ShoppingCart, ArrowLeftRight, Receipt, ArrowDownToLine, CheckCircle2, Clock,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);

  // Live inventory availability (from lots — same source of truth as inventory page)
  const lotsQ = useQuery({
    queryKey: ["dash_inv_lots_min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_lots")
        .select("currency,remaining_amount,status");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Open sells — used for pending counts + attention list
  const openSellsQ = useQuery({
    queryKey: ["dash_open_sells_min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sell_transactions")
        .select("id,entry_date,deal_status,sold_currency,sold_amount,received_currency,received_amount,currency_delivered,customer_name,expected_payment_date")
        .is("deleted_at", null)
        .not("deal_status", "in", "(closed,cancelled)");
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

  // Today's realized profit — sum gross_profit on sells closed today, grouped by received currency
  const profitTodayQ = useQuery({
    queryKey: ["dash_profit_today", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sell_transactions")
        .select("received_currency,gross_profit,closed_at")
        .is("deleted_at", null)
        .eq("deal_status", "closed")
        .gte("closed_at", `${today}T00:00:00`)
        .lte("closed_at", `${today}T23:59:59.999`);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Yesterday's profit for delta %
  const profitYesterdayQ = useQuery({
    queryKey: ["dash_profit_yesterday", today],
    queryFn: async () => {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yd = y.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("sell_transactions")
        .select("received_currency,gross_profit")
        .is("deleted_at", null)
        .eq("deal_status", "closed")
        .gte("closed_at", `${yd}T00:00:00`)
        .lte("closed_at", `${yd}T23:59:59.999`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const recentQ = useQuery({
    queryKey: ["dash_recent_10"],
    queryFn: async () => {
      const [bi, bu, se, ex, tr] = await Promise.all([
        supabase.from("brought_in_money").select("id,created_at,amount,currency,brought_by,source_name").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("buy_transactions").select("id,created_at,bought_amount,bought_currency,paid_amount,paid_currency").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("sell_transactions").select("id,created_at,sold_amount,sold_currency,received_amount,received_currency,customer_name").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("expenses").select("id,created_at,amount,currency,category").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("transfers").select("id,created_at,amount,currency").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
      ]);
      const rows: any[] = [
        ...(bi.data ?? []).map((r) => ({ kind: "brought_in", when: r.created_at, text: `${r.brought_by ?? "Someone"} brought ${fmt(r.amount, r.currency)}${r.source_name ? " · " + r.source_name : ""}` })),
        ...(bu.data ?? []).map((r) => ({ kind: "buy", when: r.created_at, text: `Bought ${fmt(r.bought_amount, r.bought_currency)} for ${fmt(r.paid_amount, r.paid_currency)}` })),
        ...(se.data ?? []).map((r) => ({ kind: "sell", when: r.created_at, text: `Sold ${fmt(r.sold_amount, r.sold_currency)} → ${fmt(r.received_amount, r.received_currency)}${r.customer_name ? " · " + r.customer_name : ""}` })),
        ...(ex.data ?? []).map((r) => ({ kind: "expense", when: r.created_at, text: `Expense ${fmt(r.amount, r.currency)}${r.category ? " · " + r.category : ""}` })),
        ...(tr.data ?? []).map((r) => ({ kind: "transfer", when: r.created_at, text: `Transfer ${fmt(r.amount, r.currency)}` })),
      ];
      return rows.sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 10);
    },
  });

  const lots = (lotsQ.data ?? []) as any[];
  const openSells = (openSellsQ.data ?? []) as any[];

  const availableByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lots) {
      if (l.status === "depleted") continue;
      const r = Number(l.remaining_amount || 0);
      if (r <= 0) continue;
      m.set(l.currency, (m.get(l.currency) ?? 0) + r);
    }
    return m;
  }, [lots]);

  const aed = availableByCurrency.get("AED") ?? 0;
  const irr = availableByCurrency.get("IRR") ?? 0;

  const pendingDeliveries = openSells.filter((s) => s.sold_currency === "AED" && !s.currency_delivered).length;
  const paymentsWaitingIRR = openSells.filter((s) => s.received_currency === "IRR" && s.derived_status === "waiting_payment").length;

  const profitToday = useMemo(() => {
    const rows = (profitTodayQ.data ?? []) as any[];
    const byCur = new Map<string, number>();
    for (const r of rows) byCur.set(r.received_currency, (byCur.get(r.received_currency) ?? 0) + Number(r.gross_profit || 0));
    const entries = Array.from(byCur.entries()).filter(([, v]) => Math.abs(v) > 0.0001);
    entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return entries[0] ?? null;
  }, [profitTodayQ.data]);

  const profitYesterday = useMemo(() => {
    if (!profitToday) return 0;
    const rows = (profitYesterdayQ.data ?? []) as any[];
    return rows.filter((r) => r.received_currency === profitToday[0]).reduce((n, r) => n + Number(r.gross_profit || 0), 0);
  }, [profitYesterdayQ.data, profitToday]);

  const profitDelta = useMemo(() => {
    if (!profitToday || profitYesterday === 0) return null;
    return ((profitToday[1] - profitYesterday) / Math.abs(profitYesterday)) * 100;
  }, [profitToday, profitYesterday]);

  const openDeals = openSells.length;

  // Attention items — problems only
  const attention = useMemo(() => {
    const items: { key: string; label: string; hint: string; to: string; search?: any; tone: "warn" | "danger" | "info" }[] = [];
    const waitingPay = openSells.filter((s) => s.derived_status === "waiting_payment");
    if (waitingPay.length) items.push({
      key: "wp", label: `${waitingPay.length} customer payment${waitingPay.length > 1 ? "s" : ""} waiting`,
      hint: waitingPay.slice(0, 2).map((s) => `${fmt(s.received_amount, s.received_currency)}${s.customer_name ? " · " + s.customer_name : ""}`).join(" · "),
      to: "/deals", search: { status: "waiting_payment" }, tone: "warn",
    });
    const waitingDeliv = openSells.filter((s) => s.derived_status === "waiting_delivery");
    if (waitingDeliv.length) items.push({
      key: "wd", label: `Deliver ${fmt(waitingDeliv.reduce((n, s) => n + Number(s.sold_amount || 0), 0), waitingDeliv[0]?.sold_currency)}`,
      hint: `${waitingDeliv.length} deal${waitingDeliv.length > 1 ? "s" : ""} pending currency handover`,
      to: "/deals", search: { status: "waiting_delivery" }, tone: "warn",
    });
    const waitingRcpt = openSells.filter((s) => s.derived_status === "waiting_receipt");
    if (waitingRcpt.length) items.push({
      key: "wr", label: `${waitingRcpt.length} receipt${waitingRcpt.length > 1 ? "s" : ""} missing`,
      hint: "Upload payment or delivery proof to close",
      to: "/deals", search: { status: "waiting_receipt" }, tone: "info",
    });
    // Overdue: expected_payment_date < today and still waiting payment
    const overdue = openSells.filter((s) => s.expected_payment_date && s.expected_payment_date < today && s.derived_status === "waiting_payment");
    if (overdue.length) items.push({
      key: "od", label: `${overdue.length} settlement${overdue.length > 1 ? "s" : ""} overdue`,
      hint: "Follow up with customer",
      to: "/pending-settlements", tone: "danger",
    });
    // Low inventory — AED under 5000 or IRR under 100M
    if (aed > 0 && aed < 5000) items.push({
      key: "li-aed", label: "AED inventory running low", hint: `${fmt(aed, "AED")} remaining`,
      to: "/inventory", tone: "warn",
    });
    if (irr > 0 && irr < 100_000_000) items.push({
      key: "li-irr", label: "IRR inventory running low", hint: `${fmt(irr, "IRR")} remaining`,
      to: "/inventory", tone: "warn",
    });
    return items;
  }, [openSells, today, aed, irr]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Greeting — minimal */}
      <header className="pt-2">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Overview · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Today.</h1>
      </header>

      {/* SECTION 1 — 4 hero cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HeroCard
          label="AED Available"
          value={fmt(aed, "AED")}
          unit="AED"
          to="/inventory"
          footer={pendingDeliveries > 0 ? {
            icon: <ArrowDown className="h-3 w-3" />,
            text: `${pendingDeliveries} pending deliver${pendingDeliveries > 1 ? "ies" : "y"}`,
            tone: "warn",
          } : undefined}
        />
        <HeroCard
          label="IRR Available"
          value={fmt(irr, "IRR")}
          unit="IRR"
          to="/inventory"
          footer={paymentsWaitingIRR > 0 ? {
            icon: <ArrowUp className="h-3 w-3" />,
            text: `${paymentsWaitingIRR} payment${paymentsWaitingIRR > 1 ? "s" : ""} waiting`,
            tone: "info",
          } : undefined}
        />
        <HeroCard
          label="Today's Profit"
          value={profitToday ? fmt(profitToday[1], profitToday[0]) : "—"}
          unit={profitToday?.[0] ?? ""}
          to="/statements"
          footer={profitDelta != null ? {
            icon: profitDelta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />,
            text: `${profitDelta >= 0 ? "+" : ""}${profitDelta.toFixed(0)}%`,
            tone: profitDelta >= 0 ? "success" : "danger",
          } : undefined}
          accent={profitToday && profitToday[1] > 0 ? "positive" : profitToday && profitToday[1] < 0 ? "negative" : undefined}
        />
        <HeroCard
          label="Open Deals"
          value={String(openDeals)}
          unit={openDeals === 1 ? "deal" : "deals"}
          to="/deals"
          footer={openDeals > 0 ? { icon: <ArrowRight className="h-3 w-3" />, text: "Tap to continue", tone: "muted" } : undefined}
        />
      </section>

      {/* SECTION 2 — Market rates (tiny) */}
      <section>
        <SectionLabel>Market Rates</SectionLabel>
        <MarketRatesWidget />
      </section>

      {/* SECTION 3 — Needs Attention */}
      <section>
        <SectionLabel>Needs Your Attention</SectionLabel>
        {attention.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <div className="text-sm font-medium">Everything is under control</div>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card overflow-hidden">
            {attention.map((a) => (
              <li key={a.key}>
                <Link
                  to={a.to as any}
                  search={a.search as any}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <span className={`h-2 w-2 rounded-full ${a.tone === "danger" ? "bg-destructive" : a.tone === "warn" ? "bg-amber-500" : "bg-sky-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.hint}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* SECTION 4 — Recent Activity */}
      <section className="pb-6">
        <SectionLabel>Recent Activity</SectionLabel>
        <ul className="divide-y rounded-xl border bg-card overflow-hidden">
          {(recentQ.data ?? []).length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center">No activity yet.</li>
          )}
          {(recentQ.data ?? []).map((r: any, i: number) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="h-8 w-8 rounded-full grid place-items-center bg-muted text-muted-foreground shrink-0">
                <ActivityIcon kind={r.kind} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{r.text}</div>
                <div className="text-[11px] text-muted-foreground">{relTime(r.when)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/80 mb-3">{children}</div>
  );
}

function HeroCard({
  label, value, unit, to, footer, accent,
}: {
  label: string; value: string; unit?: string; to: string;
  footer?: { icon: React.ReactNode; text: string; tone: "warn" | "info" | "success" | "danger" | "muted" };
  accent?: "positive" | "negative";
}) {
  const toneClass = (t?: string) => t === "warn" ? "text-amber-600 dark:text-amber-400"
    : t === "info" ? "text-sky-600 dark:text-sky-400"
    : t === "success" ? "text-emerald-600 dark:text-emerald-400"
    : t === "danger" ? "text-destructive"
    : "text-muted-foreground";
  return (
    <Link
      to={to as any}
      className="group rounded-2xl border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-medium">{label}</div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <div className={`text-2xl md:text-3xl font-semibold tracking-tight font-mono tabular-nums ${accent === "positive" ? "text-emerald-600 dark:text-emerald-400" : accent === "negative" ? "text-destructive" : ""}`}>
          {value}
        </div>
        {unit && <div className="text-xs text-muted-foreground uppercase tracking-wider">{unit}</div>}
      </div>
      <div className="mt-4 h-4">
        {footer && (
          <div className={`flex items-center gap-1 text-[11px] font-medium ${toneClass(footer.tone)}`}>
            {footer.icon}
            <span>{footer.text}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function ActivityIcon({ kind }: { kind: string }) {
  const cls = "h-4 w-4";
  switch (kind) {
    case "brought_in": return <ArrowDownToLine className={cls} />;
    case "buy": return <ShoppingCart className={cls} />;
    case "sell": return <TrendingUp className={cls} />;
    case "expense": return <Receipt className={cls} />;
    case "transfer": return <ArrowLeftRight className={cls} />;
    default: return <Clock className={cls} />;
  }
}

function relTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}