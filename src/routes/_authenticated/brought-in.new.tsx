import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAccounts } from "@/components/account-select";
import { NumberInput } from "@/components/number-input";
import { CURRENCIES, fmt } from "@/lib/exchange";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, ChevronDown, Image as ImageIcon, Paperclip, Upload, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/brought-in/new")({
  component: NewBroughtInPage,
});

const LS_KEY = "broughtIn.lastPrefs.v1";

const BROUGHT_BY = [
  { value: "milad", label: "Milad" },
  { value: "ali", label: "Ali" },
  { value: "customer", label: "Customer" },
  { value: "other", label: "Other" },
];

/** Destination-type chips → filter for the accounts list */
type DestFilter = (a: any, currency: string) => boolean;
const DEST_TYPES: { key: string; label: string; match: DestFilter }[] = [
  { key: "cash",           label: "Cash Box",         match: (a) => a.account_type === "cash" },
  { key: "aed_bank",       label: "AED Bank",         match: (a) => a.account_type === "aed_bank" },
  { key: "toman_bank",     label: "IRR / Toman Bank", match: (a) => a.account_type === "toman_bank" },
  { key: "foreign_bank",   label: "Foreign Bank",     match: (a) => a.account_type === "foreign_currency" },
  { key: "held_milad",     label: "Held by Milad",    match: (a) => a.account_type === "person_holding" && a.owner === "milad" },
  { key: "held_ali",       label: "Held by Ali",      match: (a) => a.account_type === "person_holding" && a.owner === "ali" },
  { key: "held_customer",  label: "Held by Customer", match: (a) => a.account_type === "person_holding" && !["milad","ali"].includes(String(a.owner)) },
  { key: "pending",        label: "Pending Delivery", match: (a) => a.account_type === "pending_delivery" },
  { key: "other",          label: "Other",            match: (a) => a.account_type === "other" || a.account_type === "wallet" },
  { key: "all",            label: "All accounts",     match: () => true },
];

const REASONS = [
  { value: "capital", label: "Capital" },
  { value: "for_exchange", label: "For exchange" },
  { value: "customer_payment", label: "Customer payment" },
  { value: "temporary_deposit", label: "Temporary deposit" },
  { value: "other", label: "Other" },
];

type Prefs = { broughtBy?: string; currency?: string; deposit_account_id?: string; reason?: string };
function loadPrefs(): Prefs { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } }
function savePrefs(p: Prefs) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {} }

function NewBroughtInPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const prefs = useMemo(loadPrefs, []);
  const accounts = useAccounts();
  const today = new Date().toISOString().slice(0, 10);

  const [broughtBy, setBroughtBy] = useState<string>(prefs.broughtBy || "milad");
  const [sourceName, setSourceName] = useState("");
  const [reason, setReason] = useState<string>(prefs.reason || "for_exchange");
  const [currency, setCurrency] = useState<string>(prefs.currency || "AED");
  const [amount, setAmount] = useState("");
  const [depositAccountId, setDepositAccountId] = useState<string>(prefs.deposit_account_id || "");
  const [destType, setDestType] = useState<string>("all");
  const [notes, setNotes] = useState("");
  const [entryDate, setEntryDate] = useState(today);

  const [advOpen, setAdvOpen] = useState(false);
  const [senderBank, setSenderBank] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderAccount, setSenderAccount] = useState("");

  // Conversion
  const [convertEnabled, setConvertEnabled] = useState(false);
  const [conversionRate, setConversionRate] = useState("");
  const [convertedCurrency, setConvertedCurrency] = useState("AED");
  const [convertedAmount, setConvertedAmount] = useState("");
  const [convertedAmountManual, setConvertedAmountManual] = useState(false);
  const [finalAccountId, setFinalAccountId] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeKind, setFeeKind] = useState("fee");

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [success, setSuccess] = useState<null | { id: string; balance: number | null }>(null);

  const filteredAccounts = useMemo(() => {
    const base = (accounts.data ?? []).filter((a: any) => a.currency === currency && a.account_type !== "customer_wallet");
    const dt = DEST_TYPES.find((d) => d.key === destType);
    return dt ? base.filter((a: any) => dt.match(a, currency)) : base;
  }, [accounts.data, currency, destType]);
  const finalAccounts = useMemo(
    () => (accounts.data ?? []).filter((a: any) => a.currency === convertedCurrency && a.account_type !== "customer_wallet"),
    [accounts.data, convertedCurrency],
  );

  // Auto-calc converted amount unless user overrode it
  useMemo(() => {
    if (!convertEnabled || convertedAmountManual) return;
    const amt = Number(amount); const rate = Number(conversionRate);
    if (amt > 0 && rate > 0) {
      // rate expressed as: 1 converted = rate original  => converted = amt / rate
      // But user example: 150,000,000 IRR / 46,600 = 3,218.8841 AED. So converted = amount / rate.
      const v = amt / rate;
      setConvertedAmount(v.toFixed(convertedCurrency === "IRR" ? 0 : 4));
    }
  }, [amount, conversionRate, convertEnabled, convertedAmountManual, convertedCurrency]);

  const balQ = useQuery({
    queryKey: ["account_balance", depositAccountId],
    enabled: !!depositAccountId,
    queryFn: async () => {
      const { data } = await supabase.from("account_balances").select("current_balance,currency,owner,account_type,name").eq("account_id", depositAccountId).maybeSingle();
      return data;
    },
  });

  function onPickFile(f: File | null) {
    setPendingFile(f);
    if (preview) URL.revokeObjectURL(preview);
    if (f && f.type.startsWith("image/")) setPreview(URL.createObjectURL(f)); else setPreview(null);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!depositAccountId) throw new Error("Pick a deposit account");
      if (!amount || Number(amount) <= 0) throw new Error("Enter an amount");
      if (convertEnabled) {
        if (!conversionRate || Number(conversionRate) <= 0) throw new Error("Enter a conversion rate");
        if (!convertedAmount || Number(convertedAmount) <= 0) throw new Error("Enter the converted amount");
        if (!finalAccountId) throw new Error("Pick a final deposit account");
      }
      const { data: u } = await supabase.auth.getUser();
      const { data: row, error } = await supabase.from("brought_in_money").insert({
        entry_date: entryDate,
        brought_by: broughtBy as any,
        source_name: sourceName || null,
        currency,
        amount: Number(amount),
        deposit_account_id: depositAccountId,
        sender_bank_name: senderBank || null,
        sender_account_name: senderName || null,
        sender_account_number: senderAccount || null,
        reason: reason as any,
        notes: notes || null,
        created_by: u.user?.id,
        convert_enabled: convertEnabled,
        conversion_rate: convertEnabled ? Number(conversionRate) : null,
        converted_currency: convertEnabled ? convertedCurrency : null,
        converted_amount: convertEnabled ? Number(convertedAmount) : null,
        final_deposit_account_id: convertEnabled ? finalAccountId : null,
        conversion_fee_amount: convertEnabled && feeAmount ? Number(feeAmount) : null,
        conversion_fee_currency: convertEnabled && feeAmount ? convertedCurrency : null,
        conversion_fee_kind: convertEnabled && feeAmount ? feeKind : null,
      }).select("id").single();
      if (error) throw error;

      if (pendingFile) {
        const ext = pendingFile.name.split(".").pop() ?? "bin";
        const path = `brought_in/${row.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("documents").upload(path, pendingFile, {
          contentType: pendingFile.type || "application/octet-stream",
        });
        if (!up.error) {
          await supabase.from("documents").insert({
            doc_type: "deposit_receipt",
            storage_path: path,
            file_name: pendingFile.name,
            mime_type: pendingFile.type || null,
            size_bytes: pendingFile.size,
            ref_type: "brought_in",
            ref_id: row.id,
            uploaded_by: u.user?.id,
          });
        }
      }
      return row.id;
    },
    onSuccess: async (id) => {
      savePrefs({ broughtBy, currency, deposit_account_id: depositAccountId, reason });
      qc.invalidateQueries();
      const balAcct = convertEnabled && finalAccountId ? finalAccountId : depositAccountId;
      const { data } = await supabase.from("account_balances").select("current_balance").eq("account_id", balAcct).maybeSingle();
      setSuccess({ id, balance: data?.current_balance ?? null });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (success) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-16 text-center animate-fade-in">
          <div className="relative mb-6">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
            <div className="relative grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white shadow-xl animate-scale-in">
              <CheckCircle2 className="h-10 w-10" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Brought-in saved</h1>
          <p className="mt-1 text-sm text-muted-foreground">Transaction #{success.id.slice(0, 8).toUpperCase()}</p>
          {success.balance !== null && (
            <Card className="mt-6 w-full">
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Updated account balance</div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums">{fmt(success.balance, convertEnabled ? convertedCurrency : currency)}</div>
              </CardContent>
            </Card>
          )}
          <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              onClick={() => {
                setSuccess(null); setAmount(""); setSourceName(""); setNotes("");
                setPendingFile(null); setPreview(null); setSenderBank(""); setSenderName(""); setSenderAccount("");
              }}
              className="h-12"
            >New brought-in</Button>
            <Button onClick={() => nav({ to: "/brought-in" })} variant="outline" className="h-12">View transactions</Button>
            <Button onClick={() => nav({ to: "/dashboard" })} variant="ghost" className="h-12">Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] w-full bg-background"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 180px)" }}
    >
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Link to="/brought-in">
            <Button variant="ghost" size="icon" className="h-10 w-10"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">New Brought-In</h1>
            <p className="truncate text-xs text-muted-foreground">Money brought in by Milad, Ali, customer or other</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        {/* Brought by */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Brought by</Label>
          <div className="grid grid-cols-4 gap-2">
            {BROUGHT_BY.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setBroughtBy(d.value)}
                className={cn(
                  "h-11 rounded-lg border text-sm font-medium transition",
                  broughtBy === d.value ? "border-primary bg-primary text-primary-foreground shadow" : "bg-card hover:bg-accent",
                )}
              >{d.label}</button>
            ))}
          </div>
        </section>

        {/* Source name */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Source person name</Label>
          <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Optional" className="h-11 text-base" />
        </section>

        {/* Reason */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reason</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>{REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </section>

        {/* Currency + Amount */}
        <section className="grid grid-cols-[110px_1fr] gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Currency</Label>
            <Select value={currency} onValueChange={(v) => { setCurrency(v); setDepositAccountId(""); }}>
              <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Amount</Label>
            <NumberInput currency={currency} value={amount} onChange={(e) => setAmount((e.target as HTMLInputElement).value)} placeholder="0" className="h-11 text-lg font-semibold" />
          </div>
        </section>

        {/* Deposit account */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Deposit account</Label>
          <Select value={depositAccountId} onValueChange={setDepositAccountId}>
            <SelectTrigger className="h-11 text-base"><SelectValue placeholder={`Pick a ${currency} account`} /></SelectTrigger>
            <SelectContent>
              {filteredAccounts.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.name} · {a.currency}</SelectItem>
              ))}
              {filteredAccounts.length === 0 && <div className="px-2 py-4 text-xs text-muted-foreground text-center">No matching accounts</div>}
            </SelectContent>
          </Select>
          {balQ.data && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{balQ.data.name}</div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {String(balQ.data.owner || "shared")} · {String(balQ.data.account_type)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Balance</div>
                  <div className="font-mono text-sm font-bold tabular-nums">{fmt(balQ.data.current_balance, balQ.data.currency || undefined)}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Conversion toggle */}
        <section className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Convert this brought-in money?</div>
              <div className="text-xs text-muted-foreground">e.g. IRR received then converted to AED</div>
            </div>
            <Switch checked={convertEnabled} onCheckedChange={setConvertEnabled} />
          </div>

          {convertEnabled && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <F label={`Rate (${currency} per 1 ${convertedCurrency})`}>
                  <NumberInput value={conversionRate} onChange={(e) => setConversionRate((e.target as HTMLInputElement).value)} placeholder="e.g. 46600" />
                </F>
                <F label="Converted currency">
                  <Select value={convertedCurrency} onValueChange={(v) => { setConvertedCurrency(v); setFinalAccountId(""); }}>
                    <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.filter((c) => c !== currency).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </F>
              </div>
              <F label="Converted amount">
                <NumberInput
                  currency={convertedCurrency}
                  value={convertedAmount}
                  onChange={(e) => { setConvertedAmountManual(true); setConvertedAmount((e.target as HTMLInputElement).value); }}
                  placeholder="Auto"
                  className="h-11 text-lg font-semibold"
                />
              </F>
              <F label={`Final ${convertedCurrency} account`}>
                <Select value={finalAccountId} onValueChange={setFinalAccountId}>
                  <SelectTrigger className="h-11 text-base"><SelectValue placeholder={`Pick a ${convertedCurrency} account`} /></SelectTrigger>
                  <SelectContent>
                    {finalAccounts.map((a: any) => (<SelectItem key={a.id} value={a.id}>{a.name} · {a.currency}</SelectItem>))}
                    {finalAccounts.length === 0 && <div className="px-2 py-4 text-xs text-muted-foreground text-center">No {convertedCurrency} accounts</div>}
                  </SelectContent>
                </Select>
              </F>
              <div className="grid grid-cols-[1fr_140px] gap-2">
                <F label="Conversion fee (optional)">
                  <NumberInput currency={convertedCurrency} value={feeAmount} onChange={(e) => setFeeAmount((e.target as HTMLInputElement).value)} placeholder="0" />
                </F>
                <F label="Fee kind">
                  <Select value={feeKind} onValueChange={setFeeKind}>
                    <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["fee","petrol","bank_charge","delivery","other"].map((k) => <SelectItem key={k} value={k}>{k.replace("_"," ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </F>
              </div>

              {/* Live preview */}
              {amount && conversionRate && convertedAmount && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold">{fmt(Number(amount), currency)}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono font-semibold text-primary">{fmt(Number(convertedAmount), convertedCurrency)}</span>
                    {feeAmount && Number(feeAmount) > 0 && (
                      <span className="text-xs text-muted-foreground">· fee {fmt(Number(feeAmount), convertedCurrency)}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    From <b>{balQ.data?.name || "source"}</b> → into <b>{finalAccounts.find((a: any) => a.id === finalAccountId)?.name || `final ${convertedCurrency} account`}</b>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Not profit — capital changing form.</div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Notes */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional short note" className="text-base" />
        </section>

        {/* Receipt */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Receipt</Label>
          {preview ? (
            <div className="relative overflow-hidden rounded-lg border">
              <img src={preview} alt="receipt preview" className="max-h-64 w-full object-contain bg-secondary/30" />
              <button type="button" onClick={() => onPickFile(null)} className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : pendingFile ? (
            <div className="flex items-center justify-between rounded-lg border bg-secondary/30 p-3">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate">{pendingFile.name}</span>
              </div>
              <button type="button" onClick={() => onPickFile(null)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <UploadTile icon={<Camera className="h-5 w-5" />} label="Photo" onClick={() => cameraRef.current?.click()} />
              <UploadTile icon={<ImageIcon className="h-5 w-5" />} label="Gallery" onClick={() => fileRef.current?.click()} />
              <UploadTile icon={<Upload className="h-5 w-5" />} label="PDF / File" onClick={() => fileRef.current?.click()} />
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }} />
        </section>

        {/* Advanced */}
        <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm font-medium">
              <span>Advanced details</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", advOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Entry date"><Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="h-11 text-base" /></F>
              <F label="Sender bank"><Input value={senderBank} onChange={(e) => setSenderBank(e.target.value)} className="h-11 text-base" /></F>
              <F label="Sender account name"><Input value={senderName} onChange={(e) => setSenderName(e.target.value)} className="h-11 text-base" /></F>
              <F label="Sender account / card"><Input value={senderAccount} onChange={(e) => setSenderAccount(e.target.value)} className="h-11 text-base" /></F>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Sticky action bar */}
      <div
        className="fixed inset-x-0 bottom-16 md:bottom-0 z-40 border-t bg-background/95 shadow-[0_-6px_20px_-10px_rgba(0,0,0,0.15)] backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)" }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2">
          <Link to="/brought-in" className="shrink-0">
            <Button variant="ghost" className="h-11 px-3">Cancel</Button>
          </Link>
          <Button
            variant="outline"
            className="h-11 px-3"
            disabled={save.isPending}
            onClick={() => { toast.message("Draft saved locally"); savePrefs({ broughtBy, currency, deposit_account_id: depositAccountId, reason }); }}
          >
            Save Draft
          </Button>
          <Button
            className="h-11 flex-1"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Brought-In"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function UploadTile({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-card text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {icon}
      {label}
    </button>
  );
}