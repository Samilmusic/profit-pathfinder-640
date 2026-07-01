import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt } from "@/lib/exchange";

export const Route = createFileRoute("/_authenticated/inventory")({ component: Page });

function Page() {
  const q = useQuery({
    queryKey: ["currency_inventory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currency_inventory").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader title="Currency Inventory" description="Total holdings, average buy rate, and cost basis per currency." />
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Currency</TableHead><TableHead className="text-right">Total owned</TableHead><TableHead className="text-right">Avg buy rate</TableHead><TableHead className="text-right">Total cost</TableHead><TableHead>Last buy</TableHead><TableHead>Last sell</TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r: any) => (
              <TableRow key={r.currency}>
                <TableCell className="font-medium">{r.currency}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.total_amount)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.avg_buy_rate)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.total_cost)}</TableCell>
                <TableCell>{r.last_buy_date || "—"}</TableCell>
                <TableCell>{r.last_sell_date || "—"}</TableCell>
              </TableRow>
            ))}
            {q.data && q.data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No inventory yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </>
  );
}