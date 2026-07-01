import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmt } from "@/lib/exchange";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wallets")({ component: Page });

function Page() {
  const [search, setSearch] = useState("");
  const [openCust, setOpenCust] = useState<string | null>(null);

  const walletsQ = useQuery({
    queryKey: ["customer_wallet_balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_wallet_balances").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const creditQ = useQuery({
    queryKey: ["customer_credit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_credit").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { customer_id: string; name: string; wallets: any[]; lastActivity: string | null }>();
    (walletsQ.data ?? []).forEach((w: any) => {
      if (!w.customer_id) return;
      const g = map.get(w.customer_id) ?? { customer_id: w.customer_id, name: w.customer_name || "—", wallets: [], lastActivity: null };
      g.wallets.push(w);
      if (w.last_activity && (!g.lastActivity || w.last_activity > g.lastActivity)) g.lastActivity = w.last_activity;
      map.set(w.customer_id, g);
    });
    const arr = Array.from(map.values());
    const s = search.toLowerCase();
    return s ? arr.filter((g) => g.name.toLowerCase().includes(s)) : arr;
  }, [walletsQ.data, search]);

  const creditFor = (id: string) => (creditQ.data ?? []).find((c: any) => c.customer_id === id);

  return (
    <>
      <PageHeader title="Customer Wallets" description="Trust balances held for customers. Not company money." />
      <div className="mb-4 relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search customer…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {grouped.map((g) => {
          const credit = creditFor(g.customer_id);
          const anyNegative = g.wallets.some((w: any) => Number(w.balance) < -0.0001);
          const status = anyNegative ? { label: "Debt", tone: "destructive" } : { label: "Good", tone: "success" };
          return (
            <Card key={g.customer_id} className="cursor-pointer" onClick={() => setOpenCust(g.customer_id)} style={{ boxShadow: "var(--shadow-soft)" }}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{g.name}</CardTitle>
                <Badge variant={status.tone === "destructive" ? "destructive" : "secondary"}>{status.label}</Badge>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {g.wallets.filter((w: any) => Math.abs(Number(w.balance)) > 0.0001).length === 0 && (
                  <div className="text-muted-foreground text-xs">Empty wallets</div>
                )}
                {g.wallets.filter((w: any) => Math.abs(Number(w.balance)) > 0.0001).map((w: any) => (
                  <div key={w.account_id} className="flex justify-between">
                    <span className="text-muted-foreground">{w.currency}</span>
                    <span className={"font-mono " + (Number(w.balance) < 0 ? "text-destructive" : "")}>{fmt(w.balance, w.currency)}</span>
                  </div>
                ))}
                {credit?.credit_limit ? (
                  <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t"><span>Credit limit</span><span className="font-mono">{fmt(credit.credit_limit, credit.base_currency)}</span></div>
                ) : null}
                {g.lastActivity && <div className="text-[11px] text-muted-foreground">Last activity {g.lastActivity}</div>}
              </CardContent>
            </Card>
          );
        })}
        {grouped.length === 0 && <div className="text-muted-foreground text-sm">No customers found.</div>}
      </div>
      <CustomerStatement customerId={openCust} onClose={() => setOpenCust(null)} />
    </>
  );
}

function CustomerStatement({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["customer_full", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const [cust, deposits, orders, buys, sells, wallets, charges] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId!).maybeSingle(),
        supabase.from("customer_deposits").select("*").eq("customer_id", customerId!).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("payment_orders").select("*").eq("customer_id", customerId!).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("buy_transactions").select("*").eq("customer_id", customerId!).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("sell_transactions").select("*").eq("customer_id", customerId!).is("deleted_at", null).order("entry_date", { ascending: false }),
        supabase.from("customer_wallet_balances").select("*").eq("customer_id", customerId!),
        supabase.from("service_charges").select("*").eq("customer_id", customerId!).order("entry_date", { ascending: false }),
      ]);
      return {
        customer: cust.data, deposits: deposits.data ?? [], orders: orders.data ?? [],
        buys: buys.data ?? [], sells: sells.data ?? [], wallets: wallets.data ?? [], charges: charges.data ?? [],
      };
    },
  });
  return (
    <Dialog open={!!customerId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Customer statement — {q.data?.customer?.name}</DialogTitle></DialogHeader>
        {q.data && (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Wallet balances</div>
              <div className="grid grid-cols-3 gap-2">
                {q.data.wallets.map((w: any) => (
                  <div key={w.account_id} className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">{w.currency}</div>
                    <div className={"font-mono " + (Number(w.balance) < 0 ? "text-destructive" : "")}>{fmt(w.balance, w.currency)}</div>
                  </div>
                ))}
              </div>
            </div>
            <Section title={`Deposits (${q.data.deposits.length})`}>
              {q.data.deposits.map((r: any) => (
                <Row key={r.id} left={`${r.entry_date} · ${r.settlement_status}`} right={fmt(r.amount, r.currency)} />
              ))}
            </Section>
            <Section title={`Payment orders (${q.data.orders.length})`}>
              {q.data.orders.map((r: any) => (
                <Row key={r.id} left={`${r.entry_date} · ${r.method} · ${r.receiver_name || "—"}`} right={"- " + fmt(r.amount, r.currency)} />
              ))}
            </Section>
            <Section title={`Exchanges — Buys (${q.data.buys.length})`}>
              {q.data.buys.map((r: any) => (
                <Row key={r.id} left={`${r.entry_date} · ${r.bought_currency}/${r.paid_currency}`} right={`${fmt(r.bought_amount, r.bought_currency)} @ ${r.rate}`} />
              ))}
            </Section>
            <Section title={`Exchanges — Sells (${q.data.sells.length})`}>
              {q.data.sells.map((r: any) => (
                <Row key={r.id} left={`${r.entry_date} · ${r.sold_currency}/${r.received_currency}`} right={`${fmt(r.sold_amount, r.sold_currency)} @ ${r.rate}`} />
              ))}
            </Section>
            <Section title={`Service charges (${q.data.charges.length})`}>
              {q.data.charges.map((r: any) => (
                <Row key={r.id} left={`${r.entry_date} · ${r.kind}`} right={fmt(r.amount, r.currency)} />
              ))}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      <div className="rounded border divide-y">{children ?? <div className="p-3 text-xs text-muted-foreground">None</div>}</div>
    </div>
  );
}
function Row({ left, right }: { left: string; right: string }) {
  return <div className="flex justify-between px-3 py-2"><span className="text-sm">{left}</span><span className="font-mono text-sm">{right}</span></div>;
}