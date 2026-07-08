import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fmt } from "@/lib/exchange";
import { dealCode, kindLabel, kindHref, type DealKind } from "@/lib/deal-code";
import { Search, ArrowDownToLine, ShoppingCart, TrendingUp, Receipt, ArrowLeftRight, ArrowUpFromLine, Send } from "lucide-react";

const searchSchema = z.object({
  status: fallback(z.string(), "all").default("all"),
  type: fallback(z.string(), "all").default("all"),
  currency: fallback(z.string(), "all").default("all"),
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/deals")({
  validateSearch: zodValidator(searchSchema),
  component: DealCenterPage,
  head: () => ({
    meta: [
      { title: "Deal Center — Exchange Portal" },
      { name: "description", content: "Every deal in one place. Filter by status, type, or currency." },
    ],
  }),
});

// ---------- normalized deal row ----------

type NormDeal = {
  id: string;
  kind: DealKind;
  code: string;
  date: string;
  customer?: string | null;
  currencyOut?: string | null;
  amountOut?: number | null;
  currencyIn?: string | null;
  amountIn?: number | null;
  rate?: number | null;
  status: string;         // canonical bucket
  statusLabel: string;    // display
  missing?: string | null;
  raw: any;
};

const STATUS_TABS = [
  { key: "all",              label: "All" },
  { key: "open",             label: "Open" },
  { key: "waiting_payment",  label: "Waiting Payment" },
  { key: "waiting_receipt",  label: "Waiting Receipt" },
  { key: "waiting_delivery", label: "Waiting Delivery" },
  { key: "ready_to_close",   label: "Ready to Close" },
  { key: "closed",           label: "Closed" },
  { key: "cancelled",        label: "Cancelled" },
];

const TYPE_TABS = [
  { key: "all",         label: "All types" },
  { key: "sell",        label: "Sell" },
  { key: "buy",         label: "Buy" },
  { key: "brought_in",  label: "Brought-In" },
  { key: "transfer",    label: "Transfer" },
  { key: "expense",     label: "Expense" },
  { key: "deposit",     label: "Deposit" },
  { key: "payment_order", label: "Payment Order" },
];

const RECEIPT_TYPES = new Set(["payment_receipt","bank_transfer_screenshot","cash_delivery_receipt","whatsapp_confirmation"]);
const DELIV_TYPES = new Set(["currency_handover_proof","cash_delivery_receipt","bank_transfer_screenshot"]);

