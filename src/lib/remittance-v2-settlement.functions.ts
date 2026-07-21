import { supabase } from "@/integrations/supabase/client";
import type {
  MarkFundsReceivedInput,
  RecordSupplierDeliveryInput,
  RecordThirdPartySettlementInput,
} from "./remittance-v2-settlement-schema";

/**
 * Phase 4E — thin client wrappers around the three v2 settlement RPCs.
 *
 * The server is the sole authority for feature-flag, role, state, and
 * payment_destination checks. These wrappers do not short-circuit on any
 * client-side value.
 */

export async function remittanceV2MarkFundsReceived(
  input: MarkFundsReceivedInput,
  clientRequestId: string,
): Promise<void> {
  const { error } = await supabase.rpc("remittance_v2_mark_funds_received", {
    _id: input.remittance_id,
    _account_id: input.account_id,
    _amount: input.amount,
    _note: input.note ?? null,
    _client_request_id: clientRequestId,
  });
  if (error) throw error;
}

export async function remittanceV2RecordThirdPartySettlement(
  input: RecordThirdPartySettlementInput,
  clientRequestId: string,
): Promise<void> {
  const { error } = await supabase.rpc("remittance_v2_record_third_party_settlement", {
    _id: input.remittance_id,
    _third_party_customer_id: input.third_party_customer_id,
    _amount: input.amount,
    _note: input.note ?? null,
    _client_request_id: clientRequestId,
  });
  if (error) throw error;
}

export async function remittanceV2RecordSupplierDelivery(
  input: RecordSupplierDeliveryInput,
  clientRequestId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("remittance_v2_record_supplier_delivery", {
    _remittance_id: input.remittance_id,
    _buy_id: input.buy_id,
    _delivered_amount: input.delivered_amount,
    _received_into_account_id: input.received_into_account_id,
    _delivered_at: input.delivered_at,
    _note: input.note ?? null,
    _client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data ? String(data) : null;
}