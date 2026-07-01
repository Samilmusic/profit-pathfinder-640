import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAccounts, useCustomers } from "@/components/account-select";
import { CustomerBankAccountPicker, touchBankAccount } from "@/components/customer-bank-account-picker";
import { NumberInput } from "@/components/number-input";
import { CURRENCIES, fmt } from "@/lib/exchange";
import { toast } from "sonner";
import { ArrowLeft, Camera, Check, CheckCircle2, ChevronDown, ChevronsUpDown, Image as ImageIcon, Paperclip, Search, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/deposits/new")({
  component: NewDepositPage,
});

const LS_KEY = "deposit.lastPrefs.v1";

type Prefs = {
  depositBy?: string;
  currency?: string;
  deposit_account_id?: string;
  purpose?: string;
};

const DEPOSIT_BY = [
  { value: "milad", label: "Milad" },
  { value: "ali", label: "Ali" },
  { value: "customer", label: "Customer" },
  { value: "other", label: "Other" },
];

function loadPrefs(): Prefs {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
}

function NewDepositPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const prefs = useMemo(loadPrefs, []);
  const customers = useCustomers();
  const accounts = useAccounts();
  const today = new Date().toISOString().slice(0, 10);

  const [depositBy, setDepositBy] = useState<string>(prefs.depositBy || "customer");
  const [customerId, setCustomerId] = useState("");
  const [currency, setCurrency] = useState<string>(prefs.currency || "AED");
  const [amount, setAmount] = useState("");
  const [depositAccountId, setDepositAccountId] = useState<string>(prefs.deposit_account_id || "");
  const [notes, setNotes] = useState("");
  const [entryDate, setEntryDate] = useState(today);
  const [customerBankAccountId, setCustomerBankAccountId] = useState<string>("");

  // Advanced
  const [advOpen, setAdvOpen] = useState(false);
  const [senderBank, setSenderBank] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderAccount, setSenderAccount] = useState("");
  const [iban, setIban] = useState("");
  const [reference, setReference] = useState("");
  const [purpose, setPurpose] = useState(prefs.purpose || "");

  // Upload buffer (uploaded after save)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Success state
  const [success, setSuccess] = useState<null | { id: string; balance: number | null }>(null);

  // Auto-clear pending account if currency mismatch
  const selectedAccount = accounts.data?.find((a: any) => a.id === depositAccountId);
  useEffect(() => {
    if (selectedAccount && selectedAccount.currency !== currency) {
      setDepositAccountId("");
    }
  }, [currency]); // eslint-disable-line

  // Wallet lookup for the customer + currency
  const walletQ = useQuery({
    queryKey: ["cust_wallet", customerId, currency],
    enabled: !!customerId && !!currency,
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id")
        .eq("holder_customer_id", customerId).eq("currency", currency)
        .eq("account_type", "customer_wallet").is("deleted_at", null).limit(1);
      return data?.[0]?.id ?? null;
    },
  });

  // Live balance for selected account
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
    if (f && f.type.startsWith("image/")) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  }

  const save = useMutation({
    mutationFn: async (opts: { asDraft: boolean }) => {
      if (!customerId) throw new Error("Pick a customer");
      if (!depositAccountId) throw new Error("Pick a deposit account");
      if (!amount || Number(amount) <= 0) throw new Error("Enter an amount");
      if (!walletQ.data) throw new Error("Customer wallet not found for that currency");

      const notesParts: string[] = [];
      notesParts.push(`By: ${DEPOSIT_BY.find((d) => d.value === depositBy)?.label || depositBy}`);
      if (notes.trim()) notesParts.push(notes.trim());
      if (purpose) notesParts.push(`Purpose: ${purpose}`);
      if (reference) notesParts.push(`Ref: ${reference}`);
      if (senderName) notesParts.push(`Sender: ${senderName}`);
      if (senderBank) notesParts.push(`Bank: ${senderBank}`);
      if (senderAccount) notesParts.push(`Acct: ${senderAccount}`);
      if (iban) notesParts.push(`IBAN: ${iban}`);

      const { data: u } = await supabase.auth.getUser();
      const insert: any = {
        entry_date: entryDate,
        customer_id: customerId,
        currency,
        amount: Number(amount),
        deposit_account_id: depositAccountId,
        wallet_account_id: walletQ.data,
        notes: notesParts.join(" · ") || null,
        created_by: u.user?.id,
      };
      const { data: dep, error } = await supabase.from("customer_deposits").insert(insert).select("id").single();
      if (error) throw error;
      await touchBankAccount(customerBankAccountId);

      // Upload receipt if present
      if (pendingFile) {
        const ext = pendingFile.name.split(".").pop() ?? "bin";
        const path = `deposit/${dep.id}/${crypto.randomUUID()}.${ext}`;
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
            ref_type: "deposit",
            ref_id: dep.id,
            uploaded_by: u.user?.id,
          });
        }
      }

      // If not draft, try to complete (requires receipt + note)
      if (!opts.asDraft && pendingFile) {
        await supabase.from("customer_deposits").update({
          settlement_status: "completed",
          completion_note: notes.trim() || `Confirmed by ${DEPOSIT_BY.find((d) => d.value === depositBy)?.label}`,
        }).eq("id", dep.id);
      }

      return dep.id;
    },
    onSuccess: async (id) => {
      savePrefs({ depositBy, currency, deposit_account_id: depositAccountId, purpose });
      qc.invalidateQueries();
      // Fetch fresh balance
      const { data } = await supabase.from("account_balances")
        .select("current_balance").eq("account_id", depositAccountId).maybeSingle();
      setSuccess({ id, balance: data?.current_balance ?? null });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (success) {
    return (
      <SuccessView
        id={success.id}
        balance={success.balance}
        currency={currency}
        onNew={() => {
          setSuccess(null);
          setAmount("");
          setNotes("");
          setPendingFile(null);
          setPreview(null);
          setReference("");
          setSenderName(""); setSenderBank(""); setSenderAccount(""); setIban("");
        }}
        onDashboard={() => nav({ to: "/dashboard" })}
        onView={() => nav({ to: "/deposits" })}
      />
    );
  }

  const quickShortcuts = useMemo(() => {
    const list = accounts.data ?? [];
    const names = ["Cash Box", "ENBD AED", "Toman Bank", "Held by Ali", "Held by Milad"];
    return names.map((n) => {
      const acc = list.find((a: any) => a.name?.toLowerCase().includes(n.toLowerCase()));
      return { label: n, acc };
    }).filter((x) => x.acc);
  }, [accounts.data]);

  return (
    <div
      className="min-h-[100dvh] w-full bg-background"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
    >
      {/* Header */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Link to="/deposits">
            <Button variant="ghost" size="icon" className="h-10 w-10"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">New Deposit</h1>
            <p className="truncate text-xs text-muted-foreground">Credits the customer wallet on completion</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        {/* Deposit By */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Deposit by</Label>
          <div className="grid grid-cols-4 gap-2">
            {DEPOSIT_BY.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDepositBy(d.value)}
                className={cn(
                  "h-11 rounded-lg border text-sm font-medium transition",
                  depositBy === d.value
                    ? "border-primary bg-primary text-primary-foreground shadow"
                    : "bg-card hover:bg-accent",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </section>

        {/* Customer */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="h-11 text-base"><SelectValue placeholder="Select customer (whose wallet)" /></SelectTrigger>
            <SelectContent>
              {(customers.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <CustomerBankAccountPicker
            customerId={customerId || null}
            currency={currency}
            value={customerBankAccountId || null}
            label="Sender bank account (customer's saved banks)"
            onChange={(id, row) => {
              setCustomerBankAccountId(id ?? "");
              if (row) {
                setSenderBank(row.bank_name || "");
                setSenderName(row.holder_name || "");
                setSenderAccount(row.account_number || "");
                setIban(row.iban || row.card_number || "");
              }
            }}
          />
        </section>

        {/* Currency + Amount */}
        <section className="grid grid-cols-[110px_1fr] gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Amount</Label>
            <NumberInput currency={currency} value={amount} onChange={(e) => setAmount((e.target as HTMLInputElement).value)} placeholder="0" className="h-11 text-lg font-semibold" />
          </div>
        </section>

        {/* Quick shortcuts */}
        {quickShortcuts.length > 0 && (
          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Quick account</Label>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {quickShortcuts.map(({ label, acc }: any) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setDepositAccountId(acc.id);
                    if (acc.currency) setCurrency(acc.currency);
                  }}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    depositAccountId === acc.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:bg-accent",
                  )}
                >
                  + {label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Deposit account autocomplete */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Deposit account</Label>
          <AccountAutocomplete
            value={depositAccountId}
            onChange={setDepositAccountId}
            currency={currency}
            accounts={accounts.data ?? []}
          />
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
            <div
              className="grid grid-cols-3 gap-2"
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onPickFile(f);
              }}
            >
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
              <F label="Purpose"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Trade prep / Trust / Payout" className="h-11 text-base" /></F>
              <F label="Sender bank"><Input value={senderBank} onChange={(e) => setSenderBank(e.target.value)} className="h-11 text-base" /></F>
              <F label="Sender name"><Input value={senderName} onChange={(e) => setSenderName(e.target.value)} className="h-11 text-base" /></F>
              <F label="Sender account #"><Input value={senderAccount} onChange={(e) => setSenderAccount(e.target.value)} className="h-11 text-base" /></F>
              <F label="IBAN"><Input value={iban} onChange={(e) => setIban(e.target.value)} className="h-11 text-base" /></F>
              <div className="sm:col-span-2">
                <F label="Reference number"><Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-11 text-base" /></F>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Sticky bottom action bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Link to="/deposits" className="shrink-0">
            <Button variant="ghost" className="h-12">Cancel</Button>
          </Link>
          <Button
            variant="outline"
            className="h-12 flex-1"
            disabled={save.isPending}
            onClick={() => save.mutate({ asDraft: true })}
          >
            Save draft
          </Button>
          <Button
            className="h-12 flex-1"
            disabled={save.isPending}
            onClick={() => save.mutate({ asDraft: false })}
          >
            {save.isPending ? "Saving…" : "Save deposit"}
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

function AccountAutocomplete({
  value, onChange, currency, accounts,
}: {
  value: string;
  onChange: (id: string) => void;
  currency: string;
  accounts: any[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = accounts.find((a) => a.id === value);

  const filtered = useMemo(() => {
    let list = accounts.filter((a) => a.account_type !== "customer_wallet");
    // prefer matching currency but don't exclude — user may want to see
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        a.name?.toLowerCase().includes(q) ||
        a.currency?.toLowerCase().includes(q) ||
        String(a.owner || "").toLowerCase().includes(q) ||
        String(a.account_type || "").toLowerCase().includes(q),
      );
    }
    // sort: currency match first
    list.sort((a, b) => {
      const am = a.currency === currency ? -1 : 0;
      const bm = b.currency === currency ? -1 : 0;
      return am - bm;
    });
    return list.slice(0, 30);
  }, [accounts, query, currency]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 w-full items-center justify-between rounded-md border bg-background px-3 text-left text-base shadow-sm"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.name} · ${selected.currency}` : "Search account (ENBD, Cash, Ali…)"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-2">
            <Search className="mr-1 h-4 w-4 opacity-50" />
            <CommandInput
              placeholder="Type account name…"
              value={query}
              onValueChange={setQuery}
              className="h-11 border-0 text-base focus:ring-0"
            />
          </div>
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.id}
                  onSelect={() => { onChange(a.id); setOpen(false); setQuery(""); }}
                  className="flex items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {a.currency} · {String(a.owner || "shared")} · {String(a.account_type)}
                    </div>
                  </div>
                  {value === a.id && <Check className="h-4 w-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SuccessView({
  id, balance, currency, onNew, onDashboard, onView,
}: {
  id: string; balance: number | null; currency: string;
  onNew: () => void; onDashboard: () => void; onView: () => void;
}) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-16 text-center animate-fade-in">
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
          <div className="relative grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white shadow-xl animate-scale-in">
            <CheckCircle2 className="h-10 w-10" />
          </div>
        </div>
        <h1 className="text-2xl font-bold">Deposit saved successfully</h1>
        <p className="mt-1 text-sm text-muted-foreground">Transaction #{id.slice(0, 8).toUpperCase()}</p>
        {balance !== null && (
          <Card className="mt-6 w-full">
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Updated account balance</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums">{fmt(balance, currency)}</div>
            </CardContent>
          </Card>
        )}
        <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <Button onClick={onNew} className="h-12">New deposit</Button>
          <Button onClick={onView} variant="outline" className="h-12">View transaction</Button>
          <Button onClick={onDashboard} variant="ghost" className="h-12">Dashboard</Button>
        </div>
      </div>
    </div>
  );
}