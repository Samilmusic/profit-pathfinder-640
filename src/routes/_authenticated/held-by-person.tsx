import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "@/lib/exchange";

export const Route = createFileRoute("/_authenticated/held-by-person")({ component: Page });

function Page() {
  const accts = useQuery({
    queryKey: ["holding_accts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").eq("account_type", "person_holding").is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const balances = useQuery({
    queryKey: ["account_balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const customers = useQuery({
    queryKey: ["customers_light"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name").is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const balMap = new Map<string, number>();
  (balances.data ?? []).forEach((b: any) => balMap.set(b.account_id, Number(b.current_balance || 0)));
  const cName = (id: string | null) => (customers.data ?? []).find((c: any) => c.id === id)?.name;

  const rows = (accts.data ?? []).map((a: any) => ({
    ...a,
    who: a.holder_type === "customer" ? cName(a.holder_customer_id) ?? "Customer" : a.holder_type === "milad" ? "Milad" : a.holder_type === "ali" ? "Ali" : a.holder_person_name ?? "Other",
    balance: balMap.get(a.id) ?? 0,
  }));

  const grouped = new Map<string, typeof rows>();
  rows.forEach((r) => {
    const k = r.who;
    if (!grouped.has(k)) grouped.set(k, [] as any);
    grouped.get(k)!.push(r);
  });

  return (
    <>
      <PageHeader
        title="Held by Person"
        description="Money or currency physically held by a person, not yet in a bank or cash box. Balances stay visible until delivered."
      />
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from(grouped.entries()).map(([who, list]) => {
          const nonZero = list.filter((r) => Math.abs(r.balance) > 0.0001);
          return (
            <Card key={who}>
              <CardHeader><CardTitle className="text-base">{who}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Currency</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(nonZero.length ? nonZero : list).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.currency}</TableCell>
                        <TableCell className={`text-right font-mono ${r.balance < 0 ? "text-destructive" : ""}`}>{fmt(r.balance, r.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
        {rows.length === 0 && (
          <p className="text-muted-foreground">No person-holding accounts yet.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Tip: to move money "to a person", record a Transfer from a bank/cash account into the person's holding account. When they hand it over, transfer back out and attach the handover proof.
      </p>
    </>
  );
}