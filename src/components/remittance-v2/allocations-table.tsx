import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/exchange";

type AllocationRow = {
  id: string;
  buy_id: string | null;
  lot_id: string | null;
  currency: string;
  allocated_amount: number;
  status: string;
  posting_class: string;
  entry_kind: string;
  parent_allocation_id: string | null;
  reversed_by_id: string | null;
  frozen_cost_amount: number | null;
  frozen_cost_currency: string | null;
  frozen_spread_profit_aed: number | null;
  frozen_commission_aed: number | null;
  frozen_total_profit_aed: number | null;
  frozen_at: string | null;
  created_at: string;
  buy: {
    id: string;
    doc_no: string | null;
    bought_currency: string | null;
    bought_amount: number | null;
    buy_rate: number | null;
    supplier_delivered: boolean | null;
  } | null;
};

export function AllocationsTable({ remittanceId }: { remittanceId: string }) {
  const q = useQuery({
    queryKey: ["remittance-v2", "allocations", remittanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_allocations")
        .select(
          "id, buy_id, lot_id, currency, allocated_amount, status, posting_class, entry_kind, parent_allocation_id, reversed_by_id, frozen_cost_amount, frozen_cost_currency, frozen_spread_profit_aed, frozen_commission_aed, frozen_total_profit_aed, frozen_at, created_at, buy:buy_transactions!remittance_allocations_buy_id_fkey(id, doc_no, bought_currency, bought_amount, buy_rate, supplier_delivered)",
        )
        .eq("remittance_id", remittanceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AllocationRow[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Allocations</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : q.isError ? (
          <div className="text-sm text-destructive">Unable to load allocations.</div>
        ) : (q.data?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground">
            No records are available or visible to your role.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Ref</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Frozen cost</th>
                  <th className="py-2 pr-3">Spread AED</th>
                  <th className="py-2 pr-3">Commission AED</th>
                  <th className="py-2 pr-3">Total AED</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Kind</th>
                </tr>
              </thead>
              <tbody>
                {q.data!.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="py-2 pr-3 font-mono text-xs">{String(a.id).slice(0, 8)}</td>
                    <td className="py-2 pr-3">
                      {a.buy ? (
                        <span className="font-mono text-xs">
                          {a.buy.doc_no ?? String(a.buy_id).slice(0, 8)}
                        </span>
                      ) : a.lot_id ? (
                        <span className="text-muted-foreground">Lot allocation (future phase)</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {fmt(a.allocated_amount)} {a.currency}
                    </td>
                    <td className="py-2 pr-3">
                      {a.frozen_cost_amount != null
                        ? `${fmt(a.frozen_cost_amount)} ${a.frozen_cost_currency ?? ""}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {a.frozen_spread_profit_aed != null ? fmt(a.frozen_spread_profit_aed) : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {a.frozen_commission_aed != null ? fmt(a.frozen_commission_aed) : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {a.frozen_total_profit_aed != null ? fmt(a.frozen_total_profit_aed) : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="secondary">{String(a.status)}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant={String(a.entry_kind) === "normal" ? "outline" : "destructive"}
                      >
                        {String(a.entry_kind)}
                      </Badge>
                      {a.parent_allocation_id ? (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          reverses {String(a.parent_allocation_id).slice(0, 8)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
