import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/exchange";

export function ProfitComponentsCard({
  remittanceId,
  allocationPostingEnabled,
}: { remittanceId: string; allocationPostingEnabled: boolean }) {
  const q = useQuery({
    queryKey: ["remittance-v2", "profit-components", remittanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_profit_components")
        .select("id, allocation_id, component_type, currency, amount, amount_aed, posting_class, entry_kind, reference_note, created_at")
        .eq("remittance_id", remittanceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalAed = (q.data ?? []).reduce((acc: number, r: any) => {
    const val = Number(r.amount_aed ?? 0);
    return acc + (String(r.component_type) === "expense" ? -val : val);
  }, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profit Components</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : q.isError ? (
          <div className="text-sm text-destructive">Unable to load profit components.</div>
        ) : (q.data?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground">No records are available or visible to your role.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Component</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">AED</th>
                    <th className="py-2 pr-3">Kind</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data!.map((r: any) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-3">{String(r.component_type)}</td>
                      <td className="py-2 pr-3">{r.amount != null ? `${fmt(r.amount)} ${r.currency ?? ""}` : "—"}</td>
                      <td className="py-2 pr-3">{r.amount_aed != null ? fmt(r.amount_aed) : "—"}</td>
                      <td className="py-2 pr-3">{String(r.entry_kind)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="font-medium">Total AED</span>
              <span className="font-mono">{fmt(totalAed)}</span>
            </div>
          </>
        )}
        {!allocationPostingEnabled ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300">
            Allocation ledger posting is disabled. Profit components are informational only and are NOT posted to the ledger.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
