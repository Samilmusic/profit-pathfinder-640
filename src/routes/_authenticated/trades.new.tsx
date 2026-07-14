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
import { convertAmount } from "@/lib/trade-math";
import { useLatestMarketRates, pickDisplayRate } from "@/lib/market-rates";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronsUpDown, TrendingUp, ArrowLeftRight,
  PackagePlus, PackageMinus, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/trades/new")({ component: NewTradePage });

type Mode = "buy" | "sell" | "matched";

function F({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function NewTradePage() {
  const navigate = useNavigate();
  const customers = useCustomers();
  const accountsQ = useAccounts();
  const today = new Date().toISOString().slice(0, 10);

  const [mode, setMode] = useState<Mode>("buy");
  const [entryDate, setEntryDate] = useState(today);
  const [owner, setOwner] = useState("shared");
  const [notes, setNotes] = useState("");
  const [miladPct, setMiladPct] = useState(50);
  const aliPct = 100 - miladPct;

  // ---------- BUY mode state ----------
  const [b, setB] = useState({
    bought_currency: "AED",
    bought_amount: "",
    buy_rate: "",
    paid_currency: "IRR",
    paid_from_account_id: "",
    received_into_account_id: "",
    supplier_customer_id: "",
    supplier_name: "",
    settlement_status: "not_paid" as "not_paid" | "paid" | "later",
  });

  // ---------- SELL mode state ----------
  const [s, setS] = useState({
    sold_currency: "AED",
    sold_amount: "",
    sell_rate: "",
    received_currency: "IRR",
    sold_from_account_id: "",
    received_into_account_id: "",
    customer_id: "",
    customer_name: "",
    delivery_status: "not_delivered" as "not_delivered" | "delivered" | "later",
    payment_status: "not_received" as "not_received" | "received" | "later",
  });

  // ---------- MATCHED mode state ----------
  const [m, setM] = useState({
    a_customer_id: "",
    b_customer_id: "",
    traded_currency: "AED",
    amount: "",
    a_rate: "",
    b_rate: "",
    counter_currency: "IRR",
    a_proof: "",
    b_proof: "",
    profit_destination_account_id: "",
  });

  const accounts = accountsQ.data ?? [];

  const pickAccount = (opts: { currency: string; holderCustomerId?: string; ownerFallback?: string; prefer?: string[] }) => {
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

  // Auto-select accounts for buy mode
  useEffect(() => {
    if (mode !== "buy" || accounts.length === 0) return;
    const patch: Partial<typeof b> = {};
    if (!b.paid_from_account_id) {
      const id = pickAccount({
        currency: b.paid_currency,
        ownerFallback: owner === "ali" || owner === "milad" ? owner : undefined,
        prefer: ["bank", "cash", "person_holding"],
      });
      if (id) patch.paid_from_account_id = id;
    }
    if (!b.received_into_account_id) {
      const id = pickAccount({
        currency: b.bought_currency,
        ownerFallback: owner === "ali" || owner === "milad" ? owner : undefined,
        prefer: ["cash", "bank", "person_holding"],
      });
      if (id) patch.received_into_account_id = id;
    }
    if (Object.keys(patch).length) setB((c) => ({ ...c, ...patch }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, b.bought_currency, b.paid_currency, owner, accounts.length]);

  // Auto-select accounts for sell mode
  useEffect(() => {
    if (mode !== "sell" || accounts.length === 0) return;
    const patch: Partial<typeof s> = {};
    if (!s.sold_from_account_id) {
      const id = pickAccount({
        currency: s.sold_currency,
        ownerFallback: owner === "ali" || owner === "milad" ? owner : undefined,
        prefer: ["cash", "bank", "person_holding"],
      });
      if (id) patch.sold_from_account_id = id;
    }
    if (!s.received_into_account_id) {
      const id = pickAccount({
        currency: s.received_currency,
        holderCustomerId: s.customer_id || undefined,
        ownerFallback: owner === "ali" || owner === "milad" ? owner : undefined,
        prefer: ["bank", "cash", "customer_wallet", "person_holding"],
      });
      if (id) patch.received_into_account_id = id;
    }
    if (Object.keys(patch).length) setS((c) => ({ ...c, ...patch }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, s.sold_currency, s.received_currency, s.customer_id, owner, accounts.length]);

  // Auto-select profit destination for matched trade (in counter currency)
  useEffect(() => {
    if (mode !== "matched" || accounts.length === 0) return;
    if (m.profit_destination_account_id) return;
    const id = pickAccount({
      currency: m.counter_currency,
      ownerFallback: owner === "ali" || owner === "milad" ? owner : undefined,
      prefer: ["bank", "cash", "person_holding"],
    });
    if (id) setM((c) => ({ ...c, profit_destination_account_id: id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, m.counter_currency, owner, accounts.length]);

  // ---------- Live math ----------
  const bAmt = Number(b.bought_amount || 0);
  const bRate = Number(b.buy_rate || 0);
  const bPaidAmount = useMemo(
    () => convertAmount(b.bought_currency, b.paid_currency, bAmt, bRate),
    [b.bought_currency, b.paid_currency, bAmt, bRate],
  );

  const sAmt = Number(s.sold_amount || 0);
  const sRate = Number(s.sell_rate || 0);
  const sReceiveAmount = useMemo(
    () => convertAmount(s.sold_currency, s.received_currency, sAmt, sRate),
    [s.sold_currency, s.received_currency, sAmt, sRate],
  );

  const mAmt = Number(m.amount || 0);
  const mRateA = Number(m.a_rate || 0);
  const mRateB = Number(m.b_rate || 0);
  const mValueA = convertAmount(m.traded_currency, m.counter_currency, mAmt, mRateA);
  const mValueB = convertAmount(m.traded_currency, m.counter_currency, mAmt, mRateB);
  const mProfitCounter = mValueB - mValueA;
  const mMarginPct = mRateA > 0 ? ((mRateB - mRateA) / mRateA) * 100 : 0;

  const marketRatesQ = useLatestMarketRates();
  const aedRow = pickDisplayRate(marketRatesQ.data, "AED").row;
  const aedRateIRR = aedRow?.mid_rate ?? aedRow?.sell_rate ?? aedRow?.buy_rate ?? 0;
  const mProfitAED =
    m.counter_currency === "AED"
      ? mProfitCounter
      : m.counter_currency === "IRR" && aedRateIRR > 0
        ? mProfitCounter / aedRateIRR
        : 0;

  // ---------- Validation ----------
  type Check = { key: string; label: string; ok: boolean; hint?: string };
  const buyChecks: Check[] = mode !== "buy" ? [] : [
    { key: "amt", label: "Amount bought entered", ok: bAmt > 0 },
    { key: "rate", label: "Buy rate entered", ok: bRate > 0 },
    { key: "from", label: "Paid-from account set", ok: !!b.paid_from_account_id, hint: `Choose a ${b.paid_currency} account.` },
    { key: "into", label: "Received-into account set", ok: !!b.received_into_account_id, hint: `Where the ${b.bought_currency} lands.` },
  ];
  const sellChecks: Check[] = mode !== "sell" ? [] : [
    { key: "amt", label: "Amount sold entered", ok: sAmt > 0 },
    { key: "rate", label: "Sell rate entered", ok: sRate > 0 },
    { key: "from", label: "Sold-from account set", ok: !!s.sold_from_account_id, hint: `Which ${s.sold_currency} account (FIFO consumes from here).` },
    { key: "into", label: "Received-into account set", ok: !!s.received_into_account_id, hint: `Where the ${s.received_currency} lands.` },
    { key: "cust", label: "Customer selected", ok: !!s.customer_id || !!s.customer_name },
  ];
  const matchedChecks: Check[] = mode !== "matched" ? [] : [
    { key: "a", label: "Supplier (Customer A) selected", ok: !!m.a_customer_id },
    { key: "b", label: "Buyer (Customer B) selected", ok: !!m.b_customer_id },
    { key: "amt", label: "Amount entered", ok: mAmt > 0 },
    { key: "ra", label: "Buy rate entered", ok: mRateA > 0 },
    { key: "rb", label: "Sell rate entered", ok: mRateB > 0 },
    { key: "profit_acc", label: `Profit destination (${m.counter_currency}) selected`, ok: !!m.profit_destination_account_id, hint: `Where the ${m.counter_currency} spread lands.` },
  ];
  const checks = mode === "buy" ? buyChecks : mode === "sell" ? sellChecks : matchedChecks;
  const missing = checks.filter((c) => !c.ok);
  const canSubmit = missing.length === 0;

  const codePrefix = mode === "buy" ? "BUY" : mode === "sell" ? "SELL" : "MATCH";
  const previewCode = `${codePrefix}-${new Date(entryDate).getFullYear()}-????`;

  // ---------- Submit ----------
  const submit = useMutation({
    mutationFn: async (opts: { closeNow: boolean }) => {
      if (!canSubmit) throw new Error(`Missing: ${missing.map((x) => x.label).join(", ")}`);
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;

      // Build a trade_cycle for every mode so Deal Center can display it.
      const cycleBase: any = {
        entry_date: entryDate,
        milad_share_pct: miladPct,
        ali_share_pct: aliPct,
        notes: notes || null,
        status: "in_progress",
        trade_mode: mode,
      };

      if (mode === "buy") {
        const cyclePayload = {
          ...cycleBase,
          title: `Buy ${b.bought_currency}`,
          customer_id: b.supplier_customer_id || null,
          base_currency: b.bought_currency,
          quote_currency: b.paid_currency,
          initial_currency: b.paid_currency,
          final_currency: b.bought_currency,
          capital_amount: bPaidAmount,
          capital_currency: b.paid_currency,
          initial_amount: bPaidAmount,
        };
        const { data: cycle, error: cErr } = await supabase.from("trade_cycles" as any)
          .insert(cyclePayload).select("id, code, deal_code").single();
        if (cErr) throw cErr;
        const cycleId = (cycle as any).id as string;
        const dealCode = (cycle as any).deal_code || (cycle as any).code;

        const { error: bErr } = await supabase.from("buy_transactions").insert({
          entry_date: entryDate,
          bought_currency: b.bought_currency,
          bought_amount: bAmt,
          buy_rate: bRate,
          paid_currency: b.paid_currency,
          paid_amount: bPaidAmount,
          paid_from_account_id: b.paid_from_account_id,
          received_into_account_id: b.received_into_account_id,
          customer_id: b.supplier_customer_id || null,
          counterparty: b.supplier_name || null,
          txn_owner: owner,
          notes: `[${dealCode}] Buy${notes ? " · " + notes : ""}`,
          created_by: uid,
          trade_cycle_id: cycleId,
        } as any);
        if (bErr) throw new Error(`Buy failed: ${bErr.message}`);
        return { cycleId, code: dealCode };
      }

      if (mode === "sell") {
        const cyclePayload = {
          ...cycleBase,
          title: `Sell ${s.sold_currency} → ${s.received_currency}`,
          customer_id: s.customer_id || null,
          base_currency: s.sold_currency,
          quote_currency: s.received_currency,
          initial_currency: s.sold_currency,
          final_currency: s.received_currency,
          capital_amount: sAmt,
          capital_currency: s.sold_currency,
          initial_amount: sAmt,
        };
        const { data: cycle, error: cErr } = await supabase.from("trade_cycles" as any)
          .insert(cyclePayload).select("id, code, deal_code").single();
        if (cErr) throw cErr;
        const cycleId = (cycle as any).id as string;
        const dealCode = (cycle as any).deal_code || (cycle as any).code;

        const { data: sellIns, error: sErr } = await supabase.from("sell_transactions").insert({
          entry_date: entryDate,
          sold_currency: s.sold_currency,
          sold_amount: sAmt,
          sell_rate: sRate,
          received_currency: s.received_currency,
          received_amount: sReceiveAmount,
          sold_from_account_id: s.sold_from_account_id,
          received_into_account_id: s.received_into_account_id,
          customer_id: s.customer_id || null,
          customer_name: s.customer_name || null,
          milad_share_pct: miladPct,
          ali_share_pct: aliPct,
          notes: `[${dealCode}] Sell${notes ? " · " + notes : ""}`,
          created_by: uid,
          creates_cycle: false,
          trade_cycle_id: cycleId,
          deal_status: "open",
          currency_delivered: s.delivery_status === "delivered",
        } as any).select("id").single();
        if (sErr) throw new Error(`Sell failed: ${sErr.message}`);

        if (opts.closeNow && sellIns?.id) {
          const { error: cerr } = await (supabase as any).rpc("close_sell_deal", {
            _id: sellIns.id, _override: true, _difference_reason: "Closed via New Trade workflow",
          });
          if (cerr) throw new Error(`Saved but close failed: ${cerr.message}`);
        }
        return { cycleId, code: dealCode };
      }

      // matched
      const cyclePayload = {
        ...cycleBase,
        title: `Matched ${m.traded_currency}↔${m.counter_currency}`,
        customer_id: m.a_customer_id,
        counterparty_id: m.b_customer_id,
        base_currency: m.traded_currency,
        quote_currency: m.counter_currency,
        initial_currency: m.counter_currency,
        final_currency: m.counter_currency,
        capital_amount: mValueA,
        capital_currency: m.counter_currency,
        initial_amount: mValueA,
        expected_profit: mProfitCounter,
        expected_profit_currency: m.counter_currency,
        profit_destination_account_id: m.profit_destination_account_id || null,
        notes: [
          "Matched trade (direct settlement)",
          m.a_proof && `A proof: ${m.a_proof}`,
          m.b_proof && `B proof: ${m.b_proof}`,
          notes,
        ].filter(Boolean).join(" · ") || null,
      };
      const { data: cycle, error: cErr } = await supabase.from("trade_cycles" as any)
        .insert(cyclePayload).select("id, code, deal_code").single();
      if (cErr) throw cErr;
      void uid;
      return { cycleId: (cycle as any).id as string, code: (cycle as any).deal_code || (cycle as any).code };
    },
    onSuccess: (res, vars) => {
      toast.success(vars.closeNow ? `Trade ${res.code} closed` : `Trade ${res.code} saved`);
      navigate({ to: "/trades/$id", params: { id: res.cycleId } });
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="New Trade"
        description="Pick a mode. Everything else adjusts automatically."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/trades"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Mode selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Trade mode</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-3">
              <ModePill active={mode === "buy"} onClick={() => setMode("buy")}
                icon={<PackagePlus className="h-4 w-4" />}
                title="Buy Currency"
                subtitle="Add currency to inventory. Creates a lot for FIFO."
                code="BUY-" />
              <ModePill active={mode === "sell"} onClick={() => setMode("sell")}
                icon={<PackageMinus className="h-4 w-4" />}
                title="Sell From Inventory"
                subtitle="Consumes inventory FIFO. Realized profit vs cost basis."
                code="SELL-" />
              <ModePill active={mode === "matched"} onClick={() => setMode("matched")}
                icon={<ArrowLeftRight className="h-4 w-4" />}
                title="Matched Trade"
                subtitle="A pays B directly. We only book the spread."
                code="MATCH-" />
            </CardContent>
          </Card>

          {/* Trade info */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">Trade info</CardTitle>
                <Badge variant="outline" className="font-mono">{previewCode}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <F label="Date"><Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></F>
              <F label="Owner">
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OWNERS.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <div className="sm:col-span-3">
                <F label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context" /></F>
              </div>
            </CardContent>
          </Card>

          {mode === "buy" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Buy details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="Currency bought">
                  <Select value={b.bought_currency} onValueChange={(v) => setB({ ...b, bought_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label={`Amount (${b.bought_currency})`}>
                  <NumberInput currency={b.bought_currency} value={b.bought_amount} onChange={(e) => setB({ ...b, bought_amount: e.target.value })} placeholder="e.g. 70,000" />
                </F>
                <F label="Paid currency">
                  <Select value={b.paid_currency} onValueChange={(v) => setB({ ...b, paid_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.filter((c) => c !== b.bought_currency).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label={`Buy rate (${b.paid_currency} per 1 ${b.bought_currency})`}>
                  <div className="flex gap-2 items-center">
                    <NumberInput rate value={b.buy_rate} onChange={(e) => setB({ ...b, buy_rate: e.target.value })} />
                    <UseMarketRateButton currency={b.bought_currency} which="buy" onApply={(r) => setB({ ...b, buy_rate: String(r) })} />
                  </div>
                </F>
                <F label={`Total paid (${b.paid_currency}) — auto`}>
                  <Input value={bPaidAmount ? fmt(bPaidAmount) : ""} disabled />
                </F>
                <F label="Supplier">
                  <Select value={b.supplier_customer_id} onValueChange={(v) => setB({ ...b, supplier_customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Or free-text supplier name">
                  <Input value={b.supplier_name} onChange={(e) => setB({ ...b, supplier_name: e.target.value })} placeholder="Supplier name" />
                </F>
                <F label="Settlement status">
                  <Select value={b.settlement_status} onValueChange={(v: any) => setB({ ...b, settlement_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_paid">Not paid yet</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="later">Will pay later</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </CardContent>
            </Card>
          )}

          {mode === "sell" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Sell details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="Currency sold (from inventory)">
                  <Select value={s.sold_currency} onValueChange={(v) => setS({ ...s, sold_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label={`Amount (${s.sold_currency})`}>
                  <NumberInput currency={s.sold_currency} value={s.sold_amount} onChange={(e) => setS({ ...s, sold_amount: e.target.value })} placeholder="e.g. 70,000" />
                </F>
                <F label="Received currency">
                  <Select value={s.received_currency} onValueChange={(v) => setS({ ...s, received_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.filter((c) => c !== s.sold_currency).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label={`Sell rate (${s.received_currency} per 1 ${s.sold_currency})`}>
                  <div className="flex gap-2 items-center">
                    <NumberInput rate value={s.sell_rate} onChange={(e) => setS({ ...s, sell_rate: e.target.value })} />
                    <UseMarketRateButton currency={s.sold_currency} which="sell" onApply={(r) => setS({ ...s, sell_rate: String(r) })} />
                  </div>
                </F>
                <F label={`Receive amount (${s.received_currency}) — auto`}>
                  <Input value={sReceiveAmount ? fmt(sReceiveAmount) : ""} disabled />
                </F>
                <F label="Customer">
                  <Select value={s.customer_id} onValueChange={(v) => setS({ ...s, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Or free-text customer name">
                  <Input value={s.customer_name} onChange={(e) => setS({ ...s, customer_name: e.target.value })} placeholder="Customer name" />
                </F>
                <F label="Currency delivery">
                  <Select value={s.delivery_status} onValueChange={(v: any) => setS({ ...s, delivery_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_delivered">Not delivered</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="later">Will deliver later</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
                <F label="Payment status">
                  <Select value={s.payment_status} onValueChange={(v: any) => setS({ ...s, payment_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_received">Not received</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="later">Will receive later</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </CardContent>
            </Card>
          )}

          {mode === "matched" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Direct settlement</CardTitle>
                <div className="text-[11px] text-muted-foreground">
                  Customer A settles Customer B directly. Money never enters our accounts. We only book the spread.
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="Customer A · Supplier">
                  <Select value={m.a_customer_id} onValueChange={(v) => setM({ ...m, a_customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Customer B · Buyer">
                  <Select value={m.b_customer_id} onValueChange={(v) => setM({ ...m, b_customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select buyer" /></SelectTrigger>
                    <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label="Currency traded">
                  <Select value={m.traded_currency} onValueChange={(v) => setM({ ...m, traded_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <F label={`Amount (${m.traded_currency})`}>
                  <NumberInput currency={m.traded_currency} value={m.amount} onChange={(e) => setM({ ...m, amount: e.target.value })} placeholder="e.g. 70,000" />
                </F>
                <F label="Rate quoted in">
                  <Select value={m.counter_currency} onValueChange={(v) => setM({ ...m, counter_currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.filter((c) => c !== m.traded_currency).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
                <div className="hidden sm:block" />
                <F label={`Buy rate (${m.counter_currency} per 1 ${m.traded_currency})`} hint="Rate at which A supplies.">
                  <div className="flex gap-2 items-center">
                    <NumberInput rate value={m.a_rate} onChange={(e) => setM({ ...m, a_rate: e.target.value })} />
                    <UseMarketRateButton currency={m.traded_currency} which="buy" onApply={(r) => setM({ ...m, a_rate: String(r) })} />
                  </div>
                </F>
                <F label={`Sell rate (${m.counter_currency} per 1 ${m.traded_currency})`} hint="Rate at which B buys.">
                  <div className="flex gap-2 items-center">
                    <NumberInput rate value={m.b_rate} onChange={(e) => setM({ ...m, b_rate: e.target.value })} />
                    <UseMarketRateButton currency={m.traded_currency} which="sell" onApply={(r) => setM({ ...m, b_rate: String(r) })} />
                  </div>
                </F>
                <F label="A proof / reference (optional)">
                  <Input value={m.a_proof} onChange={(e) => setM({ ...m, a_proof: e.target.value })} placeholder="Transfer ref, screenshot ID, etc." />
                </F>
                <F label="B proof / reference (optional)">
                  <Input value={m.b_proof} onChange={(e) => setM({ ...m, b_proof: e.target.value })} placeholder="Transfer ref, screenshot ID, etc." />
                </F>
                <div className="sm:col-span-2">
                  <F
                    label={`Profit destination account (${m.counter_currency})`}
                    hint={`The spread profit (${m.counter_currency}) will be credited to this account.`}
                  >
                    <AccountSelect
                      value={m.profit_destination_account_id}
                      onChange={(v) => setM({ ...m, profit_destination_account_id: v })}
                      currency={m.counter_currency}
                      placeholder={`Select ${m.counter_currency} account`}
                    />
                  </F>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Advanced accounts — hidden by default */}
          {mode !== "matched" && (
            <Collapsible defaultOpen={false}>
              <Card>
                <CardHeader className="pb-3">
                  <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                    <div>
                      <CardTitle className="text-sm">Advanced Accounting — ledger routing</CardTitle>
                      <div className="text-[11px] text-muted-foreground">Auto-selected. Open only if the accounts below are wrong.</div>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 opacity-60" />
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {mode === "buy" && (
                      <>
                        <F label={`Paid from (${b.paid_currency})`}>
                          <AccountSelect value={b.paid_from_account_id} onChange={(v) => setB({ ...b, paid_from_account_id: v })} currency={b.paid_currency} />
                        </F>
                        <F label={`Received into (${b.bought_currency})`}>
                          <AccountSelect value={b.received_into_account_id} onChange={(v) => setB({ ...b, received_into_account_id: v })} currency={b.bought_currency} />
                        </F>
                      </>
                    )}
                    {mode === "sell" && (
                      <>
                        <F label={`Sold from (${s.sold_currency})`}>
                          <AccountSelect value={s.sold_from_account_id} onChange={(v) => setS({ ...s, sold_from_account_id: v })} currency={s.sold_currency} />
                        </F>
                        <F label={`Received into (${s.received_currency})`}>
                          <AccountSelect value={s.received_into_account_id} onChange={(v) => setS({ ...s, received_into_account_id: v })} currency={s.received_currency} holderCustomerId={s.customer_id || undefined} />
                        </F>
                      </>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="lg:sticky lg:top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {mode === "buy" && (
                <>
                  <Row label="Buying" value={bAmt ? `${fmt(bAmt)} ${b.bought_currency}` : "—"} />
                  <Row label="Buy rate" value={bRate ? `${fmt(bRate)} ${b.paid_currency}/${b.bought_currency}` : "—"} />
                  <Row label="Total paid" value={bPaidAmount ? `${fmt(bPaidAmount)} ${b.paid_currency}` : "—"} strong />
                  <div className="text-[11px] text-muted-foreground border-t pt-2">
                    Inventory lot created on save. Profit will realize when this stock is sold.
                  </div>
                </>
              )}
              {mode === "sell" && (
                <>
                  <Row label="Selling" value={sAmt ? `${fmt(sAmt)} ${s.sold_currency}` : "—"} />
                  <Row label="Sell rate" value={sRate ? `${fmt(sRate)} ${s.received_currency}/${s.sold_currency}` : "—"} />
                  <Row label="Receiving" value={sReceiveAmount ? `${fmt(sReceiveAmount)} ${s.received_currency}` : "—"} strong />
                  <div className="text-[11px] text-muted-foreground border-t pt-2">
                    FIFO consumes {s.sold_currency} inventory. Realized profit is computed vs. average cost basis.
                  </div>
                </>
              )}
              {mode === "matched" && (
                <>
                  <Row label="Buy rate" value={mRateA ? fmt(mRateA) : "—"} />
                  <Row label="Sell rate" value={mRateB ? fmt(mRateB) : "—"} />
                  <Row label="Amount" value={mAmt ? `${fmt(mAmt)} ${m.traded_currency}` : "—"} />
                  <div className="rounded-lg border bg-muted/40 p-3 text-center">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Spread profit</div>
                    <div className={`font-mono text-lg font-semibold ${mProfitCounter >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {mProfitCounter ? `${fmt(mProfitCounter)} ${m.counter_currency}` : "—"}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">≈ AED</div>
                    <div className={`font-mono text-2xl font-bold ${mProfitAED >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {mProfitAED ? fmt(mProfitAED, "AED") : "—"}
                    </div>
                    {mMarginPct !== 0 && (
                      <div className={`text-[11px] mt-1 ${mMarginPct >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        Margin {mMarginPct.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="border-t pt-2 grid grid-cols-2 gap-2">
                <F label="Milad %">
                  <Input type="number" value={miladPct} onChange={(e) => setMiladPct(Number(e.target.value) || 0)} />
                </F>
                <F label="Ali %"><Input type="number" value={aliPct} disabled /></F>
              </div>

              <ValidationPanel checks={checks} />

              <div className="flex flex-col gap-2 pt-3 border-t">
                {mode === "sell" && (
                  <Button
                    variant="secondary"
                    disabled={submit.isPending}
                    onClick={() => {
                      if (!canSubmit) return toast.error(`Missing: ${missing.map((x) => x.label).join(", ")}`);
                      submit.mutate({ closeNow: false });
                    }}
                  >
                    Save as Open Deal
                  </Button>
                )}
                <Button
                  disabled={submit.isPending}
                  onClick={() => {
                    if (!canSubmit) return toast.error(`Missing: ${missing.map((x) => x.label).join(", ")}`);
                    submit.mutate({ closeNow: mode === "sell" });
                  }}
                >
                  {submit.isPending ? "Saving…" : mode === "buy" ? "Record Buy" : mode === "sell" ? "Close Deal Now" : "Record Matched Trade"}
                </Button>
                <div className="text-[11px] text-muted-foreground">
                  {mode === "buy" && "Adds a new inventory lot at this cost basis."}
                  {mode === "sell" && "Open = track missing payment/delivery in Deal Center."}
                  {mode === "matched" && "No accounts debited. Only the spread is booked."}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ModePill({ active, onClick, icon, title, subtitle, code }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; code: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition ${active ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "hover:bg-muted"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={`h-6 w-6 rounded-full flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{icon}</span>
          {title}
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">{code}</Badge>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{subtitle}</div>
    </button>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-mono ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function ValidationPanel({ checks }: { checks: { key: string; label: string; ok: boolean; hint?: string }[] }) {
  if (checks.length === 0) return null;
  const missing = checks.filter((c) => !c.ok);
  const ready = missing.length === 0;
  return (
    <div className={`mt-3 rounded-lg border p-3 ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${ready ? "text-emerald-700" : "text-amber-800"}`}>
        {ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        {ready ? "Ready" : `${missing.length} missing`}
      </div>
      <ul className="mt-2 space-y-1 text-[12px]">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2">
            {c.ok
              ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
              : <XCircle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />}
            <div className={c.ok ? "text-muted-foreground line-through" : "text-foreground"}>
              {c.label}
              {!c.ok && c.hint ? <div className="text-[11px] text-muted-foreground no-underline">{c.hint}</div> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}