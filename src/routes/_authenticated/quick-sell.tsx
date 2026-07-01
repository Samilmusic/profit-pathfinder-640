import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountSelect, useAccounts, useCustomers } from "@/components/account-select";
import { NumberInput } from "@/components/number-input";
import { DocumentsPanel } from "@/components/documents-panel";
import { CURRENCIES, fmt, fmtProfit, roundAmount } from "@/lib/exchange";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Save, XCircle } from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";

const searchSchema = z.object({
  customer: fallback(z.string().optional(), undefined),
  src: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/_authenticated/quick-sell")({
  validateSearch: zodValidator(searchSchema),
  component: QuickSellPage,
});

function QuickSellPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const customers = useCustomers();
  const accounts = useAccounts();
  const today = new Date().toISOString().slice(0, 10);

  const [customerId, setCustomerId] = useState<string>(search.customer ?? "");
  const [soldCurrency, setSoldCurrency] = useState("AED");
  const [receivedCurrency, setReceivedCurrency] = useState("IRR");
  const [soldAmount, setSoldAmount] = useState("");
  const [sellRate, setSellRate] = useState("");
  const [sourceId, setSourceId] = useState<string>(search.src ?? "");
  const [destId, setDestId] = useState<string>("");
  const [note, setNote] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  // Live balances
  const balancesQ = useQuery({
    queryKey: ["account_balances"],
    queryFn: async () => (await supabase.from("account_balances").select("*")).data ?? [],
  });
  const balMap = useMemo(() => {
    const m = new Map<string, number>();
    (balancesQ.data ?? []).forEach((b: any) => m.set(b.account_id, Number(b.current_balance || 0)));
    return m;
  }, [balancesQ.data]);
  const sourceBalance = sourceId ? (balMap.get(sourceId) ?? 0) : null;
  const destBalance = destId ? (balMap.get(destId) ?? 0) : null;
  const accCcy = (id: string) => (accounts.data ?? []).find((a: any) => a.id === id)?.currency as string | undefined;
  const sourceAccountCcy = sourceId ? accCcy(sourceId) : undefined;
  const destAccountCcy = destId ? accCcy(destId) : undefined;

  // Auto-fill last rate for this pair
  const lastRateQ = useQuery({
    queryKey: ["last_sell_rate", soldCurrency, receivedCurrency],
    enabled: !!soldCurrency && !!receivedCurrency,
    queryFn: async () => {
      const { data } = await supabase.from("sell_transactions").select("sell_rate")
        .eq("sold_currency", soldCurrency).eq("received_currency", receivedCurrency)
        .is("deleted_at", null).order("entry_date", { ascending: false }).limit(1);
      return data?.[0]?.sell_rate ?? null;
    },
  });
  useEffect(() => {
    if (!sellRate && lastRateQ.data) setSellRate(String(lastRateQ.data));
  }, [lastRateQ.data]); // eslint-disable-line

  // FIFO inventory preview — cost basis of the sold currency in its own terms
  const lotsQ = useQuery({
    queryKey: ["inv_lots_qs", soldCurrency, sourceId],
    enabled: !!soldCurrency,
    queryFn: async () => {
      let q = supabase.from("inventory_lots")
        .select("id,remaining_amount,original_amount,cost_basis_rate,cost_basis_currency,entry_date,account_id")
        .eq("currency", soldCurrency).gt("remaining_amount", 0).neq("status", "depleted")
        .order("entry_date", { ascending: true });
      if (sourceId) q = q.eq("account_id", sourceId);
      return (await q).data ?? [];
    },
  });

  const soldN = Number(soldAmount) || 0;
  const rateN = Number(sellRate) || 0;
  const receivedAmount = roundAmount(soldN * rateN, receivedCurrency);

  // Walk FIFO to compute how much of the sold-currency inventory this deal uses.
  const preview = useMemo(() => {
    const lots = lotsQ.data ?? [];
    let need = soldN;
    let costCcy: string | null = null;
    let totalCost = 0;
    let covered = 0;
    for (const l of lots) {
      if (need <= 0) break;
      const take = Math.min(need, Number(l.remaining_amount));
      if (!costCcy) costCcy = l.cost_basis_currency;
      totalCost += take * Number(l.cost_basis_rate);
      covered += take;
      need -= take;
    }
    const available = lots.reduce((s: number, l: any) => s + Number(l.remaining_amount), 0);
    const sameCcy = costCcy && costCcy === receivedCurrency;
    const realized = sameCcy ? receivedAmount - totalCost : 0;
    return {
      covered, available,
      shortfall: Math.max(0, need),
      costCcy: costCcy ?? soldCurrency,
      totalCost,
      sameCcy,
      realized,
      miladShare: realized * 0.5,
      aliShare: realized * 0.5,
    };
  }, [lotsQ.data, soldN, receivedAmount, receivedCurrency, soldCurrency]);

  const isCycleSell = !preview.sameCcy; // cross-currency → asset conversion, not profit

  // Recent customers (last 6 from sells)
  const recentQ = useQuery({
    queryKey: ["recent_customers"],
    queryFn: async () => {
      const { data } = await supabase.from("sell_transactions").select("customer_id").not("customer_id", "is", null).order("entry_date", { ascending: false }).limit(30);
      const uniq: string[] = [];
      (data ?? []).forEach((r: any) => { if (r.customer_id && !uniq.includes(r.customer_id)) uniq.push(r.customer_id); });
      return uniq.slice(0, 6);
    },
  });

  // Warnings
  const sourceOverdraft = sourceBalance !== null && soldN > sourceBalance;
  const inventoryShort = preview.shortfall > 0.00001 && soldN > 0;
  const validationErrors: string[] = [];
  if (!customerId) validationErrors.push("Pick a customer");
  if (!soldN) validationErrors.push("Enter sold amount");
  if (!rateN) validationErrors.push("Enter sell rate");
  if (!sourceId) validationErrors.push("Pick source account");
  if (!destId) validationErrors.push(`Pick a ${receivedCurrency} receiving account`);
  if (sourceId && sourceAccountCcy && sourceAccountCcy !== soldCurrency)
    validationErrors.push(`Source account must be ${soldCurrency}`);
  if (destId && destAccountCcy && destAccountCcy !== receivedCurrency)
    validationErrors.push(`Receiving account must be ${receivedCurrency} because customer is paying ${receivedCurrency}`);
  const closeErrors: string[] = [];
  if (!note) closeErrors.push("Add a confirmation note to close");

  const save = useMutation({
    mutationFn: async (opts: { closeNow: boolean }) => {
      if (validationErrors.length) throw new Error(validationErrors[0]);
      const { data: u } = await supabase.auth.getUser();
      const payload: any = {
        entry_date: today,
        sold_currency: soldCurrency, sold_amount: soldN,
        sell_rate: rateN, received_currency: receivedCurrency, received_amount: receivedAmount,
        sold_from_account_id: sourceId, received_into_account_id: destId || null,
        customer_id: customerId || null,
        milad_share_pct: 50, ali_share_pct: 50,
        notes: note || null,
        completion_note: note || null,
        created_by: u.user?.id,
        deal_status: "open",
      };
      if (savedId) {
        const { error } = await supabase.from("sell_transactions").update(payload).eq("id", savedId);
        if (error) throw error;
        if (opts.closeNow) {
          const { error: cerr } = await (supabase as any).rpc("close_sell_deal", { _id: savedId, _override: true, _difference_reason: null });
          if (cerr) throw cerr;
        }
        return savedId;
      }
      const { data, error } = await supabase.from("sell_transactions").insert(payload).select("id").single();
      if (error) throw error;
      setSavedId(data.id);
      if (opts.closeNow) {
        const { error: cerr } = await (supabase as any).rpc("close_sell_deal", { _id: data.id, _override: true, _difference_reason: null });
        if (cerr) throw cerr;
      }
      return data.id as string;
    },
    onSuccess: (id, vars) => {
      qc.invalidateQueries();
      toast.success(vars.closeNow ? "Deal closed" : "Open deal saved — waiting for payment");
      if (vars.closeNow) navigate({ to: "/sells/$id", params: { id } });
      else setSavedId(id);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const recentCustomers = (customers.data ?? []).filter((c: any) => (recentQ.data ?? []).includes(c.id));

  return (
    <>
      <PageHeader title="Quick Sell" description="Fastest way to record a sell. Save as Open Deal now; close when the customer pays." />

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 pb-32 lg:pb-8">
        <div className="space-y-3">
          {/* Step 1 — customer */}
          <StepCard n={1} title="Customer" done={!!customerId}>
            {recentCustomers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {recentCustomers.map((c: any) => (
                  <Button key={c.id} type="button" size="sm" variant={customerId === c.id ? "default" : "outline"} onClick={() => setCustomerId(c.id)}>
                    {c.name}
                  </Button>
                ))}
              </div>
            )}
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Pick customer" /></SelectTrigger>
              <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </StepCard>

          {/* Step 2/3 — currency + amount */}
          <StepCard n={2} title="Currency you're selling" done={!!soldCurrency && !!soldN}>
            <div className="grid grid-cols-[130px_1fr] gap-2">
              <Select value={soldCurrency} onValueChange={setSoldCurrency}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <NumberInput currency={soldCurrency} value={soldAmount} onChange={(e) => setSoldAmount(e.target.value)} placeholder={`Amount in ${soldCurrency}`} />
            </div>
          </StepCard>

          {/* Step 4 — rate + received currency */}
          <StepCard n={3} title="Sell rate & money-in currency" done={!!rateN && !!receivedCurrency}>
            <div className="grid grid-cols-[130px_1fr] gap-2">
              <Select value={receivedCurrency} onValueChange={setReceivedCurrency}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <NumberInput currency="" value={sellRate} onChange={(e) => setSellRate(e.target.value)} placeholder={`${receivedCurrency} per 1 ${soldCurrency}`} />
            </div>
            {(soldCurrency === "AED" || soldCurrency === "USD") && (
              <div className="mt-2">
                <UseMarketRateButton
                  currency={soldCurrency}
                  which="sell"
                  onApply={(r: number) => setSellRate(String(r))}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Money-in currency = <span className="font-semibold">{receivedCurrency}</span>. Customer pays you in {receivedCurrency}. Receiving account below is filtered to {receivedCurrency} only.
            </p>
            {lastRateQ.data && !sellRate && (
              <p className="text-xs text-muted-foreground mt-2">Last rate: <button className="underline" onClick={() => setSellRate(String(lastRateQ.data))}>{fmt(lastRateQ.data)}</button></p>
            )}
          </StepCard>

          {/* Step 5/6 — accounts */}
          <StepCard n={4} title="Currency out / Money in" done={!!sourceId && !!destId}>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Currency Out Account · {soldCurrency} only</Label>
                <AccountSelect currency={soldCurrency} value={sourceId} onChange={setSourceId} />
                {sourceId && sourceBalance !== null && (
                  <p className={`text-xs mt-1 ${sourceOverdraft ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                    Available: {fmt(sourceBalance, soldCurrency)}
                    {sourceOverdraft && <> · Selling more than available!</>}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Money In Account · {receivedCurrency} only</Label>
                <AccountSelect currency={receivedCurrency} value={destId} onChange={setDestId} placeholder={`Select ${receivedCurrency} account`} />
                {destId && destBalance !== null && (
                  <p className="text-xs mt-1 text-muted-foreground">Current: {fmt(destBalance, receivedCurrency)} → after: {fmt(destBalance + receivedAmount, receivedCurrency)}</p>
                )}
                {destId && destAccountCcy && destAccountCcy !== receivedCurrency && (
                  <p className="text-xs mt-1 text-destructive font-semibold">
                    Receiving account must be a {receivedCurrency} account because customer is paying {receivedCurrency}.
                  </p>
                )}
                {sourceId && sourceAccountCcy && sourceAccountCcy !== soldCurrency && (
                  <p className="text-xs mt-1 text-destructive font-semibold">
                    Source account must be a {soldCurrency} account.
                  </p>
                )}
              </div>
            </div>
          </StepCard>

          {/* Step 7 — proof */}
          <StepCard n={5} title="Payment / delivery proof" done={!!savedId}>
            {savedId ? (
              <DocumentsPanel refType="sell" refId={savedId} />
            ) : (
              <p className="text-sm text-muted-foreground">Save as Open Deal first to attach receipts, or upload later from the deal page.</p>
            )}
          </StepCard>

          {/* Step 8 — note & review */}
          <StepCard n={6} title="Confirmation note" done={!!note}>
            <textarea
              className="w-full min-h-[70px] rounded-md border bg-background px-3 py-2 text-sm"
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Cash handed to customer, confirmed on WhatsApp."
            />
          </StepCard>
        </div>

        {/* Live profit panel */}
        <div className="lg:sticky lg:top-4 lg:self-start space-y-3">
          <Card>
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Live P&amp;L</div>
              <PL label="Sell rate" value={`${fmt(rateN)} ${receivedCurrency}/${soldCurrency}`} />
              <PL label="Received" value={fmt(receivedAmount, receivedCurrency)} />
              <PL label={`${soldCurrency} inventory used (FIFO)`} value={fmt(preview.covered, soldCurrency)} />
              {isCycleSell ? (
                <div className="border-t pt-2 space-y-1.5">
                  <PL label="Profit status" value="Pending cycle profit" accent="warn" />
                  <PL label="Realized profit" value={`0 ${soldCurrency}`} />
                  <PL label="Milad share" value={`0 ${soldCurrency}`} />
                  <PL label="Ali share" value={`0 ${soldCurrency}`} />
                  <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-2 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
                    This is an asset conversion, not profit. {soldCurrency} inventory goes out, {receivedCurrency} inventory comes in.
                    Profit will be realized only when the {receivedCurrency} is converted back to {soldCurrency} or this cycle is closed.
                  </div>
                </div>
              ) : (
                <div className="border-t pt-2">
                  <PL label="Cost basis" value={fmt(preview.totalCost, preview.costCcy)} />
                  <PL label="Realized profit" value={fmtProfit(preview.realized, receivedCurrency)} accent={preview.realized >= 0 ? "success" : "danger"} />
                  <PL label="Milad share (50%)" value={fmtProfit(preview.miladShare, receivedCurrency)} />
                  <PL label="Ali share (50%)" value={fmtProfit(preview.aliShare, receivedCurrency)} />
                </div>
              )}
              {inventoryShort && (
                <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
                  Not enough {soldCurrency} inventory. Available: {fmt(preview.available, soldCurrency)} · Short: {fmt(preview.shortfall, soldCurrency)}
                </div>
              )}
            </CardContent>
          </Card>

          {sourceOverdraft && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>You're selling more {soldCurrency} than the source account has. Balance will go negative.</div>
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="rounded-lg border bg-secondary/40 p-3 text-sm">
              <div className="font-medium mb-1">Missing steps</div>
              <ul className="text-xs list-disc pl-4 text-muted-foreground space-y-0.5">
                {validationErrors.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-14 md:bottom-0 left-0 right-0 z-30 bg-card border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:relative lg:bottom-auto lg:border-0 lg:bg-transparent lg:p-0 lg:mt-4">
        <div className="max-w-[1600px] mx-auto flex gap-2">
          <Button variant="ghost" className="h-12" onClick={() => navigate({ to: "/sell" })} disabled={save.isPending}>
            <XCircle className="h-4 w-4 mr-2" /> Cancel
          </Button>
          <Button className="flex-1 h-12" disabled={save.isPending || validationErrors.length > 0} onClick={() => save.mutate({ closeNow: false })}>
            <Save className="h-4 w-4 mr-2" /> Save as Open Deal
          </Button>
          <Button variant="outline" className="flex-1 h-12" disabled={save.isPending || validationErrors.length > 0 || closeErrors.length > 0} onClick={() => save.mutate({ closeNow: true })}>
            <CheckCircle2 className="h-4 w-4 mr-2" /> Close Deal
          </Button>
        </div>
      </div>
    </>
  );
}

function StepCard({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className={`h-6 w-6 rounded-full grid place-items-center text-xs font-semibold ${done ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
            {done ? "✓" : n}
          </div>
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function PL({ label, value, accent }: { label: string; value: string; accent?: "success" | "danger" | "warn" }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-mono ${accent === "success" ? "text-emerald-700 font-semibold" : accent === "danger" ? "text-destructive font-semibold" : accent === "warn" ? "text-amber-600 font-semibold" : ""}`}>{value}</span>
    </div>
  );
}