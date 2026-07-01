import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronDown, CheckCircle2, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerBankAccountForm, maskAccount } from "@/components/customer-bank-account-form";

export function useCustomerBankAccounts(customerId?: string | null) {
  return useQuery({
    queryKey: ["customer_bank_accounts", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_bank_accounts")
        .select("*")
        .eq("customer_id", customerId!)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("last_used_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function CustomerBankAccountPicker({
  customerId, currency, value, onChange, label = "Customer account", allowAdd = true, requireActive = true,
}: {
  customerId?: string | null;
  currency?: string;
  value?: string | null;
  onChange: (id: string | null, row?: any) => void;
  label?: string;
  allowAdd?: boolean;
  requireActive?: boolean;
}) {
  const q = useCustomerBankAccounts(customerId);
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const list = useMemo(() => {
    let arr = q.data ?? [];
    if (currency) arr = arr.filter((a: any) => a.currency === currency);
    return arr;
  }, [q.data, currency]);

  // Auto-suggest last used / default when nothing selected
  useEffect(() => {
    if (!customerId || value) return;
    const preferred = list.find((a: any) => a.is_active && (a.is_default || a.last_used_at));
    if (preferred) onChange(preferred.id, preferred);
  }, [customerId, currency, list, value, onChange]);

  const selected = list.find((a: any) => a.id === value) ?? (q.data ?? []).find((a: any) => a.id === value);

  if (!customerId) {
    return <div className="text-xs text-muted-foreground italic px-3 py-2 rounded-md border border-dashed">Pick a customer first</div>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {allowAdd && (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setFormOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add new
          </Button>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between h-auto py-2">
            {selected ? (
              <BankAccountLine acc={selected} compact />
            ) : (
              <span className="text-muted-foreground text-sm">Select a saved account…</span>
            )}
            <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-1 w-[min(92vw,26rem)]">
          <div className="max-h-72 overflow-y-auto">
            {list.length === 0 && (
              <div className="text-xs text-muted-foreground px-3 py-6 text-center">
                No saved {currency ? currency + " " : ""}accounts for this customer.
              </div>
            )}
            {list.map((a: any) => {
              const disabled = requireActive && !a.is_active;
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(a.id, a); setOpen(false); }}
                  className={cn(
                    "w-full text-left rounded-md px-2 py-2 hover:bg-muted transition flex items-center gap-2",
                    disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                    a.id === value && "bg-muted",
                  )}
                >
                  <BankAccountLine acc={a} />
                  {a.id === value && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  {disabled && <Ban className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>
              );
            })}
          </div>
          {allowAdd && (
            <div className="border-t mt-1 pt-1">
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setOpen(false); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Add new account
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <CustomerBankAccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        customerId={customerId}
        onSaved={(id) => onChange(id)}
      />
    </div>
  );
}

export function BankAccountLine({ acc, compact = false }: { acc: any; compact?: boolean }) {
  const flag = countryFlag(acc.country) || currencyFlag(acc.currency);
  const tail = acc.card_number || acc.account_number || acc.iban;
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <span className="text-lg leading-none shrink-0">{flag}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{acc.nickname || acc.bank_name}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{acc.currency}</Badge>
          {acc.is_default && <Badge className="text-[10px] px-1.5 py-0 h-4">Default</Badge>}
          {!acc.is_active && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Inactive</Badge>}
        </div>
        {!compact && (
          <div className="text-xs text-muted-foreground truncate">
            {acc.bank_name}{acc.holder_name ? ` · ${acc.holder_name}` : ""}{tail ? ` · ${maskAccount(tail)}` : ""}
          </div>
        )}
        {compact && tail && <div className="text-[11px] text-muted-foreground truncate">{maskAccount(tail)}</div>}
      </div>
    </div>
  );
}

function currencyFlag(c?: string | null) {
  switch (c) {
    case "AED": return "🇦🇪";
    case "IRR": return "🇮🇷";
    case "USD": return "🇺🇸";
    case "GBP": return "🇬🇧";
    case "EUR": return "🇪🇺";
    case "USDT": return "💎";
    default: return "🏦";
  }
}

function countryFlag(cc?: string | null) {
  if (!cc || cc.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (cc.toUpperCase().charCodeAt(0) - 65), A + (cc.toUpperCase().charCodeAt(1) - 65));
}

/** Call after using an account in a transaction to remember it as last-used. */
export async function touchBankAccount(id?: string | null) {
  if (!id) return;
  await supabase.from("customer_bank_accounts").update({ last_used_at: new Date().toISOString() }).eq("id", id);
}