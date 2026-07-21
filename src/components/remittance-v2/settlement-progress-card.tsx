import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Phase 4E — read-only progress card driven by the settlement-event log.
 *
 * IMPORTANT: this card displays financial totals only. It does NOT infer
 * workflow state from event rows. Workflow state is authoritatively read
 * from `remittances.workflow_state` elsewhere on the page.
 */
export function SettlementProgressCard({
  remittanceId,
  settlementAmount,
  settlementCurrency,
}: {
  remittanceId: string;
  settlementAmount: number | null;
  settlementCurrency: string | null;
}) {
  const q = useQuery({
    queryKey: ["remittance-v2", "progress", remittanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_settlement_events")
        .select("event_type, payload")
        .eq("remittance_id", remittanceId);
      if (error) throw error;
      let delivered = 0;
      let thirdPartySettled = 0;
      let fundsReceived = 0;
      for (const row of data ?? []) {
        const p = (row.payload ?? {}) as Record<string, unknown>;
        const et = String(row.event_type);
        if (et === "supplier_delivery") {
          delivered += Number(p.received_amount ?? 0) || 0;
        } else if (et === "third_party_settlement") {
          thirdPartySettled += Number(p.amount ?? 0) || 0;
        } else if (et === "funds_received") {
          fundsReceived += Number(p.amount ?? 0) || 0;
        }
      }
      return { delivered, thirdPartySettled, fundsReceived };
    },
  });

  const totals = q.data ?? { delivered: 0, thirdPartySettled: 0, fundsReceived: 0 };
  const required = settlementAmount ?? 0;
  const remainingDelivery = Math.max(0, required - totals.delivered);
  const remainingThirdParty = Math.max(0, required - totals.thirdPartySettled);
  const ccy = settlementCurrency ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Settlement Progress</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Metric label="Required" value={`${required} ${ccy}`} />
        <Metric label="Funds received" value={`${totals.fundsReceived} ${ccy}`} />
        <Metric label="3rd-party settled" value={`${totals.thirdPartySettled} ${ccy}`} />
        <Metric label="Supplier delivered" value={`${totals.delivered} ${ccy}`} />
        <Metric label="Remaining (3rd-party)" value={`${remainingThirdParty} ${ccy}`} />
        <Metric label="Remaining (delivery)" value={`${remainingDelivery} ${ccy}`} />
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
    </div>
  );
}