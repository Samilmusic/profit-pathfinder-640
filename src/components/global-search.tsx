import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/exchange";

export function GlobalSearchTrigger() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2 h-9">
        <Search className="h-4 w-4" /> <span className="hidden sm:inline">Search</span>
        <kbd className="hidden md:inline ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">/</kbd>
      </Button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function GlobalSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const customers = useQuery({
    queryKey: ["search_customers"], enabled: open,
    queryFn: async () => (await supabase.from("customers").select("id,name,phone,card_number,account_number,notes").is("deleted_at", null).limit(500)).data ?? [],
  });
  const bankAccounts = useQuery({
    queryKey: ["search_customer_bank_accounts"], enabled: open,
    queryFn: async () => (await supabase.from("customer_bank_accounts").select("id,customer_id,bank_name,iban,card_number,account_number,holder_name,currency,nickname").is("deleted_at", null).limit(1000)).data ?? [],
  });
  const accounts = useQuery({
    queryKey: ["search_accounts"], enabled: open,
    queryFn: async () => (await supabase.from("accounts").select("id,name,currency,iban,card_number,account_type").is("deleted_at", null).limit(500)).data ?? [],
  });
  const sells = useQuery({
    queryKey: ["search_sells"], enabled: open,
    queryFn: async () => (await supabase.from("sell_transactions").select("id,doc_no,entry_date,sold_amount,sold_currency,received_amount,received_currency,notes,customer_id").is("deleted_at", null).order("entry_date", { ascending: false }).limit(300)).data ?? [],
  });
  const buys = useQuery({
    queryKey: ["search_buys"], enabled: open,
    queryFn: async () => (await supabase.from("buy_transactions").select("id,doc_no,entry_date,bought_amount,bought_currency,paid_amount,paid_currency,notes").is("deleted_at", null).order("entry_date", { ascending: false }).limit(300)).data ?? [],
  });
  const broughtIn = useQuery({
    queryKey: ["search_brought_in"], enabled: open,
    queryFn: async () => (await supabase.from("brought_in_money").select("id,doc_no,entry_date,amount,currency,source_name,notes").is("deleted_at", null).order("entry_date", { ascending: false }).limit(300)).data ?? [],
  });
  const expenses = useQuery({
    queryKey: ["search_expenses"], enabled: open,
    queryFn: async () => (await supabase.from("expenses").select("id,doc_no,entry_date,amount,currency,category,notes").is("deleted_at", null).order("entry_date", { ascending: false }).limit(300)).data ?? [],
  });
  const payments = useQuery({
    queryKey: ["search_sell_payments"], enabled: open,
    queryFn: async () => (await supabase.from("sell_payments").select("id,sell_id,entry_date,amount,currency,reference,receipt_url").is("deleted_at", null).order("entry_date", { ascending: false }).limit(300)).data ?? [],
  });

  const s = q.trim().toLowerCase();
  const match = (v: any) => v && String(v).toLowerCase().includes(s);

  const goto = (to: string) => { onOpenChange(false); navigate({ to }); };
  const gotoWith = (to: string, params: any) => { onOpenChange(false); navigate({ to, params } as any); };

  const cList = (customers.data ?? []).filter((c: any) => !s || match(c.name) || match(c.phone) || match(c.card_number) || match(c.account_number) || match(c.notes)).slice(0, 8);
  const bList2 = (bankAccounts.data ?? []).filter((b: any) => !s || match(b.iban) || match(b.card_number) || match(b.account_number) || match(b.bank_name) || match(b.holder_name) || match(b.nickname)).slice(0, 8);
  const aList = (accounts.data ?? []).filter((a: any) => !s || match(a.name) || match(a.iban) || match(a.card_number) || match(a.currency)).slice(0, 8);
  const sList = (sells.data ?? []).filter((r: any) => !s || match(r.doc_no) || match(r.id) || match(r.entry_date) || match(r.notes) || match(r.sold_amount) || match(r.received_amount) || match(r.sold_currency) || match(r.received_currency)).slice(0, 8);
  const bList = (buys.data ?? []).filter((r: any) => !s || match(r.doc_no) || match(r.id) || match(r.entry_date) || match(r.notes) || match(r.bought_amount) || match(r.paid_amount) || match(r.bought_currency) || match(r.paid_currency)).slice(0, 8);
  const brList = (broughtIn.data ?? []).filter((r: any) => !s || match(r.doc_no) || match(r.source_name) || match(r.notes) || match(r.amount) || match(r.currency) || match(r.entry_date)).slice(0, 6);
  const eList = (expenses.data ?? []).filter((r: any) => !s || match(r.doc_no) || match(r.category) || match(r.notes) || match(r.amount) || match(r.currency)).slice(0, 6);
  const pList = (payments.data ?? []).filter((r: any) => !s || match(r.reference) || match(r.amount) || match(r.currency)).slice(0, 6);

  const custMap = useMemo(() => new Map((customers.data ?? []).map((c: any) => [c.id, c.name])), [customers.data]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search doc no, customer, IBAN, card, phone, reference, amount, note…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {cList.length > 0 && (
          <CommandGroup heading="Customers">
            {cList.map((c: any) => (
              <CommandItem key={c.id} value={`c-${c.id}-${c.name}`} onSelect={() => gotoWith("/customers/$id", { id: c.id })}>
                <div className="flex-1"><div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{[c.phone, c.card_number, c.account_number].filter(Boolean).join(" · ")}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {bList2.length > 0 && (<><CommandSeparator />
          <CommandGroup heading="Customer bank accounts">
            {bList2.map((b: any) => (
              <CommandItem key={b.id} value={`cba-${b.id}`} onSelect={() => gotoWith("/customers/$id", { id: b.customer_id })}>
                <div className="flex-1">
                  <div className="font-medium">{custMap.get(b.customer_id) ?? "Customer"} · {b.bank_name ?? "Bank"} ({b.currency})</div>
                  <div className="text-xs text-muted-foreground font-mono">{[b.iban, b.card_number, b.account_number].filter(Boolean).join(" · ")}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup></>)}
        {aList.length > 0 && (<><CommandSeparator />
          <CommandGroup heading="Accounts">
            {aList.map((a: any) => (
              <CommandItem key={a.id} value={`a-${a.id}-${a.name}`} onSelect={() => goto("/accounts")}>
                <div className="flex-1"><div className="font-medium">{a.name} · {a.currency}</div>
                  <div className="text-xs text-muted-foreground">{[a.account_type, a.iban, a.card_number].filter(Boolean).join(" · ")}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup></>)}
        {sList.length > 0 && (<><CommandSeparator />
          <CommandGroup heading="Deals (Sell)">
            {sList.map((r: any) => (
              <CommandItem key={r.id} value={`s-${r.id}-${r.doc_no ?? ""}`} onSelect={() => gotoWith("/sells/$id", { id: r.id })}>
                <div className="flex-1">
                  <div className="font-medium">{r.doc_no ?? r.id.slice(0, 8)} · {r.entry_date} · {fmt(r.sold_amount, r.sold_currency)} → {fmt(r.received_amount, r.received_currency)}</div>
                  <div className="text-xs text-muted-foreground">{r.customer_id ? (custMap.get(r.customer_id) ?? "") : ""} {r.notes ? "· " + r.notes : ""}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup></>)}
        {bList.length > 0 && (<><CommandSeparator />
          <CommandGroup heading="Buys">
            {bList.map((r: any) => (
              <CommandItem key={r.id} value={`b-${r.id}-${r.doc_no ?? ""}`} onSelect={() => goto("/buy")}>
                <div className="flex-1">
                  <div className="font-medium">{r.doc_no ?? r.id.slice(0, 8)} · {r.entry_date} · {fmt(r.bought_amount, r.bought_currency)} for {fmt(r.paid_amount, r.paid_currency)}</div>
                  {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup></>)}
        {brList.length > 0 && (<><CommandSeparator />
          <CommandGroup heading="Brought-in">
            {brList.map((r: any) => (
              <CommandItem key={r.id} value={`br-${r.id}`} onSelect={() => goto("/brought-in")}>
                <div className="flex-1">
                  <div className="font-medium">{r.doc_no ?? r.id.slice(0, 8)} · {r.entry_date} · {fmt(r.amount, r.currency)}</div>
                  <div className="text-xs text-muted-foreground">{[r.source_name, r.notes].filter(Boolean).join(" · ")}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup></>)}
        {eList.length > 0 && (<><CommandSeparator />
          <CommandGroup heading="Expenses">
            {eList.map((r: any) => (
              <CommandItem key={r.id} value={`e-${r.id}`} onSelect={() => goto("/expenses")}>
                <div className="flex-1">
                  <div className="font-medium">{r.doc_no ?? r.id.slice(0, 8)} · {r.entry_date} · {fmt(r.amount, r.currency)}</div>
                  <div className="text-xs text-muted-foreground">{[r.category, r.notes].filter(Boolean).join(" · ")}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup></>)}
        {pList.length > 0 && (<><CommandSeparator />
          <CommandGroup heading="Payments / References">
            {pList.map((r: any) => (
              <CommandItem key={r.id} value={`p-${r.id}`} onSelect={() => gotoWith("/sells/$id", { id: r.sell_id })}>
                <div className="flex-1">
                  <div className="font-medium">{fmt(r.amount, r.currency)} · ref {r.reference ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.entry_date}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup></>)}
      </CommandList>
    </CommandDialog>
  );
}