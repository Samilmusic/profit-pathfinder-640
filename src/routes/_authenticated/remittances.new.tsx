import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountSelect, useCustomers } from "@/components/account-select";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { NumberInput } from "@/components/number-input";
import { CURRENCIES, fmt, fmtProfit } from "@/lib/exchange";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/remittances/new")({
  component: NewRemittancePage,
  head: () => ({ meta: [{ title: "New Remittance — Exchange Portal" }] }),
});

const TRANSFER_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash_delivery", label: "Cash Delivery" },
  { value: "wallet_transfer", label: "Wallet Transfer" },
  { value: "other", label: "Other" },
];

type CommissionMethod = "fixed" | "percentage" | "included" | "free";

function NewRemittancePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const customers = useCustomers();
  const today = new Date().toISOString().slice(0, 10);

  // Customer
  const [customerId, setCustomerId] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerRef, setCustomerRef] = useState("");

  // Transfer
  const [transferCurrency, setTransferCurrency] = useState("AED");
  const [transferredAmount, setTransferredAmount] = useState("");
  const [transferDate, setTransferDate] = useState(today);
  const [transferMethod, setTransferMethod] = useState("bank_transfer");

  // Beneficiary
  const [benName, setBenName] = useState("");
  const [benBank, setBenBank] = useState("");
  const [benAcct, setBenAcct] = useState("");
  const [benIban, setBenIban] = useState("");
  const [benCard, setBenCard] = useState("");
  const [benCountry, setBenCountry] = useState("");
  const [benNotes, setBenNotes] = useState("");

  // Source
  const [sourceAccountId, setSourceAccountId] = useState("");

  // Customer payment
  const [payCurrency, setPayCurrency] = useState("IRR");
  const [payAmount, setPayAmount] = useState("");
  const [refRate, setRefRate] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");

  // Settlement method (NEW — third-party / linked-buy)
  const [paymentDestination, setPaymentDestination] = useState<
    "into_account" | "cash_to_us" | "to_third_party" | "settles_linked_buy" | "pending"
  >("into_account");
  const [thirdPartyCustomerId, setThirdPartyCustomerId] = useState("");
  const [thirdPartyName, setThirdPartyName] = useState("");
  const [linkedBuyId, setLinkedBuyId] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementCurrency, setSettlementCurrency] = useState("IRR");
  const [settlementDate, setSettlementDate] = useState(today);
  const [excessAllocation, setExcessAllocation] = useState<
    "none" | "our_account" | "another_supplier" | "customer_balance" | "pending" | "commission"
  >("none");
  const [excessNote, setExcessNote] = useState("");

  const isThirdParty = paymentDestination === "to_third_party" || paymentDestination === "settles_linked_buy";

  // Auto-mirror settlement currency/amount from customer payment inputs
  useMemo(() => {
    if (isThirdParty) {
      if (!settlementCurrency && payCurrency) setSettlementCurrency(payCurrency);
    }
  }, [isThirdParty, payCurrency]); // eslint-disable-line

  const openBuysQ = useQuery({
    enabled: isThirdParty,
    queryKey: ["open-buys-for-remittance", newBuy.supplierId, thirdPartyCustomerId],
    queryFn: async () => {
      let q = supabase.from("buy_transactions").select("id,doc_no,bought_amount,bought_currency,paid_amount,paid_currency,buy_rate,customer_id,counterparty")
        .is("deleted_at", null).eq("settlement_source", "own_funds")
        .order("entry_date", { ascending: false }).limit(20);
      const cid = thirdPartyCustomerId || newBuy.supplierId;
      if (cid) q = q.eq("customer_id", cid);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const settlementSummary = useMemo(() => {
    const cust = Number(payAmount) || 0;
    const set = Number(settlementAmount) || 0;
    return { diff: cust - set, absDiff: Math.abs(cust - set) };
  }, [payAmount, settlementAmount]);

  // Commission
  const [commMethod, setCommMethod] = useState<CommissionMethod>("included");
  const [commFixedAmount, setCommFixedAmount] = useState("");
  const [commFixedCurrency, setCommFixedCurrency] = useState("AED");
  const [commPercent, setCommPercent] = useState("");

  // FX Purchase (rate spread trading profit)
  const [fxPurchaseRate, setFxPurchaseRate] = useState("");
  const [fxSupplierId, setFxSupplierId] = useState("");
  const [fxSupplierName, setFxSupplierName] = useState("");
  const [fxPurchasedAmount, setFxPurchasedAmount] = useState("");

  const [entryDate, setEntryDate] = useState(today);
  const [notes, setNotes] = useState("");

  // Calculations
  const calc = useMemo(() => {
    const t = Number(transferredAmount) || 0;
    const p = Number(payAmount) || 0;
    const r = Number(refRate) || 0;
    const baseValueInPayCcy = t * r; // e.g. 10,000 AED * 500,000 IRR/AED = 5,000,000,000 IRR

    let grossPayCcy = 0;
    let grossAed = 0;

    if (commMethod === "free") {
      grossPayCcy = 0; grossAed = 0;
    } else if (commMethod === "fixed") {
      const amt = Number(commFixedAmount) || 0;
      if (commFixedCurrency === payCurrency) {
        grossPayCcy = amt;
      }
      if (commFixedCurrency === "AED") {
        grossAed = amt;
      } else if (commFixedCurrency === transferCurrency && r > 0 && transferCurrency !== "AED") {
        // convert fixed via ref rate later
        grossAed = 0;
      } else if (commFixedCurrency === "AED") {
        // handled
      }
      // Best-effort AED conversion: if payCcy IRR and transferCcy AED, then 1 AED = r IRR
      if (transferCurrency === "AED" && r > 0) {
        if (commFixedCurrency === payCurrency) grossAed = amt / r;
        else if (commFixedCurrency === "AED") grossAed = amt;
      }
    } else if (commMethod === "percentage") {
      const pct = Number(commPercent) || 0;
      grossPayCcy = (baseValueInPayCcy * pct) / 100;
      if (transferCurrency === "AED" && r > 0) grossAed = (t * pct) / 100;
    } else if (commMethod === "included") {
      grossPayCcy = p - baseValueInPayCcy;
      if (transferCurrency === "AED" && r > 0) grossAed = grossPayCcy / r;
    }

    return {
      baseValueInPayCcy,
      grossPayCcy,
      grossAed,
    };
  }, [transferredAmount, payAmount, refRate, commMethod, commFixedAmount, commFixedCurrency, commPercent, transferCurrency, payCurrency]);

  // FX Trading profit calculation — customer rate vs supplier rate spread
  const fxCalc = useMemo(() => {
    const customerRate = Number(refRate) || 0;
    const supplierRate = Number(fxPurchaseRate) || 0;
    const purchasedAmt = Number(fxPurchasedAmount) || Number(transferredAmount) || 0;
    const spread = customerRate - supplierRate;
    const tradingPayCcy = spread * purchasedAmt;
    // Convert to AED: pay_ccy per transfer_ccy = customerRate. If transfer_ccy is AED, dividing
    // by customerRate converts pay_ccy → AED. Otherwise best-effort keeps same conversion path.
    const tradingAed = customerRate > 0 && transferCurrency === "AED" ? tradingPayCcy / customerRate : 0;
    const hasFx = supplierRate > 0 && purchasedAmt > 0;
    return { customerRate, supplierRate, purchasedAmt, spread, tradingPayCcy, tradingAed, hasFx };
  }, [refRate, fxPurchaseRate, fxPurchasedAmount, transferredAmount, transferCurrency]);

  const totalProfitPayCcy = calc.grossPayCcy + (fxCalc.hasFx ? fxCalc.tradingPayCcy : 0);
  const totalProfitAed = calc.grossAed + (fxCalc.hasFx ? fxCalc.tradingAed : 0);

  const save = useMutation({
    mutationFn: async (opts: { close: boolean }) => {
      if (!customerId) throw new Error("Select a customer");
      if (!transferredAmount || Number(transferredAmount) <= 0) throw new Error("Enter the transferred amount");
      if (!sourceAccountId) throw new Error("Select the source account (paid from)");
      if (opts.close) {
        if (!payAmount || Number(payAmount) <= 0) throw new Error("Enter the customer payment amount before closing");
        if (!benName) throw new Error("Enter beneficiary name before closing");
        if (paymentDestination === "into_account" && !paymentAccountId) throw new Error("Select the payment received account before closing");
      }
      if (isThirdParty) {
        if (!thirdPartyCustomerId && !thirdPartyName) throw new Error("Choose who the customer paid to");
        if (!settlementAmount || Number(settlementAmount) <= 0) throw new Error("Enter the settlement amount");
      }

      // Auto-create a hidden Linked Buy from remittance data. The operator will
      // finalise it later via "Receive Currency" on the remittance detail page.
      let linkedBuyIdFinal: string | null = linkedBuyId || null;
      if (isThirdParty && !linkedBuyIdFinal) {
        const bAmt = Number(fxPurchasedAmount) || Number(transferredAmount) || 0;
        const rate = Number(fxPurchaseRate) || Number(refRate) || 0;
        const paidAmt = Number(settlementAmount) || (bAmt * rate) || 0;
        if (!bAmt) throw new Error("Cannot create linked buy — enter transfer amount");
        if (!rate) throw new Error("Cannot create linked buy — enter reference or supplier rate");
        const { data: u2 } = await supabase.auth.getUser();
        const { data: newB, error: bErr } = await supabase.from("buy_transactions").insert({
          entry_date: entryDate,
          bought_currency: transferCurrency,
          bought_amount: bAmt,
          buy_rate: rate,
          paid_currency: settlementCurrency || payCurrency,
          paid_amount: paidAmt,
          paid_from_account_id: null,
          received_into_account_id: null,
          customer_id: fxSupplierId || thirdPartyCustomerId || null,
          counterparty: fxSupplierName || thirdPartyName || null,
          settlement_source: "remittance_payment",
          created_by: u2.user?.id,
        } as any).select("id").single();
        if (bErr) throw bErr;
        linkedBuyIdFinal = newB.id as string;
      }

      const { data: u } = await supabase.auth.getUser();
      const insert: any = {
        entry_date: entryDate,
        status: opts.close ? "closed" : "open",
        customer_id: customerId,
        customer_phone: customerPhone || null,
        customer_reference: customerRef || null,
        transfer_currency: transferCurrency,
        transferred_amount: Number(transferredAmount),
        transfer_date: transferDate || null,
        transfer_method: transferMethod,
        beneficiary_name: benName || null,
        beneficiary_bank: benBank || null,
        beneficiary_account_number: benAcct || null,
        beneficiary_iban: benIban || null,
        beneficiary_card_number: benCard || null,
        beneficiary_country: benCountry || null,
        beneficiary_notes: benNotes || null,
        source_account_id: sourceAccountId,
        customer_payment_currency: payCurrency,
        customer_payment_amount: Number(payAmount) || 0,
        reference_rate: Number(refRate) || 0,
        payment_received_account_id: isThirdParty ? null : (paymentAccountId || null),
        payment_destination: paymentDestination,
        third_party_customer_id: isThirdParty ? (thirdPartyCustomerId || null) : null,
        third_party_name: isThirdParty ? (thirdPartyName || null) : null,
        linked_buy_id: isThirdParty ? linkedBuyIdFinal : null,
        settlement_amount: isThirdParty ? (Number(settlementAmount) || null) : null,
        settlement_currency: isThirdParty ? (settlementCurrency || null) : null,
        settlement_date: isThirdParty ? (settlementDate || null) : null,
        excess_allocation: isThirdParty ? excessAllocation : "none",
        excess_allocation_note: isThirdParty && excessAllocation !== "none" ? (excessNote || null) : null,
        commission_method: commMethod,
        commission_fixed_amount: commMethod === "fixed" ? Number(commFixedAmount) || 0 : null,
        commission_fixed_currency: commMethod === "fixed" ? commFixedCurrency : null,
        commission_percentage: commMethod === "percentage" ? Number(commPercent) || 0 : null,
        gross_commission_pay_ccy: calc.grossPayCcy,
        gross_commission_aed: calc.grossAed,
        linked_expenses_aed: 0,
        net_commission_aed: calc.grossAed,
        fx_purchase_rate: fxCalc.hasFx ? fxCalc.supplierRate : null,
        fx_supplier_customer_id: fxCalc.hasFx ? (fxSupplierId || null) : null,
        fx_supplier_name: fxCalc.hasFx ? (fxSupplierName || null) : null,
        fx_purchased_amount: fxCalc.hasFx ? fxCalc.purchasedAmt : null,
        fx_trading_profit_pay_ccy: fxCalc.hasFx ? fxCalc.tradingPayCcy : 0,
        fx_trading_profit_aed: fxCalc.hasFx ? fxCalc.tradingAed : 0,
        notes: notes || null,
        created_by: u.user?.id,
      };
      const { data, error } = await supabase.from("remittances").insert(insert).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries();
      toast.success("Remittance saved");
      nav({ to: "/remittances/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-[100dvh] w-full bg-background" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 120px)" }}>
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="icon" className="h-10 w-10">
            <Link to="/remittances"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold flex items-center gap-2"><Send className="h-4 w-4" /> New Remittance</h1>
            <p className="text-xs text-muted-foreground">Commission-based money transfer service.</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
        {/* Customer */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold">1. Customer</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5 md:col-span-1">
                <Label>Customer *</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-11" placeholder="+971…" />
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} className="h-11" placeholder="Customer's ref / order id" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transfer */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold">2. Transfer Details (what we sent)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={transferCurrency} onValueChange={setTransferCurrency}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <Label>Actual amount transferred *</Label>
                <NumberInput currency={transferCurrency} value={transferredAmount} onChange={(e) => setTransferredAmount((e.target as HTMLInputElement).value)} className="h-11 text-lg font-semibold" />
              </div>
              <div className="space-y-1.5">
                <Label>Transfer date</Label>
                <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Transfer method</Label>
                <Select value={transferMethod} onValueChange={setTransferMethod}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{TRANSFER_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Paid from account *</Label>
                <AccountSelect value={sourceAccountId} onChange={setSourceAccountId} currency={transferCurrency} placeholder="Source account (this decreases)" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Beneficiary */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold">3. Beneficiary</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={benName} onChange={(e) => setBenName(e.target.value)} className="h-11" /></div>
              <div className="space-y-1.5"><Label>Bank</Label><Input value={benBank} onChange={(e) => setBenBank(e.target.value)} className="h-11" /></div>
              <div className="space-y-1.5"><Label>Account number</Label><Input value={benAcct} onChange={(e) => setBenAcct(e.target.value)} className="h-11" /></div>
              <div className="space-y-1.5"><Label>IBAN</Label><Input value={benIban} onChange={(e) => setBenIban(e.target.value)} className="h-11" /></div>
              <div className="space-y-1.5"><Label>Card number</Label><Input value={benCard} onChange={(e) => setBenCard(e.target.value)} className="h-11" /></div>
              <div className="space-y-1.5"><Label>Country</Label><Input value={benCountry} onChange={(e) => setBenCountry(e.target.value)} className="h-11" /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Textarea value={benNotes} onChange={(e) => setBenNotes(e.target.value)} rows={2} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Customer payment */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold">4. Customer Payment</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={payCurrency} onValueChange={setPayCurrency}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <Label>Amount paid by customer</Label>
                <NumberInput currency={payCurrency} value={payAmount} onChange={(e) => setPayAmount((e.target as HTMLInputElement).value)} className="h-11 text-lg font-semibold" />
              </div>
              <div className="space-y-1.5">
                <Label>Reference rate ({payCurrency}/{transferCurrency})</Label>
                <NumberInput rate value={refRate} onChange={(e) => setRefRate((e.target as HTMLInputElement).value)} className="h-11" placeholder="e.g. 500,000" />
              </div>
              {paymentDestination === "into_account" && (
                <div className="space-y-1.5 md:col-span-4">
                  <Label>Received into account *</Label>
                  <AccountSelect value={paymentAccountId} onChange={setPaymentAccountId} currency={payCurrency} placeholder="Account that received customer payment" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Settlement Method */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">5. Settlement Method</div>
              <Badge variant="outline" className="text-[10px]">where did the customer pay?</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {([
                { v: "into_account", label: "Our account" },
                { v: "cash_to_us", label: "Cash to us" },
                { v: "to_third_party", label: "Third party" },
                { v: "settles_linked_buy", label: "Settles a buy" },
                { v: "pending", label: "Pending" },
              ] as const).map((o) => (
                <button key={o.v} type="button" onClick={() => setPaymentDestination(o.v)}
                  className={`h-11 rounded-md border text-xs font-medium transition ${paymentDestination === o.v ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}>
                  {o.label}
                </button>
              ))}
            </div>

            {isThirdParty && (
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Paid to (existing supplier/customer)</Label>
                    <Select value={thirdPartyCustomerId} onValueChange={(v) => { setThirdPartyCustomerId(v); if (v) setThirdPartyName(""); }}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="— optional —" /></SelectTrigger>
                      <SelectContent>
                        {(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>…or name (free text)</Label>
                    <Input value={thirdPartyName} onChange={(e) => { setThirdPartyName(e.target.value); if (e.target.value) setThirdPartyCustomerId(""); }} className="h-11" placeholder="Supplier / receiver" />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label>Settlement currency</Label>
                    <Select value={settlementCurrency} onValueChange={setSettlementCurrency}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-1 md:col-span-2">
                    <Label>Settlement amount *</Label>
                    <NumberInput currency={settlementCurrency} value={settlementAmount} onChange={(e) => setSettlementAmount((e.target as HTMLInputElement).value)} className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} className="h-11" />
                  </div>
                </div>

                {paymentDestination === "settles_linked_buy" && (openBuysQ.data ?? []).length > 0 && (
                  <div className="space-y-2 rounded-md bg-muted/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Attach to an existing open buy (optional)</div>
                    <Select value={linkedBuyId} onValueChange={setLinkedBuyId}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Leave empty to auto-create" /></SelectTrigger>
                      <SelectContent>
                        {(openBuysQ.data ?? []).map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.doc_no || b.id.slice(0, 8)} — {fmt(b.bought_amount, b.bought_currency)} @ {b.buy_rate}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
                  <div className="font-semibold text-primary">Linked Buy will be created automatically</div>
                  <div className="text-muted-foreground">
                    Supplier: <span className="text-foreground font-medium">{fxSupplierName || thirdPartyName || "third party"}</span> ·
                    Expected: <span className="text-foreground font-medium">{fmt(Number(fxPurchasedAmount) || Number(transferredAmount) || 0, transferCurrency)}</span> @
                    <span className="text-foreground font-medium"> {Number(fxPurchaseRate) || Number(refRate) || 0}</span> {settlementCurrency || payCurrency}/{transferCurrency}
                  </div>
                  <div className="text-muted-foreground">
                    Status: <span className="text-foreground font-medium">Waiting currency delivery</span>. When the supplier delivers,
                    open the remittance and click <span className="text-foreground font-medium">Receive Currency</span>.
                  </div>
                </div>

                {settlementSummary.absDiff > 0.001 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                    <div className="text-xs font-semibold">
                      {settlementSummary.diff > 0 ? "Excess" : "Shortfall"}: {fmt(settlementSummary.absDiff, settlementCurrency || payCurrency)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {([
                        { v: "our_account", label: "Keep in our account" },
                        { v: "another_supplier", label: "To another supplier" },
                        { v: "customer_balance", label: "Customer balance" },
                        { v: "commission", label: "Add to commission" },
                        { v: "pending", label: "Pending" },
                        { v: "none", label: "Ignore" },
                      ] as const).map((o) => (
                        <button key={o.v} type="button" onClick={() => setExcessAllocation(o.v)}
                          className={`h-9 rounded-md border text-[11px] transition ${excessAllocation === o.v ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                    {excessAllocation !== "none" && (
                      <Input value={excessNote} onChange={(e) => setExcessNote(e.target.value)} className="h-9" placeholder="Optional note" />
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commission */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold">6. Commission Method</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(["fixed", "percentage", "included", "free"] as CommissionMethod[]).map((m) => (
                <button key={m} type="button" onClick={() => setCommMethod(m)}
                  className={`h-11 rounded-md border text-sm font-medium transition ${commMethod === m ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}>
                  {m === "fixed" ? "Fixed" : m === "percentage" ? "Percentage" : m === "included" ? "Included in payment" : "Free"}
                </button>
              ))}
            </div>
            {commMethod === "fixed" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Fixed commission amount</Label>
                  <NumberInput currency={commFixedCurrency} value={commFixedAmount} onChange={(e) => setCommFixedAmount((e.target as HTMLInputElement).value)} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={commFixedCurrency} onValueChange={setCommFixedCurrency}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {commMethod === "percentage" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Percentage (%)</Label>
                  <NumberInput rate value={commPercent} onChange={(e) => setCommPercent((e.target as HTMLInputElement).value)} className="h-11" placeholder="e.g. 1" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* FX Purchase (Trading profit from rate spread) */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">7. FX Purchase (optional)</div>
              <Badge variant="outline" className="text-[10px]">rate spread → trading profit</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              If you used the customer's payment to buy the settlement currency from a supplier
              at a better rate, enter the supplier rate to auto-calculate trading profit.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Purchase rate ({payCurrency}/{transferCurrency})</Label>
                <NumberInput rate value={fxPurchaseRate} onChange={(e) => setFxPurchaseRate((e.target as HTMLInputElement).value)} className="h-11" placeholder="e.g. 521,000" />
              </div>
              <div className="space-y-1.5">
                <Label>Purchased amount</Label>
                <NumberInput currency={transferCurrency} value={fxPurchasedAmount} onChange={(e) => setFxPurchasedAmount((e.target as HTMLInputElement).value)} className="h-11" placeholder={`Defaults to ${transferredAmount || "transfer amount"}`} />
              </div>
              <div className="space-y-1.5">
                <Label>Supplier (existing)</Label>
                <Select value={fxSupplierId} onValueChange={(v) => { setFxSupplierId(v); if (v) setFxSupplierName(""); }}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="— optional —" /></SelectTrigger>
                  <SelectContent>
                    {(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>…or supplier name</Label>
                <Input value={fxSupplierName} onChange={(e) => { setFxSupplierName(e.target.value); if (e.target.value) setFxSupplierId(""); }} className="h-11" placeholder="Free text" />
              </div>
            </div>

            {fxCalc.hasFx && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Customer rate</span><span className="font-mono">{fxCalc.customerRate.toLocaleString()} {payCurrency}/{transferCurrency}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier rate</span><span className="font-mono">{fxCalc.supplierRate.toLocaleString()} {payCurrency}/{transferCurrency}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Spread</span><span className={`font-mono ${fxCalc.spread < 0 ? "text-rose-400" : "text-emerald-400"}`}>{fxCalc.spread >= 0 ? "+" : ""}{fxCalc.spread.toLocaleString()}</span></div>
                <div className="flex justify-between pt-2 border-t"><span>Trading profit ({payCurrency})</span><span className={`font-semibold ${fxCalc.tradingPayCcy < 0 ? "text-rose-400" : "text-emerald-400"}`}>{fmtProfit(fxCalc.tradingPayCcy, payCurrency)}</span></div>
                <div className="flex justify-between"><span>Trading profit (AED)</span><span className={`font-semibold ${fxCalc.tradingAed < 0 ? "text-rose-400" : "text-emerald-400"}`}>≈ {fmtProfit(fxCalc.tradingAed, "AED")}</span></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-semibold">Live calculation</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Actual transfer</span><span className="font-medium">{fmt(Number(transferredAmount) || 0, transferCurrency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Customer paid</span><span className="font-medium">{fmt(Number(payAmount) || 0, payCurrency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Base value ({payCurrency})</span><span>{fmt(calc.baseValueInPayCcy, payCurrency)}</span></div>
              <div className="md:col-span-2 pt-2 border-t space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Trading profit ({payCurrency})</span><span className={fxCalc.tradingPayCcy < 0 ? "text-rose-400" : fxCalc.hasFx ? "text-emerald-400" : ""}>{fxCalc.hasFx ? fmtProfit(fxCalc.tradingPayCcy, payCurrency) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Trading profit (AED)</span><span className={fxCalc.tradingAed < 0 ? "text-rose-400" : fxCalc.hasFx ? "text-emerald-400" : ""}>{fxCalc.hasFx ? `≈ ${fmtProfit(fxCalc.tradingAed, "AED")}` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Commission profit ({payCurrency})</span><span className={calc.grossPayCcy < 0 ? "text-rose-400" : "text-emerald-400"}>{fmtProfit(calc.grossPayCcy, payCurrency)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Commission profit (AED)</span><span className={calc.grossAed < 0 ? "text-rose-400" : "text-emerald-400"}>≈ {fmtProfit(calc.grossAed, "AED")}</span></div>
              </div>
              <div className="flex justify-between md:col-span-2 pt-2 border-t"><span className="font-semibold">Total profit ({payCurrency})</span><span className={`text-base font-bold ${totalProfitPayCcy < 0 ? "text-rose-400" : "text-emerald-400"}`}>{fmtProfit(totalProfitPayCcy, payCurrency)}</span></div>
              <div className="flex justify-between md:col-span-2"><span className="font-semibold">TOTAL PROFIT (AED)</span><span className={`text-lg font-bold ${totalProfitAed < 0 ? "text-rose-400" : "text-emerald-400"}`}>≈ {fmtProfit(totalProfitAed, "AED")}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Notes / date */}
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Entry date</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button variant="outline" onClick={() => save.mutate({ close: false })} disabled={save.isPending} className="flex-1 h-12">
            Save as Draft
          </Button>
          <Button onClick={() => save.mutate({ close: true })} disabled={save.isPending} className="flex-1 h-12">
            Save & Close
          </Button>
        </div>
      </div>
    </div>
  );
}