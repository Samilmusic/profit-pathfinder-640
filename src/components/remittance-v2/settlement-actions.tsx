import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { MarkFundsReceivedDialog } from "./mark-funds-received-dialog";
import { RecordThirdPartySettlementDialog } from "./record-third-party-settlement-dialog";
import { RecordSupplierDeliveryDialog } from "./record-supplier-delivery-dialog";

/**
 * Phase 4E — chooses which settlement action buttons to show.
 *
 * Button visibility is a UX affordance only. The server is the sole authority:
 * every RPC re-reads `payment_destination` and `workflow_state` under a
 * `SELECT ... FOR UPDATE` lock and rejects on mismatch.
 */
export function SettlementActions({
  remittanceId,
  workflowState,
  paymentDestination,
  settlementAmount,
  settlementCurrency,
  thirdPartyCustomerId,
  linkedBuyId,
  linkedBuyDelivered,
  v2Enabled,
}: {
  remittanceId: string;
  workflowState: string;
  paymentDestination: string | null;
  settlementAmount: number | null;
  settlementCurrency: string | null;
  thirdPartyCustomerId: string | null;
  linkedBuyId: string | null;
  linkedBuyDelivered: boolean | null;
  v2Enabled: boolean;
}) {
  const [openMark, setOpenMark] = useState(false);
  const [openThirdParty, setOpenThirdParty] = useState(false);
  const [openDelivery, setOpenDelivery] = useState(false);

  const progress = useQuery({
    queryKey: ["remittance-v2", "progress", remittanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittance_settlement_events")
        .select("event_type, payload")
        .eq("remittance_id", remittanceId);
      if (error) throw error;
      let delivered = 0;
      let settled = 0;
      for (const row of data ?? []) {
        const p = (row.payload ?? {}) as Record<string, unknown>;
        if (row.event_type === "supplier_delivery") {
          delivered += Number(p.received_amount ?? 0) || 0;
        } else if (row.event_type === "third_party_settlement") {
          settled += Number(p.amount ?? 0) || 0;
        }
      }
      return { delivered, settled };
    },
  });

  const remainingDelivery = useMemo(() => {
    const req = settlementAmount ?? 0;
    return Math.max(0, req - (progress.data?.delivered ?? 0));
  }, [progress.data?.delivered, settlementAmount]);
  const remainingThirdParty = useMemo(() => {
    const req = settlementAmount ?? 0;
    return Math.max(0, req - (progress.data?.settled ?? 0));
  }, [progress.data?.settled, settlementAmount]);

  const canMarkFundsReceived =
    workflowState === "draft" && paymentDestination !== "to_third_party";
  const canRecordThirdParty =
    (workflowState === "draft" || workflowState === "settlement_pending") &&
    paymentDestination === "to_third_party";
  const canRecordSupplierDelivery =
    (workflowState === "funds_received" || workflowState === "settlement_pending") &&
    !!linkedBuyId &&
    !linkedBuyDelivered;

  if (
    !v2Enabled ||
    (!canMarkFundsReceived && !canRecordThirdParty && !canRecordSupplierDelivery)
  ) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Settlement Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {canMarkFundsReceived ? (
          <Button size="sm" onClick={() => setOpenMark(true)}>
            Mark Funds Received
          </Button>
        ) : null}
        {canRecordThirdParty ? (
          <Button size="sm" onClick={() => setOpenThirdParty(true)}>
            Record Third-Party Settlement
          </Button>
        ) : null}
        {canRecordSupplierDelivery ? (
          <Button size="sm" onClick={() => setOpenDelivery(true)}>
            Record Supplier Delivery
          </Button>
        ) : null}

        {openMark ? (
          <MarkFundsReceivedDialog
            open={openMark}
            onOpenChange={setOpenMark}
            remittanceId={remittanceId}
            defaultAmount={settlementAmount}
            defaultCurrency={settlementCurrency}
          />
        ) : null}
        {openThirdParty ? (
          <RecordThirdPartySettlementDialog
            open={openThirdParty}
            onOpenChange={setOpenThirdParty}
            remittanceId={remittanceId}
            defaultThirdPartyCustomerId={thirdPartyCustomerId}
            remainingAmount={remainingThirdParty}
            settlementCurrency={settlementCurrency}
          />
        ) : null}
        {openDelivery && linkedBuyId ? (
          <RecordSupplierDeliveryDialog
            open={openDelivery}
            onOpenChange={setOpenDelivery}
            remittanceId={remittanceId}
            buyId={linkedBuyId}
            deliveryCurrency={settlementCurrency}
            remainingAmount={remainingDelivery}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}