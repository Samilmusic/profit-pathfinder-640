import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Star, StarOff, Power } from "lucide-react";
import { useState } from "react";
import { CustomerBankAccountForm, maskAccount } from "@/components/customer-bank-account-form";
import { useCustomerBankAccounts } from "@/components/customer-bank-account-picker";
import { fmtAmount } from "@/lib/exchange";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/customers/$id")({ component: CustomerProfile });

function CustomerProfile() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const c = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
      if (error) throw error; return data;
    },
  });

  const accountsQ = useCustomerBankAccounts(id);

  const sells = useQuery({
    queryKey: ["customer-sells", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sell_transactions").select("*").eq("customer_id", id).is("deleted_at", null).order("txn_date", { ascending: false }).limit(50);
      if (error) throw error; return data ?? [];
    },
  });
  const buys = useQuery({
    queryKey: ["customer-buys", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("buy_transactions").select("*").eq("customer_id", id).is("deleted_at", null).order("txn_date", { ascending: false }).limit(50);
      if (error) throw error; return data ?? [];
    },
  });
  const deposits = useQuery({
    queryKey: ["customer-deposits", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_deposits").select("*").eq("customer_id", id).is("deleted_at", null).order("txn_date", { ascending: false }).limit(50);
      if (error) throw error; return data ?? [];
    },
  });
  const credit = useQuery({
    queryKey: ["customer-credit", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_credit").select("*").eq("customer_id", id);
      if (error) return []; return data ?? [];
    },
  });

  const toggleActive = async (a: any) => {
    const { error } = await supabase.from("customer_bank_accounts").update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success(a.is_active ? "Marked inactive" : "Reactivated");
    qc.invalidateQueries({ queryKey: ["customer_bank_accounts", id] });
  };
  const setDefault = async (a: any) => {
    const { error } = await supabase.from("customer_bank_accounts").update({ is_default: !a.is_default }).eq("id", a.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["customer_bank_accounts", id] });
  };

  return (
    <>
      <PageHeader
        title={c.data?.name ?? "Customer"}
        actions={
          <Link to="/customers"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> All customers</Button></Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Personal info</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row label="Name" value={c.data?.name} />
            <Row label="Phone" value={c.data?.phone} />
            <Row label="Notes" value={c.data?.notes} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Bank accounts</CardTitle>
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Add account</Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {(accountsQ.data ?? []).map((a: any) => {
                const tail = a.card_number || a.account_number || a.iban;
                return (
                  <div key={a.id} className={`rounded-lg border p-3 space-y-2 ${a.is_active ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{a.nickname || a.bank_name}</div>
                        <div className="text-xs text-muted-foreground">{a.bank_name} · {a.currency}{a.country ? ` · ${a.country}` : ""}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {a.is_default && <Badge className="text-[10px]">Default</Badge>}
                        {!a.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                      </div>
                    </div>
                    {a.holder_name && <div className="text-xs">{a.holder_name}</div>}
                    {tail && <div className="text-xs font-mono">{maskAccount(tail)}</div>}
                    {a.iban && a.iban !== tail && <div className="text-[11px] text-muted-foreground font-mono truncate">IBAN {maskAccount(a.iban)}</div>}
                    {a.swift_bic && <div className="text-[11px] text-muted-foreground">SWIFT {a.swift_bic}</div>}
                    <div className="flex gap-1 pt-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setEditing(a); setFormOpen(true); }}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDefault(a)}>
                        {a.is_default ? <><StarOff className="h-3 w-3 mr-1" />Unset default</> : <><Star className="h-3 w-3 mr-1" />Set default</>}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggleActive(a)}><Power className="h-3 w-3 mr-1" />{a.is_active ? "Deactivate" : "Reactivate"}</Button>
                    </div>
                  </div>
                );
              })}
              {(accountsQ.data ?? []).length === 0 && <div className="text-sm text-muted-foreground col-span-full py-6 text-center">No bank accounts yet. Click <b>Add account</b> to save one.</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Wallet balances</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {(credit.data ?? []).length === 0 && <div className="text-muted-foreground text-xs">No balance activity</div>}
            {(credit.data ?? []).map((r: any, i: number) => (
              <div key={i} className="flex justify-between border-b pb-1 last:border-0">
                <span>{r.currency}</span>
                <span className={`font-mono ${Number(r.balance ?? 0) < 0 ? "text-destructive" : ""}`}>{fmtAmount(Number(r.balance ?? 0), r.currency)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recent trades</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs">
              {[...(sells.data ?? []).map((s: any) => ({ ...s, kind: "Sell" })), ...(buys.data ?? []).map((b: any) => ({ ...b, kind: "Buy" }))]
                .sort((a, b) => (b.txn_date || "").localeCompare(a.txn_date || ""))
                .slice(0, 20)
                .map((t: any) => (
                  <div key={t.kind + t.id} className="flex justify-between items-center border-b py-1 last:border-0">
                    <div><Badge variant="outline" className="text-[10px] mr-2">{t.kind}</Badge>{t.txn_date}</div>
                    <div className="font-mono">{fmtAmount(Number(t.sold_amount ?? t.bought_amount ?? 0), t.sold_currency ?? t.bought_currency)}</div>
                    <Badge variant={t.status === "completed" ? "default" : "secondary"} className="text-[10px]">{t.status}</Badge>
                  </div>
                ))}
              {(sells.data ?? []).length + (buys.data ?? []).length === 0 && <div className="text-muted-foreground text-center py-4">No trades yet</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Recent deposits</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs">
              {(deposits.data ?? []).slice(0, 20).map((d: any) => (
                <div key={d.id} className="flex justify-between items-center border-b py-1 last:border-0">
                  <div>{d.txn_date}</div>
                  <div className="font-mono">{fmtAmount(Number(d.amount), d.currency)}</div>
                  <div className="text-muted-foreground truncate max-w-[40%]">{d.notes || "—"}</div>
                </div>
              ))}
              {(deposits.data ?? []).length === 0 && <div className="text-muted-foreground text-center py-4">No deposits yet</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <CustomerBankAccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        customerId={id}
        initial={editing}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}