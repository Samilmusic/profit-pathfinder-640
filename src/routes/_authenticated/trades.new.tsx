import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountSelect, useCustomers } from "@/components/account-select";
import { CURRENCIES, OWNERS, fmt } from "@/lib/exchange";
import { UseMarketRateButton } from "@/components/use-market-rate-button";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

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

function NewTradePage() {
  const navigate = useNavigate();
  const customers = useCustomers();
  const today = new Date().toISOString().slice(0, 10);

  const [f, setF] = useState({
    entry_date: today,
    owner: "shared",
    notes: "",
    // Buy side
    bought_from_customer_id: "",
    bought_from_name: "",
    bought_currency: "AED",
    bought_amount: "",
    buy_rate: "",
    paid_currency: "IRR",
    paid_from_account_id: "",
    received_into_account_id: "",
    // Sell side
    sold_to_customer_id: "",
    sold_to_name: "",
    sold_amount: "",
    sell_rate: "",
    receive_currency: "IRR",
    receive_into_account_id: "",
    // Split
    milad_pct: 50,
    ali_pct: 50,
  });

  const boughtAmt = Number(f.bought_amount || 0);
  const soldAmt = Number(f.sold_amount || 0);
  const buyRate = Number(f.buy_rate || 0);
  const sellRate = Number(f.sell_rate || 0);
  const paidAmount = useMemo(() => boughtAmt * buyRate, [boughtAmt, buyRate]);
  const receiveAmount = useMemo(() => soldAmt * sellRate, [soldAmt, sellRate]);

  const buyCostForSold = soldAmt * buyRate; // cost portion attributed to sold amount
  const grossProfit = receiveAmount - buyCostForSold;
  const marginPct = buyCostForSold > 0 ? (grossProfit / buyCostForSold) * 100 : 0;
  const miladShare = (grossProfit * Number(f.milad_pct || 0)) / 100;
  const aliShare = (grossProfit * Number(f.ali_pct || 0)) / 100;
  const remainingInventory = Math.max(0, boughtAmt - soldAmt);

  const sameCurrency = f.paid_currency === f.receive_currency;
  const canSubmit =
    boughtAmt > 0 && soldAmt > 0 && buyRate > 0 && sellRate > 0 &&
    soldAmt <= boughtAmt &&
    f.paid_from_account_id && f.received_into_account_id && f.receive_into_account_id;

  const previewCode = useMemo(() => {
    const y = new Date(f.entry_date).getFullYear();
    return `TRD-${y}-????`;
  }, [f.entry_date]);

  const submit = useMutation({
    mutationFn: async (opts: { closeNow: boolean }) => {
      if (!canSubmit) throw new Error("Fill all required fields (accounts, amounts, rates). Sold amount cannot exceed bought amount.");
      if (Math.abs(Number(f.milad_pct) + Number(f.ali_pct) - 100) > 0.01) throw new Error("Milad % + Ali % must equal 100");

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;

      // 1. Create trade cycle
      const cyclePayload: any = {
        entry_date: f.entry_date,
        title: `Buy/Sell ${f.bought_currency}`,
        customer_id: f.bought_from_customer_id || null,
        counterparty_id: f.sold_to_customer_id || null,
        base_currency: f.bought_currency,
        quote_currency: f.paid_currency,
        initial_currency: f.paid_currency,
        intermediate_currency: f.bought_currency,
        final_currency: f.receive_currency,
        capital_amount: paidAmount,
        capital_currency: f.paid_currency,
        initial_amount: paidAmount,
        expected_profit: grossProfit,
        expected_profit_currency: f.receive_currency,
        milad_share_pct: Number(f.milad_pct),
        ali_share_pct: Number(f.ali_pct),
        notes: f.notes || null,
        status: "in_progress",
      };
      const { data: cycle, error: cErr } = await supabase.from("trade_cycles" as any)
        .insert(cyclePayload).select("id, code").single();
      if (cErr) throw cErr;
      const cycleId = (cycle as any).id as string;
      const cycleCode = (cycle as any).code as string;

      // 2. Insert buy transaction (creates inventory lot via trigger)
      const buyPayload: any = {
        entry_date: f.entry_date,
        bought_currency: f.bought_currency,
        bought_amount: boughtAmt,
        buy_rate: buyRate,
        paid_currency: f.paid_currency,
        paid_amount: paidAmount,
        paid_from_account_id: f.paid_from_account_id,
        received_into_account_id: f.received_into_account_id,
        customer_id: f.bought_from_customer_id || null,
        counterparty: f.bought_from_name || null,
        txn_owner: f.owner,
        notes: f.notes ? `[${cycleCode}] ${f.notes}` : `[${cycleCode}]`,
        created_by: uid,
        trade_cycle_id: cycleId,
      };
      const { error: bErr } = await supabase.from("buy_transactions").insert(buyPayload);
      if (bErr) throw new Error(`Buy leg failed: ${bErr.message}`);

      // 3. Insert sell transaction (consumes lot via FIFO trigger)
      const sellPayload: any = {
        entry_date: f.entry_date,
        sold_currency: f.bought_currency,
        sold_amount: soldAmt,
        sell_rate: sellRate,
        received_currency: f.receive_currency,
        received_amount: receiveAmount,
        sold_from_account_id: f.received_into_account_id, // buy deposited here
        received_into_account_id: f.receive_into_account_id,
        customer_id: f.sold_to_customer_id || null,
        customer_name: f.sold_to_name || null,
        milad_share_pct: Number(f.milad_pct),
        ali_share_pct: Number(f.ali_pct),
        notes: `[${cycleCode}] ${f.notes || ""}`.trim(),
        created_by: uid,
        creates_cycle: false,
        trade_cycle_id: cycleId,
        deal_status: "open",
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="New Trade"
        description="Enter a buy + sell as one connected trade. Accounting, inventory, and ledger update automatically."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/trades"><ArrowLeft className="h-4 w-4 mr-1" />Back to trades</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Basic info */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Basic info</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Trade code (auto)"><Input value={previewCode} disabled className="font-mono" /></F>
              <F label="Date"><Input type="date" value={f.entry_date} onChange={(e) => setF({ ...f, entry_date: e.target.value })} /></F>
              <F label="Owner">
                <Select value={f.owner} onValueChange={(v) => setF({ ...f, owner: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OWNERS.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <div className="sm:col-span-2">
                <F label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Optional context for this trade" /></F>
              </div>
            </CardContent>
          </Card>

          {/* Buy side */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Buy side — where the currency comes from</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Bought from (customer)">
                <Select value={f.bought_from_customer_id} onValueChange={(v) => setF({ ...f, bought_from_customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Or free-text name">
                <Input value={f.bought_from_name} onChange={(e) => setF({ ...f, bought_from_name: e.target.value })} placeholder="e.g. Ali" />
              </F>
              <F label="Bought currency">
                <Select value={f.bought_currency} onValueChange={(v) => setF({ ...f, bought_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Bought amount">
                <Input type="number" step="0.0001" value={f.bought_amount}
                  onChange={(e) => setF({ ...f, bought_amount: e.target.value, sold_amount: f.sold_amount || e.target.value })} />
              </F>
              <F label={`Buy rate (${f.paid_currency} per 1 ${f.bought_currency})`}>
                <div className="flex gap-2 items-center">
                  <Input type="number" step="0.0001" value={f.buy_rate} onChange={(e) => setF({ ...f, buy_rate: e.target.value })} />
                  <UseMarketRateButton currency={f.bought_currency} which="buy" onApply={(r) => setF({ ...f, buy_rate: String(r) })} />
                </div>
              </F>
              <F label="Paid currency">
                <Select value={f.paid_currency} onValueChange={(v) => setF({ ...f, paid_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Paid amount (auto)"><Input value={paidAmount ? fmt(paidAmount) : ""} disabled /></F>
              <F label="Paid from account">
                <AccountSelect value={f.paid_from_account_id} onChange={(v) => setF({ ...f, paid_from_account_id: v })} currency={f.paid_currency} />
              </F>
              <F label="Bought currency deposit account">
                <AccountSelect value={f.received_into_account_id} onChange={(v) => setF({ ...f, received_into_account_id: v })} currency={f.bought_currency} />
              </F>
            </CardContent>
          </Card>

          {/* Sell side */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Sell side — where the currency goes</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Sold to (customer)">
                <Select value={f.sold_to_customer_id} onValueChange={(v) => setF({ ...f, sold_to_customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Or free-text name">
                <Input value={f.sold_to_name} onChange={(e) => setF({ ...f, sold_to_name: e.target.value })} placeholder="e.g. Reza" />
              </F>
              <F label={`Sold amount (${f.bought_currency})`} hint={remainingInventory > 0 ? `Remaining inventory: ${fmt(remainingInventory)} ${f.bought_currency}` : undefined}>
                <Input type="number" step="0.0001" value={f.sold_amount} onChange={(e) => setF({ ...f, sold_amount: e.target.value })} />
              </F>
              <F label={`Sell rate (${f.receive_currency} per 1 ${f.bought_currency})`}>
                <div className="flex gap-2 items-center">
                  <Input type="number" step="0.0001" value={f.sell_rate} onChange={(e) => setF({ ...f, sell_rate: e.target.value })} />
                  <UseMarketRateButton currency={f.bought_currency} which="sell" onApply={(r) => setF({ ...f, sell_rate: String(r) })} />
                </div>
              </F>
              <F label="Receive currency">
                <Select value={f.receive_currency} onValueChange={(v) => setF({ ...f, receive_currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Receive amount (auto)"><Input value={receiveAmount ? fmt(receiveAmount) : ""} disabled /></F>
              <F label="Receive into account">
                <AccountSelect value={f.receive_into_account_id} onChange={(v) => setF({ ...f, receive_into_account_id: v })} currency={f.receive_currency} />
              </F>
            </CardContent>
          </Card>
        </div>

        {/* Sticky profit preview */}
        <div className="space-y-4">
          <Card className="lg:sticky lg:top-4">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Profit preview</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Buy cost" value={`${fmt(buyCostForSold)} ${f.paid_currency}`} />
              <Row label="Sell value" value={`${fmt(receiveAmount)} ${f.receive_currency}`} />
              <div className="border-t pt-2">
                <Row label="Gross profit"
                  value={sameCurrency ? `${fmt(grossProfit)} ${f.receive_currency}` : "—"}
                  strong tone={grossProfit >= 0 ? "pos" : "neg"} />
                {!sameCurrency && (
                  <div className="text-[11px] text-muted-foreground">Profit shown only when paid and receive currencies match.</div>
                )}
                {sameCurrency && (
                  <Row label="Margin" value={`${marginPct.toFixed(2)}%`} tone={marginPct >= 0 ? "pos" : "neg"} />
                )}
              </div>
              <div className="border-t pt-2 grid grid-cols-2 gap-2">
                <F label={`Milad %`}>
                  <Input type="number" value={f.milad_pct}
                    onChange={(e) => setF({ ...f, milad_pct: Number(e.target.value), ali_pct: 100 - Number(e.target.value) })} />
                </F>
                <F label="Ali %"><Input type="number" value={f.ali_pct} disabled /></F>
              </div>
              {sameCurrency && (
                <>
                  <Row label="Milad share" value={`${fmt(miladShare)} ${f.receive_currency}`} />
                  <Row label="Ali share" value={`${fmt(aliShare)} ${f.receive_currency}`} />
                </>
              )}
              {remainingInventory > 0 && (
                <div className="border-t pt-2 text-xs text-amber-600">
                  Partial trade: {fmt(remainingInventory)} {f.bought_currency} will remain in inventory.
                </div>
              )}
              {soldAmt > boughtAmt && (
                <div className="border-t pt-2 text-xs text-destructive">
                  Sold amount exceeds bought amount. Reduce sold amount or increase bought amount.
                </div>
              )}

              <div className="flex flex-col gap-2 pt-3 border-t">
                <Button
                  variant="secondary"
                  disabled={!canSubmit || submit.isPending}
                  onClick={() => submit.mutate({ closeNow: false })}
                >
                  Save Open Trade
                </Button>
                <Button
                  disabled={!canSubmit || submit.isPending}
                  onClick={() => submit.mutate({ closeNow: true })}
                >
                  Close Trade Now
                </Button>
                <div className="text-[11px] text-muted-foreground">
                  Open = track payment/receipts later. Close Now = record settled trade immediately (uses admin override for receipts).
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
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