import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberInput } from "@/components/number-input";
import { CURRENCIES, OWNERS, fmt } from "@/lib/exchange";
import { toast } from "sonner";
import { ArrowLeft, Package, MapPin, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accounts/new")({
  component: NewAccountPage,
  validateSearch: (s: Record<string, unknown>) => ({
    mode: (s.mode as "box" | "location" | "currency") || undefined,
    parent: (s.parent as string) || undefined,
    box: (s.box as string) || undefined,
  }),
});

/** User-facing type kinds → mapped to DB `account_type` values on save */
type Kind = "cash" | "bank" | "crypto" | "person" | "other";

const KINDS: { key: Kind; label: string; hint: string; icon: string }[] = [
  { key: "cash",   label: "Cash Box",       hint: "Physical cash in any currency", icon: "💵" },
  { key: "bank",   label: "Bank Account",   hint: "AED / IRR / GBP / USD / EUR",   icon: "🏦" },
  { key: "crypto", label: "Crypto Wallet",  hint: "USDT, BTC, ETH…",               icon: "🪙" },
  { key: "person", label: "Cash with Person", hint: "Cash physically with Ali / Milad / Customer / Other", icon: "🧑" },
  { key: "other",  label: "Other",          hint: "Anything else",                 icon: "•" },
];

const BANK_SUGGESTIONS = [
  "ENBD", "ADCB", "RAKBANK", "Emirates NBD", "Mashreq", "FAB",
  "Barclays", "HSBC", "Lloyds", "NatWest",
  "Mellat", "Melli", "Tejarat", "Saderat", "Pasargad", "Parsian",
  "Wise", "Revolut",
];

const CHAINS = ["TRC20", "ERC20", "BEP20", "Bitcoin", "Solana", "Polygon", "Arbitrum", "Other"];

function mapDbType(kind: Kind, currency: string): string {
  if (kind === "cash") return "cash";
  if (kind === "crypto") return "wallet";
  if (kind === "person") return "person_holding";
  if (kind === "other") return "other";
  // bank
  if (currency === "IRR") return "toman_bank";
  if (currency === "AED") return "aed_bank";
  return "foreign_currency";
}

function NewAccountPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();

  const [nodeType, setNodeType] = useState<"box" | "location" | "currency">(
    search.mode === "box" ? "box" : search.mode === "location" ? "location" : "currency",
  );
  const [parentId, setParentId] = useState<string>(search.parent ?? "");

  // Inline "quick create" for Box / Location so users are never stuck on an empty parent picker.
  const [quickOpen, setQuickOpen] = useState<null | "box" | "location">(null);
  const [quickName, setQuickName] = useState("");
  const [quickParentBox, setQuickParentBox] = useState<string>("");

  // Load existing boxes/locations for parent picker
  const treeQ = useQuery({
    queryKey: ["accounts_picker_tree"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, node_type, parent_id")
        .is("deleted_at", null)
        .eq("is_active", true)
        .in("node_type", ["box", "location"])
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; node_type: string; parent_id: string | null }[];
    },
  });

  const boxes = useMemo(() => (treeQ.data ?? []).filter((n) => n.node_type === "box"), [treeQ.data]);
  const locations = useMemo(() => (treeQ.data ?? []).filter((n) => n.node_type === "location"), [treeQ.data]);

  const [kind, setKind] = useState<Kind>("cash");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [owner, setOwner] = useState<string>("shared");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [notes, setNotes] = useState("");

  // Bank fields
  const [bankName, setBankName] = useState("");
  const [holderName, setHolderName] = useState("");
  const [iban, setIban] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [swift, setSwift] = useState("");

  // Crypto
  const [chain, setChain] = useState("TRC20");
  const [walletAddress, setWalletAddress] = useState("");

  // Person
  const [person, setPerson] = useState("ali");
  const [personName, setPersonName] = useState(""); // e.g. customer name for "customer"/"other"

  const parentBoxForLocation = useMemo(() => {
    if (nodeType !== "currency") return "";
    if (!parentId) return "";
    const loc = locations.find((l) => l.id === parentId);
    return loc?.parent_id ?? "";
  }, [nodeType, parentId, locations]);

  const personLabel = useMemo(() => {
    if (person === "ali") return "Ali";
    if (person === "milad") return "Milad";
    if (person === "customer") return `Customer${personName ? ` - ${personName}` : ""}`;
    return `Other${personName ? ` - ${personName}` : ""}`;
  }, [person, personName]);

  const nameSuggestion = useMemo(() => {
    switch (kind) {
      case "cash": return "e.g. Main Cash AED, Office Cash, Petty Cash";
      case "bank": return `e.g. ${bankName || "ENBD"} ${currency} Account`;
      case "crypto": return `e.g. USDT ${chain}`;
      case "person": return `Cash with ${personLabel} (${currency})`;
      default: return "Account name";
    }
  }, [kind, bankName, currency, chain, personLabel]);

  // Auto-fill / keep in sync the "Cash with Person" name until the user edits it manually.
  const [nameTouched, setNameTouched] = useState(false);
  const autoName = kind === "person" ? `Cash with ${personLabel} (${currency})` : "";
  const effectiveName = kind === "person" && !nameTouched && !name ? autoName : name;

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();

      // BOX ------------------------------------------------------------
      if (nodeType === "box") {
        const finalName = name.trim();
        if (!finalName) throw new Error("Box name is required (e.g. Milad Box)");
        const { error } = await supabase.from("accounts").insert({
          name: finalName,
          node_type: "box" as any,
          account_type: "other" as any,
          currency: null,
          owner: (owner as any) || "shared",
          opening_balance: 0,
          notes: notes || null,
          created_by: u.user?.id,
        } as any);
        if (error) throw error;
        return;
      }

      // LOCATION -------------------------------------------------------
      if (nodeType === "location") {
        const finalName = name.trim();
        if (!finalName) throw new Error("Location name is required (e.g. Cash, ENBD, Wio)");
        if (!parentId) throw new Error("Pick which Box this location belongs to");
        const { error } = await supabase.from("accounts").insert({
          name: finalName,
          node_type: "location" as any,
          parent_id: parentId,
          account_type: kind === "bank" ? "aed_bank" : "other" as any,
          currency: null,
          owner: (owner as any) || "shared",
          opening_balance: 0,
          bank_name: bankName || null,
          holder_name: holderName || null,
          notes: notes || null,
          created_by: u.user?.id,
        } as any);
        if (error) throw error;
        return;
      }

      // CURRENCY ACCOUNT (leaf) ---------------------------------------
      const finalName = (kind === "person" && !name.trim()) ? autoName : name.trim();
      if (!finalName) throw new Error("Account name is required");
      if (!parentId) throw new Error("Pick which Location this currency account belongs to");
      if (kind === "bank" && !bankName.trim()) throw new Error("Bank name is required");
      if (kind === "crypto" && !walletAddress.trim()) throw new Error("Wallet address is required");

      const account_type = mapDbType(kind, currency);
      const finalOwner = kind === "person" ? person : owner;

      const payload: any = {
        name: finalName,
        node_type: "currency_account",
        parent_id: parentId,
        account_type,
        currency,
        owner: finalOwner as any,
        opening_balance: Number(openingBalance) || 0,
        notes: notes || null,
        created_by: u.user?.id,
      };

      if (kind === "bank") {
        Object.assign(payload, {
          bank_name: bankName || null,
          holder_name: holderName || null,
          iban: iban || null,
          account_number: accountNumber || null,
          card_number: cardNumber || null,
        });
        if (swift) payload.notes = [notes, `SWIFT: ${swift}`].filter(Boolean).join("\n");
      } else if (kind === "crypto") {
        Object.assign(payload, {
          bank_name: chain,           // reuse column for blockchain
          account_number: walletAddress,
        });
      } else if (kind === "person") {
        Object.assign(payload, {
          holder_name: personName || personLabel,
          holder_type: person, // 'ali' | 'milad' | 'customer' | 'other'
        });
      }

      const { error } = await supabase.from("accounts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        nodeType === "box" ? "Box created" :
        nodeType === "location" ? "Location created" : "Account created",
      );
      qc.invalidateQueries();
      nav({ to: "/accounts" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div
      className="min-h-[100dvh] w-full bg-background"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 160px)" }}
    >
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="icon" className="h-10 w-10">
            <Link to="/accounts" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">
              {nodeType === "box" ? "New Box" : nodeType === "location" ? "New Location" : "New Currency Account"}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Box → Location → Currency. Balances roll up automatically.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4 space-y-5">
        {/* What are you creating? */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">What are you creating?</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "box" as const, icon: <Package className="h-4 w-4" />, label: "Box", hint: "Milad Box, Ali Box…" },
              { k: "location" as const, icon: <MapPin className="h-4 w-4" />, label: "Location", hint: "Cash, ENBD, Safe…" },
              { k: "currency" as const, icon: <Wallet className="h-4 w-4" />, label: "Currency", hint: "AED, USD, IRR…" },
            ].map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setNodeType(o.k)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition",
                  nodeType === o.k ? "border-primary ring-2 ring-primary/30" : "hover:bg-accent",
                )}
              >
                <div className="flex items-center gap-1.5">{o.icon}<span className="text-sm font-medium">{o.label}</span></div>
                <div className="text-[10px] text-muted-foreground">{o.hint}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Parent picker */}
        {nodeType === "location" && (
          <F label="Parent Box *">
            {boxes.length ? (
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="h-11 text-base"><SelectValue placeholder="Pick a Box" /></SelectTrigger>
                <SelectContent>
                  {boxes.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-2">
                <p className="text-sm text-muted-foreground">No boxes yet. Create one now:</p>
                <div className="flex gap-2">
                  <Input
                    value={quickOpen === "box" ? quickName : ""}
                    onChange={(e) => { setQuickOpen("box"); setQuickName(e.target.value); }}
                    placeholder="e.g. Milad Box, Ali Box, Company Box"
                    className="h-10 text-base"
                  />
                  <Button type="button" onClick={() => quickCreate.mutate("box")} disabled={quickCreate.isPending || !(quickOpen === "box" && quickName.trim())}>
                    Create Box
                  </Button>
                </div>
              </div>
            )}
          </F>
        )}
        {nodeType === "currency" && (
          <F label="Parent Location *">
            {locations.length ? (
              <>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger className="h-11 text-base"><SelectValue placeholder="Pick a location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => {
                      const box = boxes.find((b) => b.id === l.parent_id);
                      return <SelectItem key={l.id} value={l.id}>{box ? `${box.name} → ${l.name}` : l.name}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                {parentBoxForLocation && <p className="text-[11px] text-muted-foreground">Rolls up into <b>{boxes.find(b => b.id === parentBoxForLocation)?.name}</b></p>}
              </>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  {boxes.length ? "No locations yet. Create one now:" : "You need a Box first, then a Location."}
                </p>
                {boxes.length === 0 && (
                  <div className="flex gap-2">
                    <Input
                      value={quickOpen === "box" ? quickName : ""}
                      onChange={(e) => { setQuickOpen("box"); setQuickName(e.target.value); }}
                      placeholder="Box name — e.g. Milad Box"
                      className="h-10 text-base"
                    />
                    <Button type="button" onClick={() => quickCreate.mutate("box")} disabled={quickCreate.isPending || !(quickOpen === "box" && quickName.trim())}>
                      Create Box
                    </Button>
                  </div>
                )}
                {boxes.length > 0 && (
                  <div className="space-y-2">
                    <Select value={quickParentBox} onValueChange={setQuickParentBox}>
                      <SelectTrigger className="h-10 text-base"><SelectValue placeholder="Pick which Box this Location belongs to" /></SelectTrigger>
                      <SelectContent>
                        {boxes.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        value={quickOpen === "location" ? quickName : ""}
                        onChange={(e) => { setQuickOpen("location"); setQuickName(e.target.value); }}
                        placeholder="Location name — e.g. Cash, ENBD, Safe"
                        className="h-10 text-base"
                      />
                      <Button type="button" onClick={() => quickCreate.mutate("location")} disabled={quickCreate.isPending || !quickParentBox || !(quickOpen === "location" && quickName.trim())}>
                        Create Location
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </F>
        )}

        {/* BOX form */}
        {nodeType === "box" && (
          <section className="space-y-3">
            <F label="Box name *">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base" placeholder="e.g. Milad Box, Ali Box, Company Box" required />
            </F>
            <F label="Owner">
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>{OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="text-base" placeholder="Optional" /></F>
          </section>
        )}

        {/* LOCATION form */}
        {nodeType === "location" && (
          <section className="space-y-3">
            <F label="Location name *">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-base" placeholder="e.g. Cash, ENBD, Wio, Safe, Office Drawer" required />
            </F>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Kind">
                <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                  <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="crypto">Crypto Wallet</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              <F label="Owner">
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>{OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            </div>
            {kind === "bank" && (
              <div className="grid gap-3 sm:grid-cols-2 rounded-lg border bg-card p-3">
                <F label="Bank name">
                  <Input list="acc-bank-suggestions" value={bankName} onChange={(e) => setBankName(e.target.value)} className="h-11 text-base" placeholder="ENBD, Mashreq…" />
                  <datalist id="acc-bank-suggestions">{BANK_SUGGESTIONS.map((b) => <option key={b} value={b} />)}</datalist>
                </F>
                <F label="Account holder"><Input value={holderName} onChange={(e) => setHolderName(e.target.value)} className="h-11 text-base" /></F>
              </div>
            )}
            <F label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="text-base" placeholder="Optional" /></F>
            <p className="text-[11px] text-muted-foreground">Locations don't hold balance themselves — add one or more currencies inside.</p>
          </section>
        )}

        {/* CURRENCY ACCOUNT (leaf) form */}
        {nodeType === "currency" && (<>
        {/* Type picker */}
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Account type</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition",
                  kind === k.key ? "border-primary ring-2 ring-primary/30" : "hover:bg-accent",
                )}
              >
                <div className="text-lg leading-none">{k.icon}</div>
                <div className="text-sm font-medium">{k.label}</div>
                <div className="text-[11px] text-muted-foreground">{k.hint}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Common */}
        <section className="space-y-3">
          <F label={
            kind === "cash" ? "Account name *" :
            kind === "bank" ? "Account name *" :
            kind === "crypto" ? "Wallet name *" :
            kind === "person" ? "Label *" :
            "Name *"
          }>
            <Input
              value={effectiveName}
              onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
              placeholder={nameSuggestion}
              className="h-11 text-base"
              required
            />
            {kind === "person" && (
              <p className="text-[11px] text-muted-foreground">Auto-suggested — edit if you want a different label.</p>
            )}
          </F>

          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Currency *">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            {kind !== "person" ? (
              <F label="Owner *">
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>{OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            ) : (
              <F label="Person *">
                <Select value={person} onValueChange={setPerson}>
                  <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ali">Ali</SelectItem>
                    <SelectItem value="milad">Milad</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </F>
            )}
          </div>

          {kind === "person" && (person === "customer" || person === "other") && (
            <F label={person === "customer" ? "Customer name *" : "Person name *"}>
              <Input
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder={person === "customer" ? "e.g. Reza Mohammadi" : "e.g. Driver, Courier"}
                className="h-11 text-base"
              />
            </F>
          )}

          <F label="Opening balance">
            <NumberInput currency={currency} value={openingBalance} onChange={(e) => setOpeningBalance((e.target as HTMLInputElement).value)} placeholder="0" />
          </F>
        </section>

        {/* Bank-specific */}
        {kind === "bank" && (
          <section className="space-y-3 rounded-lg border bg-card p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Bank details</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Bank name *">
                <Input list="acc-bank-suggestions" value={bankName} onChange={(e) => setBankName(e.target.value)} className="h-11 text-base" placeholder="ENBD, Mellat, Barclays…" required />
                <datalist id="acc-bank-suggestions">{BANK_SUGGESTIONS.map((b) => <option key={b} value={b} />)}</datalist>
              </F>
              <F label="Account holder"><Input value={holderName} onChange={(e) => setHolderName(e.target.value)} className="h-11 text-base" /></F>
              <div className="sm:col-span-2"><F label="IBAN"><Input value={iban} onChange={(e) => setIban(e.target.value)} className="h-11 text-base font-mono" /></F></div>
              <F label="Account number"><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="h-11 text-base font-mono" /></F>
              <F label="Card number"><Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="h-11 text-base font-mono" /></F>
              <F label="SWIFT / BIC"><Input value={swift} onChange={(e) => setSwift(e.target.value)} className="h-11 text-base" /></F>
            </div>
          </section>
        )}

        {/* Crypto-specific */}
        {kind === "crypto" && (
          <section className="space-y-3 rounded-lg border bg-card p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Wallet details</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Blockchain *">
                <Select value={chain} onValueChange={setChain}>
                  <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>{CHAINS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <div className="sm:col-span-2"><F label="Wallet address *"><Input value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} className="h-11 text-base font-mono" placeholder="T… / 0x…" required /></F></div>
            </div>
          </section>
        )}

        {/* Notes */}
        <F label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="text-base" placeholder="Optional" /></F>

        {/* Live preview */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Preview</div>
            <div className="mt-1 text-xs text-muted-foreground">{KINDS.find((k) => k.key === kind)?.label}</div>
            <div className="text-lg font-semibold">{name || nameSuggestion}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <div><span className="text-muted-foreground">Currency:</span> <b>{currency}</b></div>
              <div><span className="text-muted-foreground">{kind === "person" ? "Person" : "Owner"}:</span> <b className="capitalize">{kind === "person" ? person : owner}</b></div>
              {kind === "bank" && bankName && <div className="col-span-2"><span className="text-muted-foreground">Bank:</span> <b>{bankName}</b></div>}
              {kind === "crypto" && <div className="col-span-2"><span className="text-muted-foreground">Chain:</span> <b>{chain}</b></div>}
              <div className="col-span-2"><span className="text-muted-foreground">Opening balance:</span> <b className="font-mono">{fmt(Number(openingBalance) || 0, currency)}</b></div>
            </div>
          </CardContent>
        </Card>
        </>)}
      </div>

      {/* Sticky action bar */}
      <div
        className="fixed inset-x-0 bottom-16 md:bottom-0 z-40 border-t bg-background/95 shadow-[0_-6px_20px_-10px_rgba(0,0,0,0.15)] backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)" }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2">
          <Button asChild variant="ghost" className="h-11 px-3 shrink-0"><Link to="/accounts">Cancel</Link></Button>
          <Button className="h-11 flex-1" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : nodeType === "box" ? "Create Box" : nodeType === "location" ? "Create Location" : "Save Account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}