import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountSelect, useAccounts, useCustomers } from "@/components/account-select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { CURRENCIES, OWNERS, fmt } from "@/lib/exchange";
import { NumberInput } from "@/components/number-input";
import { UseMarketRateButton } from "@/components/use-market-rate-button";
import { SmartTradeCalculator } from "@/components/smart-trade-calculator";
import { convertAmount } from "@/lib/trade-math";
import { toast } from "sonner";
import { ArrowLeft, ChevronsUpDown, TrendingUp, ArrowLeftRight, Warehouse, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/trades/new")({ component: NewTradePage });

function F({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

type SourceMode = "inventory" | "buy_now";
type SettlementPath =
  | "customer_pays_us"
  | "customer_pays_supplier"
  | "ali_pays_supplier"
  | "milad_pays_supplier"
  | "company_pays_supplier"
  | "third_party";

const SETTLEMENT_PATHS: { value: SettlementPath; label: string; hint: string }[] = [
  { value: "customer_pays_us", label: "Customer pays us", hint: "IRR arrives in our account, we pay supplier from our account." },
  { value: "customer_pays_supplier", label: "Customer pays supplier directly", hint: "Money bypasses our account. Profit is a receivable until confirmed." },
  { value: "ali_pays_supplier", label: "Ali pays supplier", hint: "Ali's IRR account settles the supplier." },
  { value: "milad_pays_supplier", label: "Milad pays supplier", hint: "Milad's IRR account settles the supplier." },
  { value: "company_pays_supplier", label: "Company pays supplier", hint: "Our IRR account pays the supplier." },
  { value: "third_party", label: "Third-party settlement", hint: "External party settles supplier. Attach proof." },
];

function NewTradePage() {
  const navigate = useNavigate();
  const customers = useCustomers();
  const accountsQ = useAccounts();
  const today = new Date().toISOString().slice(0, 10);

  const [f, setF] = useState({
    entry_date: today,
    owner: "shared",
    notes: "",
    // Top-level trade type
    trade_type: "inventory" as "inventory" | "matched",
    // STEP 1 — Give
    give_currency: "AED",
    give_amount: "",
    give_to_customer_id: "",
    give_to_name: "",
    give_from_account_id: "",
    delivery_status: "not_delivered" as "not_delivered" | "delivered" | "later",
    // STEP 2 — Receive
    receive_currency: "IRR",
    sell_rate: "",
    receive_from_customer_id: "",
    receive_into_account_id: "",
    payment_status: "not_received" as "not_received" | "received" | "later",
    // STEP 3 — Source
    source_mode: "buy_now" as SourceMode,
    bought_from_customer_id: "",
    bought_from_name: "",
    buy_rate: "",
    settlement_currency: "IRR",
    settlement_paid_from_account_id: "",
    settlement_paid_to_account_id: "",
    settlement_status: "not_paid" as "not_paid" | "paid" | "later",
    settlement_path: "customer_pays_us" as SettlementPath,
    // Split
    milad_pct: 50,
    ali_pct: 50,
  });

  // ---- Matched (broker) trade state ----
  const [m, setM] = useState({
    // Customer A (supplier)
    a_customer_id: "",
    a_currency: "AED",
    a_amount: "",
    a_rate: "",
    a_account_id: "",
    a_status: "not_received" as "not_received" | "received" | "later",
    a_proof: "",
    // Customer B (buyer)
    b_customer_id: "",
    b_currency: "AED",
    b_amount: "",
    b_rate: "",
    b_account_id: "",
    b_status: "not_delivered" as "not_delivered" | "delivered" | "later",
    b_proof: "",
    // Rates are quoted in this "counter" currency (e.g. IRR)
    counter_currency: "IRR",
    // Which currency to book the company profit in
    book_profit_in: "counter" as "counter" | "primary",
  });

  const mAmtA = Number(m.a_amount || 0);
  const mAmtB = Number(m.b_amount || 0);
  const mRateA = Number(m.a_rate || 0);
  const mRateB = Number(m.b_rate || 0);
  // Direction-aware: rate is "counter per 1 traded ccy" when counter is IRR
  // and traded is foreign; convertAmount handles the inverse automatically.
  const mValueA = convertAmount(m.a_currency, m.counter_currency, mAmtA, mRateA);
  const mValueB = convertAmount(m.b_currency, m.counter_currency, mAmtB, mRateB);
  const mProfitCounter = mValueB - mValueA;
  const mProfitInA = mRateA > 0 ? mProfitCounter / mRateA : 0;
  const mProfitInB = mRateB > 0 ? mProfitCounter / mRateB : 0;
  const mMarginPct = mRateA > 0 ? ((mRateB - mRateA) / mRateA) * 100 : 0;

  const giveAmt = Number(f.give_amount || 0);
  const buyRate = Number(f.buy_rate || 0);
  const sellRate = Number(f.sell_rate || 0);
  const receiveAmount = useMemo(
    () => convertAmount(f.give_currency, f.receive_currency, giveAmt, sellRate),
    [f.give_currency, f.receive_currency, giveAmt, sellRate],
  );
  const buyCostSettlement = useMemo(
    () => convertAmount(f.give_currency, f.settlement_currency, giveAmt, buyRate),
    [f.give_currency, f.settlement_currency, giveAmt, buyRate],
  );
  const spread = receiveAmount - buyCostSettlement; // in receive/settlement ccy
  const sameSettleReceive = f.settlement_currency === f.receive_currency;
  // Profit expressed in the GIVE currency (e.g. AED)
  const profitInGiveCcy = sellRate > 0 && sameSettleReceive ? spread / sellRate : 0;
  const marginPct = buyRate > 0 && sellRate > 0 ? ((sellRate - buyRate) / buyRate) * 100 : 0;
  const miladShare = (profitInGiveCcy * Number(f.milad_pct || 0)) / 100;
  const aliShare = (profitInGiveCcy * Number(f.ali_pct || 0)) / 100;

  const isBuyNow = f.source_mode === "buy_now";

  // Auto-derive settlement_paid_from based on settlement path + customers
  const accounts = accountsQ.data ?? [];
  const findCustomerAcct = (customerId: string, currency: string) =>
    accounts.find((a: any) => a.holder_customer_id === customerId && a.currency === currency && (a.account_type === "person_holding" || a.account_type === "customer_wallet"))?.id ?? "";

  // Auto-select ledger accounts based on trade context so the user rarely
  // needs to open the Advanced section.
  const pickAccount = (opts: {
    currency: string;
    holderCustomerId?: string;
    ownerFallback?: string;
    prefer?: string[]; // account_type preference order
  }) => {
    const { currency, holderCustomerId, ownerFallback, prefer } = opts;
    const pool = accounts.filter((a: any) => a.currency === currency);
    if (holderCustomerId) {
      const found = pool.find((a: any) => a.holder_customer_id === holderCustomerId);
      if (found) return found.id as string;
    }
    if (prefer?.length) {
      for (const t of prefer) {
        const found = pool.find((a: any) => a.account_type === t && (!ownerFallback || !a.owner || a.owner === ownerFallback));
        if (found) return found.id as string;
      }
    }
    if (ownerFallback) {
      const found = pool.find((a: any) => a.owner === ownerFallback);
      if (found) return found.id as string;
    }
    return pool[0]?.id ?? "";
  };

  useEffect(() => {
    if (f.trade_type !== "inventory" || accounts.length === 0) return;
    const patch: Partial<typeof f> = {};
    if (!f.give_from_account_id) {
      const id = pickAccount({
        currency: f.give_currency,
        ownerFallback: f.owner === "ali" ? "ali" : f.owner === "milad" ? "milad" : undefined,
        prefer: ["cash", "person_holding", "bank"],
      });
      if (id) patch.give_from_account_id = id;
    }
    if (!f.receive_into_account_id) {
      const id = pickAccount({
        currency: f.receive_currency,
        holderCustomerId: f.receive_from_customer_id || undefined,
        ownerFallback: f.owner === "ali" ? "ali" : f.owner === "milad" ? "milad" : undefined,
        prefer: ["bank", "cash", "customer_wallet", "person_holding"],
      });
      if (id) patch.receive_into_account_id = id;
    }
    if (isBuyNow) {
      if (!f.settlement_paid_from_account_id) {
        const path = f.settlement_path;
        const owner =
          path === "ali_pays_supplier" ? "ali" :
          path === "milad_pays_supplier" ? "milad" :
          undefined;
        const holder =
          path === "customer_pays_supplier" ? (f.give_to_customer_id || undefined) : undefined;
        const id = pickAccount({
          currency: f.settlement_currency,
          holderCustomerId: holder,
          ownerFallback: owner,
          prefer: owner ? ["person_holding", "cash"] : ["bank", "cash"],
        });
        if (id) patch.settlement_paid_from_account_id = id;
      }
      if (!f.settlement_paid_to_account_id && f.bought_from_customer_id) {
        const id = findCustomerAcct(f.bought_from_customer_id, f.settlement_currency);
        if (id) patch.settlement_paid_to_account_id = id;
      }
    }
    if (Object.keys(patch).length) setF((cur) => ({ ...cur, ...patch }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    f.trade_type, f.give_currency, f.receive_currency, f.settlement_currency,
    f.owner, f.settlement_path, f.give_to_customer_id, f.receive_from_customer_id,
    f.bought_from_customer_id, isBuyNow, accounts.length,
  ]);

  // Validation checklist — every item shown to the user with a clear reason.
  type Check = { key: string; label: string; ok: boolean; hint?: string };
  const checks: Check[] = f.trade_type !== "inventory" ? [] : [
    { key: "give_currency", label: "Currency given selected", ok: !!f.give_currency },
    { key: "give_amount", label: "Give amount entered", ok: giveAmt > 0, hint: "Enter the amount you are handing over." },
    { key: "receive_currency", label: "Currency received selected", ok: !!f.receive_currency },
    { key: "sell_rate", label: "Sell rate entered", ok: sellRate > 0, hint: "Enter the rate at which you sell." },
    ...(isBuyNow ? [{ key: "buy_rate", label: "Buy rate entered", ok: buyRate > 0, hint: "Enter the rate at which you bought." } as Check] : []),
    { key: "give_from_account_id", label: "Give-from account set", ok: !!f.give_from_account_id, hint: `We couldn't find a ${f.give_currency} account — open Advanced Accounting and select one.` },
    { key: "receive_into_account_id", label: "Receive-into account set", ok: !!f.receive_into_account_id, hint: `No ${f.receive_currency} account found — open Advanced Accounting.` },
    ...(isBuyNow ? [
      { key: "settlement_paid_from_account_id", label: "Settlement paid-from account set", ok: !!f.settlement_paid_from_account_id, hint: "Choose whose account pays the supplier in Advanced Accounting." } as Check,
      { key: "settlement_paid_to_account_id", label: "Settlement paid-to account set", ok: !!f.settlement_paid_to_account_id, hint: "Select the supplier's receiving account (or free-text supplier name + create their account)." } as Check,
    ] : []),
    { key: "profit", label: "Profit calculated", ok: !isBuyNow || (sellRate > 0 && buyRate > 0), hint: "Profit needs both buy and sell rates." },
    { key: "split", label: "Milad + Ali % = 100", ok: Math.abs(Number(f.milad_pct) + Number(f.ali_pct) - 100) < 0.01 },
  ];
  const missing = checks.filter((c) => !c.ok);
  const canSubmit = missing.length === 0;

  const previewCode = useMemo(() => {
    const y = new Date(f.entry_date).getFullYear();
    return `TRD-${y}-????`;
  }, [f.entry_date]);

  const submit = useMutation({
    mutationFn: async (opts: { closeNow: boolean }) => {
      if (!canSubmit) throw new Error(`Cannot close trade — missing: ${missing.map((m) => m.label).join(", ")}`);

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;

      // 1. Create trade cycle (always)
      const cyclePayload: any = {
        entry_date: f.entry_date,
        title: `Trade ${f.give_currency} → ${f.receive_currency}`,
        customer_id: f.bought_from_customer_id || null,
        counterparty_id: f.give_to_customer_id || null,
        base_currency: f.give_currency,
        quote_currency: f.receive_currency,
        initial_currency: f.settlement_currency,
        intermediate_currency: f.give_currency,
        final_currency: f.receive_currency,
        capital_amount: buyCostSettlement,
        capital_currency: f.settlement_currency,
        initial_amount: buyCostSettlement,
        expected_profit: profitInGiveCcy,
        expected_profit_currency: f.give_currency,
        milad_share_pct: Number(f.milad_pct),
        ali_share_pct: Number(f.ali_pct),
        notes: [
          `Settlement path: ${SETTLEMENT_PATHS.find((p) => p.value === f.settlement_path)?.label}`,
          f.notes,
        ].filter(Boolean).join(" · ") || null,
        status: "in_progress",
      };
      const { data: cycle, error: cErr } = await supabase.from("trade_cycles" as any)
        .insert(cyclePayload).select("id, code").single();
      if (cErr) throw cErr;
      const cycleId = (cycle as any).id as string;
      const cycleCode = (cycle as any).code as string;

      // 2. Optional buy leg — only when source = buy_now
      if (isBuyNow) {
        const buyPayload: any = {
          entry_date: f.entry_date,
          bought_currency: f.give_currency,
          bought_amount: giveAmt,
          buy_rate: buyRate,
          paid_currency: f.settlement_currency,
          paid_amount: buyCostSettlement,
          paid_from_account_id: f.settlement_paid_from_account_id,
          received_into_account_id: f.give_from_account_id,
          customer_id: f.bought_from_customer_id || null,
          counterparty: f.bought_from_name || null,
          txn_owner: f.owner,
          notes: `[${cycleCode}] Buy leg · path=${f.settlement_path}${f.notes ? " · " + f.notes : ""}`,
          created_by: uid,
          trade_cycle_id: cycleId,
        };
        const { error: bErr } = await supabase.from("buy_transactions").insert(buyPayload);
        if (bErr) throw new Error(`Buy leg failed: ${bErr.message}`);
      }

      // 3. Sell leg (always) — consumes inventory FIFO
      const sellPayload: any = {
        entry_date: f.entry_date,
        sold_currency: f.give_currency,
        sold_amount: giveAmt,
        sell_rate: sellRate,
        received_currency: f.receive_currency,
        received_amount: receiveAmount,
        sold_from_account_id: f.give_from_account_id,
        received_into_account_id: f.receive_into_account_id,
        customer_id: f.give_to_customer_id || null,
        customer_name: f.give_to_name || null,
        milad_share_pct: Number(f.milad_pct),
        ali_share_pct: Number(f.ali_pct),
        notes: `[${cycleCode}] Sell leg · path=${f.settlement_path}${f.notes ? " · " + f.notes : ""}`,
        created_by: uid,
        creates_cycle: false,
        trade_cycle_id: cycleId,
        deal_status: "open",
        currency_delivered: f.delivery_status === "delivered",
      };
      const { data: sellIns, error: sErr } = await supabase.from("sell_transactions").insert(sellPayload).select("id").single();
      if (sErr) throw new Error(`Sell leg failed: ${sErr.message}`);

      if (opts.closeNow && sellIns?.id) {
        const { error: cerr } = await (supabase as any).rpc("close_sell_deal", {
          _id: sellIns.id, _override: true, _difference_reason: "Closed via New Trade workflow",
        });
        if (cerr) throw new Error(`Save succeeded but close failed: ${cerr.message}`);
      }

      return { cycleId, cycleCode };
    },
    onSuccess: (res, vars) => {
      toast.success(vars.closeNow ? `Trade ${res.cycleCode} closed` : `Trade ${res.cycleCode} saved as open`);
      navigate({ to: "/trades/$id", params: { id: res.cycleId } });
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  // ---- Matched trade submit ----
  const canSubmitMatched =
    !!m.a_customer_id && !!m.b_customer_id &&
    mAmtA > 0 && mAmtB > 0 && mRateA > 0 && mRateB > 0 &&
    !!m.a_account_id && !!m.b_account_id;

  const submitMatched = useMutation({
    mutationFn: async () => {
      if (!canSubmitMatched) throw new Error("Fill both sides: customers, amounts, rates and settlement accounts.");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;

      const profitCcy = m.book_profit_in === "primary" ? m.a_currency : m.counter_currency;
      const profitAmount = m.book_profit_in === "primary" ? mProfitInA : mProfitCounter;

      const cyclePayload: any = {
        entry_date: f.entry_date,
        title: `Matched ${m.a_currency}↔${m.counter_currency}`,
        customer_id: m.a_customer_id,
        counterparty_id: m.b_customer_id,
        base_currency: m.a_currency,
        quote_currency: m.counter_currency,
        initial_currency: m.counter_currency,
        intermediate_currency: m.a_currency,
        final_currency: m.counter_currency,
        capital_amount: mValueA,
        capital_currency: m.counter_currency,
        initial_amount: mValueA,
        expected_profit: profitAmount,
        expected_profit_currency: profitCcy,
        milad_share_pct: Number(f.milad_pct),
        ali_share_pct: Number(f.ali_pct),
        notes: [
          "Matched trade (direct settlement)",
          m.a_proof && `A proof: ${m.a_proof}`,
          m.b_proof && `B proof: ${m.b_proof}`,
          f.notes,
        ].filter(Boolean).join(" · ") || null,
        status: "in_progress",
      };
      const { data: cycle, error: cErr } = await supabase.from("trade_cycles" as any)
        .insert(cyclePayload).select("id, code").single();
      if (cErr) throw cErr;
      const cycleId = (cycle as any).id as string;
      const cycleCode = (cycle as any).code as string;

      // Buy leg: from Customer A
      const buyPayload: any = {
        entry_date: f.entry_date,
        bought_currency: m.a_currency,
        bought_amount: mAmtA,
        buy_rate: mRateA,
        paid_currency: m.counter_currency,
        paid_amount: mValueA,
        paid_from_account_id: m.b_account_id, // direct settlement: B funds A
        received_into_account_id: m.a_account_id,
        customer_id: m.a_customer_id,
        txn_owner: f.owner,
        notes: `[${cycleCode}] Matched · from Customer A · direct settlement${m.a_proof ? " · proof: " + m.a_proof : ""}`,
        created_by: uid,
        trade_cycle_id: cycleId,
      };
      const { error: bErr } = await supabase.from("buy_transactions").insert(buyPayload);
      if (bErr) throw new Error(`Buy leg (A) failed: ${bErr.message}`);

      // Sell leg: to Customer B
      const sellPayload: any = {
        entry_date: f.entry_date,
        sold_currency: m.a_currency,
        sold_amount: mAmtA,
        sell_rate: mRateB,
        received_currency: m.counter_currency,
        received_amount: mValueB,
        sold_from_account_id: m.a_account_id,
        received_into_account_id: m.b_account_id,
        customer_id: m.b_customer_id,
        milad_share_pct: Number(f.milad_pct),
        ali_share_pct: Number(f.ali_pct),
        notes: `[${cycleCode}] Matched · to Customer B · direct settlement${m.b_proof ? " · proof: " + m.b_proof : ""}`,
        created_by: uid,
        creates_cycle: false,
        trade_cycle_id: cycleId,
        deal_status: "open",
        currency_delivered: m.b_status === "delivered",
      };
      const { error: sErr } = await supabase.from("sell_transactions").insert(sellPayload);
      if (sErr) throw new Error(`Sell leg (B) failed: ${sErr.message}`);

      return { cycleId, cycleCode };
    },
    onSuccess: (res) => {
      toast.success(`Matched trade ${res.cycleCode} saved`);
      navigate({ to: "/trades/$id", params: { id: res.cycleId } });
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="New Exchange Trade"
        description="One form. Describe the deal in plain terms — the system handles inventory, ledger, and receipts in the background."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/trades"><ArrowLeft className="h-4 w-4 mr-1" />Back to trades</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Trade type */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Trade type</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              <TypePill
                active={f.trade_type === "inventory"}
                onClick={() => setF({ ...f, trade_type: "inventory" })}
                icon={<Warehouse className="h-4 w-4" />}
                title="Inventory Trade"
                subtitle="Buy now (or from stock) → hold → sell later. Uses FIFO inventory."
              />
              <TypePill
                active={f.trade_type === "matched"}
                onClick={() => setF({ ...f, trade_type: "matched" })}
                icon={<ArrowLeftRight className="h-4 w-4" />}
                title="Matched Trade (Direct Settlement)"
                subtitle="Customer A and Customer B settle each other directly. We earn the spread."
              />
            </CardContent>
          </Card>

          {/* Basic info */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Trade info</CardTitle>
                <Badge variant="outline" className="font-mono">{previewCode}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <F label="Date"><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></F>
              <F label="Owner">
                <Select value={f.owner} onValueChange={(v) => setF({ ...f, owner: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OWNERS.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              {f.trade_type === "inventory" && (<F label="Settlement path">
                <Select value={f.settlement_path} onValueChange={(v: SettlementPath) => setF({ ...f, settlement_path: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SETTLEMENT_PATHS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </F>)}
              {f.trade_type === "inventory" && (<div className="sm:col-span-3 text-[11px] text-muted-foreground -mt-1">
                {SETTLEMENT_PATHS.find((p) => p.value === f.settlement_path)?.hint}
              </div>)}
              <div className="sm:col-span-3">
                <F label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Optional context (proof references, verbal terms, etc.)" /></F>
              </div>
            </CardContent>
          </Card>

          {f.trade_type === "inventory" && (
          <>
          {/* Smart calculator — direction-aware, market compare, AI score */}
          <SmartTradeCalculator
            giveCurrency={f.give_currency}
            giveAmount={giveAmt}
            receiveCurrency={f.receive_currency}
            userRate={sellRate}
            side="sell"
            buyRate={isBuyNow && buyRate > 0 ? buyRate : null}
            sellRate={sellRate > 0 ? sellRate : null}
            customerKnown={!!f.give_to_customer_id}
          />

          {/* STEP 1 — Give */}
          <StepCard step={1} title="Currency we give" subtitle="What are we handing over?">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Give currency">
                <Select value={f.give_currency} onValueChange={(v) => setF({ ...f, give_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label={`Give amount (${f.give_currency})`}>
                <NumberInput currency={f.give_currency} value={f.give_amount} onChange={(e) => setF({ ...f, give_amount: e.target.value })} placeholder="e.g. 70,000" />
              </F>
              <F label="Give to (customer)">
                <Select value={f.give_to_customer_id} onValueChange={(v) => setF({ ...f, give_to_customer_id: v, receive_from_customer_id: f.receive_from_customer_id || v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer B" /></SelectTrigger>
                  <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Or free-text name">
                <Input value={f.give_to_name} onChange={(e) => setF({ ...f, give_to_name: e.target.value })} placeholder="Customer B" />
              </F>
              <F label="Delivery status">
                <Select value={f.delivery_status} onValueChange={(v: any) => setF({ ...f, delivery_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_delivered">Not delivered</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="later">Will deliver later</SelectItem>
                  </SelectContent>
                </Select>
              </F>
            </div>
          </StepCard>

          {/* STEP 2 — Receive */}
          <StepCard step={2} title="Money we receive" subtitle="What comes back in exchange?">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Receive currency">
                <Select value={f.receive_currency} onValueChange={(v) => setF({ ...f, receive_currency: v, settlement_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label={`Sell rate (${f.receive_currency} per 1 ${f.give_currency})`}>
                <div className="flex gap-2 items-center">
                  <NumberInput rate value={f.sell_rate} onChange={(e) => setF({ ...f, sell_rate: e.target.value })} />
                  <UseMarketRateButton currency={f.give_currency} which="sell" onApply={(r) => setF({ ...f, sell_rate: String(r) })} />
                </div>
              </F>
              <F label={`Receive amount (${f.receive_currency}) — auto`}>
                <Input value={receiveAmount ? fmt(receiveAmount) : ""} disabled />
              </F>
              <F label="Receive from (customer)">
                <Select value={f.receive_from_customer_id} onValueChange={(v) => setF({ ...f, receive_from_customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Usually customer B" /></SelectTrigger>
                  <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Payment status">
                <Select value={f.payment_status} onValueChange={(v: any) => setF({ ...f, payment_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_received">Not received</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="later">Will receive later</SelectItem>
                  </SelectContent>
                </Select>
              </F>
            </div>
          </StepCard>

          {/* STEP 3 — Source */}
          <StepCard step={3} title="Currency source" subtitle="Where does the give-currency come from?">
            <div className="flex gap-2 mb-3">
              <SourcePill active={f.source_mode === "inventory"} onClick={() => setF({ ...f, source_mode: "inventory" })}>From existing inventory</SourcePill>
              <SourcePill active={f.source_mode === "buy_now"} onClick={() => setF({ ...f, source_mode: "buy_now" })}>Bought from supplier now</SourcePill>
            </div>

            {isBuyNow ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="Bought from (supplier / customer A)">
                  <Select value={f.bought_from_customer_id} onValueChange={(v) => setF({ ...f, bought_from_customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Or free-text name">
                  <Input value={f.bought_from_name} onChange={(e) => setF({ ...f, bought_from_name: e.target.value })} placeholder="Customer A" />
                </F>
                <F label={`Buy rate (${f.settlement_currency} per 1 ${f.give_currency})`}>
                  <div className="flex gap-2 items-center">
                    <NumberInput rate value={f.buy_rate} onChange={(e) => setF({ ...f, buy_rate: e.target.value })} />
                    <UseMarketRateButton currency={f.give_currency} which="buy" onApply={(r) => setF({ ...f, buy_rate: String(r) })} />
                  </div>
                </F>
                <F label={`Settlement amount (${f.settlement_currency}) — auto`}>
                  <Input value={buyCostSettlement ? fmt(buyCostSettlement) : ""} disabled />
                </F>
                <F label="Settlement status">
                  <Select value={f.settlement_status} onValueChange={(v: any) => setF({ ...f, settlement_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_paid">Not paid</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="later">Will pay later</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Sell will consume existing {f.give_currency} inventory (FIFO). Pick the source account in Advanced Accounts.
              </div>
            )}
          </StepCard>

          {/* Advanced accounts */}
          <Collapsible defaultOpen={false}>
            <Card>
              <CardHeader className="pb-3">
                <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                  <div>
                    <CardTitle className="text-sm">Advanced Accounting — ledger routing</CardTitle>
                    <div className="text-[11px] text-muted-foreground">Auto-selected from the trade. Only open this if the accounts below are wrong.</div>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 opacity-60" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <F label={`Give from account (${f.give_currency})`} hint="Inventory source or staging account where the give-currency sits.">
                    <AccountSelect value={f.give_from_account_id} onChange={(v) => setF({ ...f, give_from_account_id: v })} currency={f.give_currency} />
                  </F>
                  <F label={`Receive into account (${f.receive_currency})`} hint="Where receive money lands (our account, Ali/Milad, customer, or pending).">
                    <AccountSelect value={f.receive_into_account_id} onChange={(v) => setF({ ...f, receive_into_account_id: v })} currency={f.receive_currency} />
                  </F>
                  {isBuyNow && (
                    <>
                      <F label={`Settlement paid from (${f.settlement_currency})`} hint="Whose account settles the supplier?">
                        <AccountSelect value={f.settlement_paid_from_account_id} onChange={(v) => setF({ ...f, settlement_paid_from_account_id: v })} currency={f.settlement_currency} />
                      </F>
                      <F label={`Settlement paid to (${f.settlement_currency})`} hint="Supplier's account (Customer A) or their bank.">
                        <AccountSelect value={f.settlement_paid_to_account_id} onChange={(v) => setF({ ...f, settlement_paid_to_account_id: v })} currency={f.settlement_currency} holderCustomerId={f.bought_from_customer_id || undefined} />
                      </F>
                    </>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
          </>
          )}

          {f.trade_type === "matched" && (
          <>
          {/* Smart calculator for the sell leg (Customer B side) */}
          <SmartTradeCalculator
            giveCurrency={m.a_currency}
            giveAmount={mAmtB}
            receiveCurrency={m.counter_currency}
            userRate={mRateB}
            side="sell"
            buyRate={mRateA > 0 ? mRateA : null}
            sellRate={mRateB > 0 ? mRateB : null}
            customerKnown={!!m.b_customer_id}
          />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Rate quoting</CardTitle>
                <div className="text-[11px] text-muted-foreground">Both rates are expressed in this counter currency (e.g. IRR per 1 AED).</div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="Counter currency (rates quoted in)">
                  <Select value={m.counter_currency} onValueChange={(v) => setM({ ...m, counter_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
              </CardContent>
            </Card>

            <StepCard step={1} title="Customer A · Supplier" subtitle="Who is supplying the currency?">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="Customer">
                  <Select value={m.a_customer_id} onValueChange={(v) => setM({ ...m, a_customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Currency">
                  <Select value={m.a_currency} onValueChange={(v) => setM({ ...m, a_currency: v, b_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label={`Amount (${m.a_currency})`}>
                  <NumberInput currency={m.a_currency} value={m.a_amount} onChange={(e) => setM({ ...m, a_amount: e.target.value, b_amount: m.b_amount || e.target.value })} placeholder="e.g. 70,000" />
                </F>
                <F label={`Rate A (${m.counter_currency} per 1 ${m.a_currency})`}>
                  <div className="flex gap-2 items-center">
                    <NumberInput rate value={m.a_rate} onChange={(e) => setM({ ...m, a_rate: e.target.value })} />
                    <UseMarketRateButton currency={m.a_currency} which="buy" onApply={(r) => setM({ ...m, a_rate: String(r) })} />
                  </div>
                </F>
                <F label={`Settlement account (A's ${m.counter_currency} account)`} hint="Where A receives the counter currency.">
                  <AccountSelect value={m.a_account_id} onChange={(v) => setM({ ...m, a_account_id: v })} currency={m.counter_currency} holderCustomerId={m.a_customer_id || undefined} />
                </F>
                <F label="Payment status">
                  <Select value={m.a_status} onValueChange={(v: any) => setM({ ...m, a_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_received">A has not been paid</SelectItem>
                      <SelectItem value="received">A confirmed payment received</SelectItem>
                      <SelectItem value="later">Will settle later</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
                <div className="sm:col-span-2">
                  <F label="Proof / reference (optional)">
                    <Input value={m.a_proof} onChange={(e) => setM({ ...m, a_proof: e.target.value })} placeholder="Transfer ref, screenshot ID, etc." />
                  </F>
                </div>
                <div className="sm:col-span-2 text-[11px] text-muted-foreground">
                  A supplies <span className="font-mono">{mAmtA ? fmt(mAmtA, m.a_currency) : "—"}</span> · receives <span className="font-mono">{mValueA ? fmt(mValueA, m.counter_currency) : "—"}</span>
                </div>
              </div>
            </StepCard>

            <StepCard step={2} title="Customer B · Buyer" subtitle="Who is receiving the currency?">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="Customer">
                  <Select value={m.b_customer_id} onValueChange={(v) => setM({ ...m, b_customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select buyer" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Currency">
                  <Select value={m.b_currency} onValueChange={(v) => setM({ ...m, b_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label={`Amount (${m.b_currency})`}>
                  <NumberInput currency={m.b_currency} value={m.b_amount} onChange={(e) => setM({ ...m, b_amount: e.target.value })} placeholder="e.g. 70,000" />
                </F>
                <F label={`Rate B (${m.counter_currency} per 1 ${m.b_currency})`}>
                  <div className="flex gap-2 items-center">
                    <NumberInput rate value={m.b_rate} onChange={(e) => setM({ ...m, b_rate: e.target.value })} />
                    <UseMarketRateButton currency={m.b_currency} which="sell" onApply={(r) => setM({ ...m, b_rate: String(r) })} />
                  </div>
                </F>
                <F label={`Settlement account (B's ${m.counter_currency} account)`} hint="Where B pays the counter currency from.">
                  <AccountSelect value={m.b_account_id} onChange={(v) => setM({ ...m, b_account_id: v })} currency={m.counter_currency} holderCustomerId={m.b_customer_id || undefined} />
                </F>
                <F label="Delivery status">
                  <Select value={m.b_status} onValueChange={(v: any) => setM({ ...m, b_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_delivered">B has not received currency</SelectItem>
                      <SelectItem value="delivered">B confirmed currency received</SelectItem>
                      <SelectItem value="later">Will deliver later</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
                <div className="sm:col-span-2">
                  <F label="Proof / reference (optional)">
                    <Input value={m.b_proof} onChange={(e) => setM({ ...m, b_proof: e.target.value })} placeholder="Transfer ref, screenshot ID, etc." />
                  </F>
                </div>
                <div className="sm:col-span-2 text-[11px] text-muted-foreground">
                  B pays <span className="font-mono">{mValueB ? fmt(mValueB, m.counter_currency) : "—"}</span> · receives <span className="font-mono">{mAmtB ? fmt(mAmtB, m.b_currency) : "—"}</span>
                </div>
              </div>
            </StepCard>
          </>
          )}
        </div>

        {/* Sticky profit preview */}
        <div className="space-y-4">
          {f.trade_type === "inventory" && (
          <Card className="lg:sticky lg:top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Profit preview</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Buy rate" value={buyRate ? `${fmt(buyRate)} ${f.settlement_currency}` : "—"} />
              <Row label="Sell rate" value={sellRate ? `${fmt(sellRate)} ${f.receive_currency}` : "—"} />
              <Row label="Buy cost" value={isBuyNow && buyCostSettlement ? `${fmt(buyCostSettlement)} ${f.settlement_currency}` : "—"} />
              <Row label="Sell value" value={receiveAmount ? `${fmt(receiveAmount)} ${f.receive_currency}` : "—"} />
              <Row label={`Spread (${f.receive_currency})`} value={isBuyNow ? `${fmt(spread)} ${f.receive_currency}` : "—"} />
              <div className="border-t pt-2">
                <Row
                  label={`Profit (${f.give_currency})`}
                  value={isBuyNow && sameSettleReceive && sellRate > 0 ? `${fmt(profitInGiveCcy)} ${f.give_currency}` : "—"}
                  strong
                  tone={profitInGiveCcy >= 0 ? "pos" : "neg"}
                />
                {isBuyNow && sameSettleReceive && (
                  <Row label="Margin" value={`${marginPct.toFixed(2)}%`} tone={marginPct >= 0 ? "pos" : "neg"} />
                )}
                {!isBuyNow && (
                  <div className="text-[11px] text-muted-foreground">Profit vs. inventory cost basis is calculated once the deal is saved.</div>
                )}
              </div>
              <div className="border-t pt-2 text-[11px] text-muted-foreground">
                Settlement: <span className="font-medium">{SETTLEMENT_PATHS.find((p) => p.value === f.settlement_path)?.label}</span>
              </div>
              <div className="border-t pt-2 grid grid-cols-2 gap-2">
                <F label={`Milad %`}>
                  <Input type="number" value={f.milad_pct}
                    onChange={(e) => setF({ ...f, milad_pct: Number(e.target.value), ali_pct: 100 - Number(e.target.value) })} />
                </F>
                <F label="Ali %"><Input type="number" value={f.ali_pct} disabled /></F>
              </div>
              {isBuyNow && sameSettleReceive && (
                <>
                  <Row label="Milad share" value={`${fmt(miladShare)} ${f.give_currency}`} />
                  <Row label="Ali share" value={`${fmt(aliShare)} ${f.give_currency}`} />
                </>
              )}

              <ValidationPanel checks={checks} />
              <div className="flex flex-col gap-2 pt-3 border-t">
                <Button
                  variant="secondary"
                  disabled={submit.isPending}
                  onClick={() => {
                    if (!canSubmit) {
                      toast.error(`Cannot save — missing: ${missing.map((m) => m.label).join(", ")}`);
                      return;
                    }
                    submit.mutate({ closeNow: false });
                  }}
                >
                  Save Open Trade
                </Button>
                <Button
                  disabled={submit.isPending}
                  onClick={() => {
                    if (!canSubmit) {
                      toast.error(`Cannot close trade — missing: ${missing.map((m) => m.label).join(", ")}`);
                      return;
                    }
                    submit.mutate({ closeNow: true });
                  }}
                >
                  Close Trade Now
                </Button>
                <div className="text-[11px] text-muted-foreground">
                  Open = track missing payment/receipts in Deal Center. Close Now = record as settled (uses admin override for receipts).
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {f.trade_type === "matched" && (
          <Card className="lg:sticky lg:top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Broker profit</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Rate A" value={mRateA ? `${fmt(mRateA)} ${m.counter_currency}` : "—"} />
              <Row label="Rate B" value={mRateB ? `${fmt(mRateB)} ${m.counter_currency}` : "—"} />
              <Row label={`A receives`} value={mValueA ? `${fmt(mValueA, m.counter_currency)}` : "—"} />
              <Row label={`B pays`} value={mValueB ? `${fmt(mValueB, m.counter_currency)}` : "—"} />
              <div className="border-t pt-2">
                <Row
                  label={`Spread (${m.counter_currency})`}
                  value={mProfitCounter ? `${fmt(mProfitCounter, m.counter_currency)}` : "—"}
                  strong
                  tone={mProfitCounter >= 0 ? "pos" : "neg"}
                />
                <Row
                  label={`≈ in ${m.a_currency}`}
                  value={mProfitInA ? `${fmt(mProfitInA, m.a_currency)}` : "—"}
                  tone={mProfitInA >= 0 ? "pos" : "neg"}
                />
                <Row label="Margin" value={`${mMarginPct.toFixed(2)}%`} tone={mMarginPct >= 0 ? "pos" : "neg"} />
              </div>
              <div className="border-t pt-2">
                <F label="Book profit in">
                  <Select value={m.book_profit_in} onValueChange={(v: any) => setM({ ...m, book_profit_in: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="counter">{m.counter_currency} (counter)</SelectItem>
                      <SelectItem value="primary">{m.a_currency} (traded currency)</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </div>
              <div className="border-t pt-2 grid grid-cols-2 gap-2">
                <F label={`Milad %`}>
                  <Input type="number" value={f.milad_pct}
                    onChange={(e) => setF({ ...f, milad_pct: Number(e.target.value), ali_pct: 100 - Number(e.target.value) })} />
                </F>
                <F label="Ali %"><Input type="number" value={f.ali_pct} disabled /></F>
              </div>
              <div className="flex flex-col gap-2 pt-3 border-t">
                <Button
                  disabled={!canSubmitMatched || submitMatched.isPending}
                  onClick={() => submitMatched.mutate()}
                >
                  Save Matched Trade
                </Button>
                <div className="text-[11px] text-muted-foreground">
                  Creates a trade cycle with a buy leg from A and a sell leg to B. Neither side moves through our balances — profit is booked as your spread.
                </div>
              </div>
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TypePill({ active, onClick, icon, title, subtitle }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition ${active ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "hover:bg-muted"}`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={`h-6 w-6 rounded-full flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{icon}</span>
        {title}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{subtitle}</div>
    </button>
  );
}

function StepCard({ step, title, subtitle, children }: { step: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">{step}</div>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            {subtitle ? <div className="text-[11px] text-muted-foreground">{subtitle}</div> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SourcePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs border transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-mono ${strong ? "font-semibold" : ""} ${tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}