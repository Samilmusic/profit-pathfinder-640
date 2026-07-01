import { useEffect, useState } from "react";
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
    queryFn: async () => (await supabase.from("customers").select("id,name,phone,card_number,account_number").is("deleted_at", null).limit(500)).data ?? [],
  });
  const accounts = useQuery({
    queryKey: ["search_accounts"], enabled: open,
    queryFn: async () => (await supabase.from("accounts").select("id,name,currency,iban,card_number,account_type").is("deleted_at", null).limit(500)).data ?? [],
  });
  const sells = useQuery({
    queryKey: ["search_sells"], enabled: open,
    queryFn: async () => (await supabase.from("sell_transactions").select("id,entry_date,sold_amount,sold_currency,received_amount,received_currency,notes").is("deleted_at", null).order("entry_date", { ascending: false }).limit(200)).data ?? [],
  });
  const buys = useQuery({
    queryKey: ["search_buys"], enabled: open,
    queryFn: async () => (await supabase.from("buy_transactions").select("id,entry_date,bought_amount,bought_currency,paid_amount,paid_currency,notes").is("deleted_at", null).order("entry_date", { ascending: false }).limit(200)).data ?? [],
  });

  const s = q.trim().toLowerCase();
  const match = (v: any) => v && String(v).toLowerCase().includes(s);

  const goto = (to: string) => { onOpenChange(false); navigate({ to }); };

  const cList = (customers.data ?? []).filter((c: any) => !s || match(c.name) || match(c.phone) || match(c.card_number) || match(c.account_number)).slice(0, 8);
  const aList = (accounts.data ?? []).filter((a: any) => !s || match(a.name) || match(a.iban) || match(a.card_number) || match(a.currency)).slice(0, 8);
  const sList = (sells.data ?? []).filter((r: any) => !s || match(r.id) || match(r.entry_date) || match(r.notes) || match(r.sold_amount) || match(r.received_amount) || match(r.sold_currency) || match(r.received_currency)).slice(0, 8);
  const bList = (buys.data ?? []).filter((r: any) => !s || match(r.id) || match(r.entry_date) || match(r.notes) || match(r.bought_amount) || match(r.paid_amount) || match(r.bought_currency) || match(r.paid_currency)).slice(0, 8);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search customers, accounts, transactions, amounts, dates…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {cList.length > 0 && (
          <CommandGroup heading="Customers">
            {cList.map((c: any) => (
              <CommandItem key={c.id} value={`c-${c.id}-${c.name}`} onSelect={() => goto("/customers")}>
                <div className="flex-1"><div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{[c.phone, c.card_number, c.account_number].filter(Boolean).join(" · ")}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
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
          <CommandGroup heading="Sell transactions">
            {sList.map((r: any) => (
              <CommandItem key={r.id} value={`s-${r.id}`} onSelect={() => goto("/sell")}>
                <div className="flex-1"><div className="font-medium">{r.entry_date} · {fmt(r.sold_amount, r.sold_currency)} → {fmt(r.received_amount, r.received_currency)}</div>
                  <div className="text-xs text-muted-foreground">ID {r.id.slice(0, 8)} {r.notes ? "· " + r.notes : ""}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup></>)}
        {bList.length > 0 && (<><CommandSeparator />
          <CommandGroup heading="Buy transactions">
            {bList.map((r: any) => (
              <CommandItem key={r.id} value={`b-${r.id}`} onSelect={() => goto("/buy")}>
                <div className="flex-1"><div className="font-medium">{r.entry_date} · {fmt(r.bought_amount, r.bought_currency)} for {fmt(r.paid_amount, r.paid_currency)}</div>
                  <div className="text-xs text-muted-foreground">ID {r.id.slice(0, 8)} {r.notes ? "· " + r.notes : ""}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup></>)}
      </CommandList>
    </CommandDialog>
  );
}