function DealCenterPage() {
  const { status, type, currency, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [qLocal, setQLocal] = useState(q);

  const dealsQ = useQuery({
    queryKey: ["deal_center_all"],
    queryFn: async () => {
      const [sells, buys, brought, transfers, expenses, deposits, pos] = await Promise.all([
        supabase.from("sell_transactions")
          .select("id,doc_no,entry_date,created_at,customer_name,sold_currency,sold_amount,received_currency,received_amount,sell_rate,deal_status,settlement_status,currency_delivered,cancel_reason")
          .is("deleted_at", null).order("entry_date", { ascending: false }).limit(500),
        supabase.from("buy_transactions")
          .select("id,doc_no,entry_date,created_at,bought_currency,bought_amount,paid_currency,paid_amount,buy_rate,settlement_status,cancel_reason,txn_owner")
          .is("deleted_at", null).order("entry_date", { ascending: false }).limit(500),
        supabase.from("brought_in_money")
          .select("id,doc_no,entry_date,created_at,brought_by,source_name,currency,amount,converted_currency,converted_amount,conversion_rate,convert_enabled,cancel_reason")
          .is("deleted_at", null).order("entry_date", { ascending: false }).limit(500),
        supabase.from("transfers")
          .select("id,entry_date,created_at,currency,amount,reason,settlement_status,cancel_reason")
          .is("deleted_at", null).order("entry_date", { ascending: false }).limit(500),
        supabase.from("expenses")
          .select("id,doc_no,entry_date,created_at,currency,amount,category,settlement_status,cancel_reason")
          .is("deleted_at", null).order("entry_date", { ascending: false }).limit(500),
        supabase.from("customer_deposits")
          .select("id,entry_date,created_at,currency,amount,settlement_status,cancel_reason")
          .is("deleted_at", null).order("entry_date", { ascending: false }).limit(500),
        supabase.from("payment_orders")
          .select("id,entry_date,created_at,currency,amount,settlement_status,cancel_reason,customer_id")
          .is("deleted_at", null).order("entry_date", { ascending: false }).limit(500),
      ]);

      // Load payment/doc sub-tables for open sells so we can classify status.
      const sellRows = sells.data ?? [];
      const sellIds = sellRows.map((s: any) => s.id);
      let paysBy = new Map<string, any[]>();
      let docsBy = new Map<string, any[]>();
      if (sellIds.length > 0) {
        const [paysRes, docsRes] = await Promise.all([
          supabase.from("sell_payments").select("sell_id,currency,amount,receipt_url").is("deleted_at", null).in("sell_id", sellIds),
          supabase.from("documents").select("ref_id,doc_type").eq("ref_type", "sell").in("ref_id", sellIds),
        ]);
        (paysRes.data ?? []).forEach((p: any) => {
          const list = paysBy.get(p.sell_id) ?? [];
          list.push(p);
          paysBy.set(p.sell_id, list);
        });
        (docsRes.data ?? []).forEach((d: any) => {
          const list = docsBy.get(d.ref_id) ?? [];
          list.push(d);
          docsBy.set(d.ref_id, list);
        });
      }

      const out: NormDeal[] = [];

      for (const r of sellRows) {
        const pays = paysBy.get(r.id) ?? [];
        const docs = docsBy.get(r.id) ?? [];
        const paid = pays.filter((p: any) => p.currency === r.received_currency).reduce((n: number, p: any) => n + Number(p.amount || 0), 0);
        const paymentReceived = paid + 0.0001 >= Number(r.received_amount || 0) && Number(r.received_amount || 0) > 0;
        const partiallyPaid = paid > 0.0001 && !paymentReceived;
        const receiptUploaded = docs.some((d: any) => RECEIPT_TYPES.has(d.doc_type)) || pays.some((p: any) => !!p.receipt_url);
        const deliveryProof = docs.some((d: any) => DELIV_TYPES.has(d.doc_type));
        const closed = r.deal_status === "closed";
        const cancelled = r.deal_status === "cancelled";

        let bucket: string, label: string, missing: string | null = null;
        if (cancelled) { bucket = "cancelled"; label = "Cancelled"; }
        else if (closed) { bucket = "closed"; label = "Closed"; }
        else if (!paymentReceived) {
          bucket = "waiting_payment";
          label = partiallyPaid ? "Partially Paid" : "Waiting Payment";
          missing = partiallyPaid ? "Remaining payment" : "Customer payment";
        } else if (!receiptUploaded) {
          bucket = "waiting_receipt"; label = "Waiting Receipt"; missing = "Payment receipt upload";
        } else if (!r.currency_delivered) {
          bucket = "waiting_delivery"; label = "Waiting Delivery"; missing = "Currency delivery";
        } else if (!deliveryProof) {
          bucket = "waiting_delivery"; label = "Waiting Delivery Proof"; missing = "Delivery proof upload";
        } else {
          bucket = "ready_to_close"; label = "Ready to Close";
        }

        out.push({
          id: r.id, kind: "sell",
          code: dealCode("sell", r),
          date: r.entry_date, customer: r.customer_name,
          currencyOut: r.sold_currency, amountOut: Number(r.sold_amount ?? 0),
          currencyIn: r.received_currency, amountIn: Number(r.received_amount ?? 0),
          rate: r.sell_rate ? Number(r.sell_rate) : null,
          status: bucket, statusLabel: label, missing, raw: r,
        });
      }

      for (const r of (buys.data ?? [])) {
        const cancelled = r.settlement_status === "cancelled";
        const completed = r.settlement_status === "completed";
        out.push({
          id: r.id, kind: "buy", code: dealCode("buy", r), date: r.entry_date,
          customer: r.txn_owner,
          currencyOut: r.paid_currency, amountOut: Number(r.paid_amount ?? 0),
          currencyIn: r.bought_currency, amountIn: Number(r.bought_amount ?? 0),
          rate: r.buy_rate ? Number(r.buy_rate) : null,
          status: cancelled ? "cancelled" : completed ? "closed" : "open",
          statusLabel: cancelled ? "Cancelled" : completed ? "Closed" : "Open",
          missing: null, raw: r,
        });
      }

      for (const r of (brought.data ?? [])) {
        const conv = r.convert_enabled && r.converted_amount && r.converted_currency;
        out.push({
          id: r.id, kind: "brought_in", code: dealCode("brought_in", r), date: r.entry_date,
          customer: r.source_name || r.brought_by,
          currencyOut: r.currency, amountOut: Number(r.amount ?? 0),
          currencyIn: conv ? r.converted_currency : r.currency,
          amountIn: conv ? Number(r.converted_amount ?? 0) : Number(r.amount ?? 0),
          rate: conv && r.conversion_rate ? Number(r.conversion_rate) : null,
          status: "closed", statusLabel: "Recorded", missing: null, raw: r,
        });
      }

      for (const r of (transfers.data ?? [])) {
        const cancelled = r.settlement_status === "cancelled";
        const completed = r.settlement_status === "completed";
        out.push({
          id: r.id, kind: "transfer", code: dealCode("transfer", r), date: r.entry_date,
          customer: r.reason,
          currencyOut: r.currency, amountOut: Number(r.amount ?? 0),
          currencyIn: r.currency, amountIn: Number(r.amount ?? 0),
          rate: null,
          status: cancelled ? "cancelled" : completed ? "closed" : "open",
          statusLabel: cancelled ? "Cancelled" : completed ? "Completed" : "Open",
          missing: null, raw: r,
        });
      }

      for (const r of (expenses.data ?? [])) {
        const cancelled = r.settlement_status === "cancelled";
        const completed = r.settlement_status === "completed";
        out.push({
          id: r.id, kind: "expense", code: dealCode("expense", r), date: r.entry_date,
          customer: r.category,
          currencyOut: r.currency, amountOut: Number(r.amount ?? 0),
          currencyIn: null, amountIn: null, rate: null,
          status: cancelled ? "cancelled" : completed ? "closed" : "open",
          statusLabel: cancelled ? "Cancelled" : completed ? "Completed" : "Open",
          missing: null, raw: r,
        });
      }

      for (const r of (deposits.data ?? [])) {
        const cancelled = r.settlement_status === "cancelled";
        const completed = r.settlement_status === "completed";
        out.push({
          id: r.id, kind: "deposit", code: dealCode("deposit", r), date: r.entry_date,
          customer: null,
          currencyOut: null, amountOut: null,
          currencyIn: r.currency, amountIn: Number(r.amount ?? 0), rate: null,
          status: cancelled ? "cancelled" : completed ? "closed" : "open",
          statusLabel: cancelled ? "Cancelled" : completed ? "Recorded" : "Open",
          missing: null, raw: r,
        });
      }

      for (const r of (pos.data ?? [])) {
        const cancelled = r.settlement_status === "cancelled";
        const completed = r.settlement_status === "completed";
        out.push({
          id: r.id, kind: "payment_order", code: dealCode("payment_order", r), date: r.entry_date,
          customer: null,
          currencyOut: r.currency, amountOut: Number(r.amount ?? 0),
          currencyIn: null, amountIn: null, rate: null,
          status: cancelled ? "cancelled" : completed ? "closed" : "open",
          statusLabel: cancelled ? "Cancelled" : completed ? "Completed" : "Open",
          missing: null, raw: r,
        });
      }

      out.sort((a, b) => (a.date < b.date ? 1 : -1));
      return out;
    },
  });

  const all = dealsQ.data ?? [];

  // currency options from data
  const currencies = useMemo(() => {
    const s = new Set<string>();
    all.forEach(d => { if (d.currencyOut) s.add(d.currencyOut); if (d.currencyIn) s.add(d.currencyIn); });
    return Array.from(s).sort();
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(d => {
      if (type !== "all" && d.kind !== type) return false;
      if (currency !== "all" && d.currencyOut !== currency && d.currencyIn !== currency) return false;
      if (status !== "all") {
        if (status === "open") {
          if (d.status === "closed" || d.status === "cancelled") return false;
        } else if (d.status !== status) return false;
      }
      if (needle) {
        const hay = [
          d.code, d.customer, d.currencyOut, d.currencyIn,
          d.amountOut, d.amountIn, d.rate, d.statusLabel,
        ].map(v => v == null ? "" : String(v).toLowerCase()).join(" ");
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [all, status, type, currency, q]);

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ search: (prev: any) => ({ ...prev, ...patch }) });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length, open: 0, waiting_payment: 0, waiting_receipt: 0, waiting_delivery: 0, ready_to_close: 0, closed: 0, cancelled: 0 };
    for (const d of all) {
      if (d.status !== "closed" && d.status !== "cancelled") c.open += 1;
      if (c[d.status] != null) c[d.status] += 1;
    }
    return c;
  }, [all]);

  return (
    <>
      <PageHeader
        title="Deal Center"
        description="Every deal in one place — buys, sells, brought-in, transfers, expenses."
        actions={
          <>
            <Button asChild size="sm"><Link to="/quick-sell"><TrendingUp className="h-4 w-4 mr-1.5" /> New Deal</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/brought-in"><ArrowDownToLine className="h-4 w-4 mr-1.5" /> Brought-In</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/buy"><ShoppingCart className="h-4 w-4 mr-1.5" /> Buy</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/expenses"><Receipt className="h-4 w-4 mr-1.5" /> Expense</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/transfers"><ArrowLeftRight className="h-4 w-4 mr-1.5" /> Transfer</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/deposits"><ArrowUpFromLine className="h-4 w-4 mr-1.5" /> Deposit</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/payment-orders"><Send className="h-4 w-4 mr-1.5" /> Payment Order</Link></Button>
          </>
        }
      />

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSearch({ status: t.key })}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              status === t.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted"
            }`}
          >
            {t.label}
            {counts[t.key] != null && <span className="ml-1.5 opacity-70">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 mb-4">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by code, customer, amount, rate, currency…"
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setSearch({ q: qLocal }); }}
            onBlur={() => setSearch({ q: qLocal })}
            className="pl-9"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setSearch({ type: e.target.value })}
          className="h-9 rounded-md border bg-background px-2 text-sm min-w-[9rem]"
        >
          {TYPE_TABS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select
          value={currency}
          onChange={(e) => setSearch({ currency: e.target.value })}
          className="h-9 rounded-md border bg-background px-2 text-sm min-w-[7rem]"
        >
          <option value="all">All currencies</option>
          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Deals list */}
      {dealsQ.isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading deals…</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No deals match this filter.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(d => <DealCard key={`${d.kind}:${d.id}`} d={d} />)}
        </div>
      )}
    </>
  );
}

function statusTone(bucket: string): string {
  switch (bucket) {
    case "closed": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "cancelled": return "bg-muted text-muted-foreground border-border";
    case "ready_to_close": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "waiting_payment": return "bg-amber-100 text-amber-900 border-amber-200";
    case "waiting_receipt": return "bg-sky-100 text-sky-900 border-sky-200";
    case "waiting_delivery": return "bg-orange-100 text-orange-900 border-orange-200";
    default: return "bg-sky-100 text-sky-900 border-sky-200";
  }
}

function DealCard({ d }: { d: NormDeal }) {
  const href = kindHref(d.kind, d.id);
  return (
    <Card className="hover:shadow-md transition">
      <CardContent className="p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={href} className="font-mono text-sm font-semibold text-primary hover:underline">{d.code}</Link>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{kindLabel(d.kind)}</Badge>
              <Badge variant="outline" className={`text-[10px] font-normal ${statusTone(d.status)}`}>{d.statusLabel}</Badge>
            </div>
            <div className="text-sm mt-1 truncate">
              {d.customer || <span className="text-muted-foreground italic">No customer</span>}
              <span className="text-muted-foreground text-xs ml-2">{d.date}</span>
            </div>
            <div className="mt-2 text-sm font-mono">
              {d.currencyOut && (d.amountOut != null) && (
                <span>{fmt(d.amountOut, d.currencyOut)}</span>
              )}
              {d.currencyIn && d.amountIn != null && d.currencyOut !== d.currencyIn && (
                <span className="text-muted-foreground"> → </span>
              )}
              {d.currencyIn && d.amountIn != null && d.currencyOut !== d.currencyIn && (
                <span>{fmt(d.amountIn, d.currencyIn)}</span>
              )}
              {d.rate != null && (
                <span className="text-xs text-muted-foreground ml-2">@ {fmt(d.rate)}</span>
              )}
            </div>
            {d.missing && (
              <div className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                Missing: {d.missing}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="sm" variant="outline" asChild><Link to={href}>View</Link></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}