import { supabase } from "@/integrations/supabase/client";
import type {
  AllocateBuyInput,
  CancelRemittanceInput,
  FinalizeCloseInput,
  PrepareCloseInput,
  ReverseAllocationInput,
} from "./remittance-v2-allocation-schema";

/**
 * Phase 4F — thin client wrappers around the allocation-lifecycle RPCs.
 * The server is the sole authority for flag, role, state, and invariants;
 * these wrappers do NOT short-circuit on any client-side value.
 */

export async function remittanceV2AllocateBuy(
  input: AllocateBuyInput,
  clientRequestId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("remittance_v2_allocate_buy", {
    _remittance_id: input.remittance_id,
    _buy_id: input.buy_id,
    _amount: input.amount,
    _notes: input.notes,
    _client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data ? String(data) : null;
}

export async function remittanceV2ReverseAllocation(
  input: ReverseAllocationInput,
  clientRequestId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("remittance_v2_reverse_allocation", {
    _allocation_id: input.allocation_id,
    _reason: input.reason,
    _client_request_id: clientRequestId,
  });
  if (error) throw error;
  return data ? String(data) : null;
}

export async function remittanceV2PrepareClose(
  input: PrepareCloseInput,
  clientRequestId: string,
): Promise<void> {
  const { error } = await supabase.rpc("remittance_v2_prepare_close", {
    _id: input.remittance_id,
    _note: input.note,
    _client_request_id: clientRequestId,
  });
  if (error) throw error;
}

export async function remittanceV2FinalizeClose(
  input: FinalizeCloseInput,
  clientRequestId: string,
): Promise<void> {
  const { error } = await supabase.rpc("remittance_v2_finalize_close", {
    _id: input.remittance_id,
    _note: input.note,
    _client_request_id: clientRequestId,
  });
  if (error) throw error;
}

export async function remittanceV2Cancel(
  input: CancelRemittanceInput,
  clientRequestId: string,
): Promise<void> {
  const { error } = await supabase.rpc("remittance_v2_cancel", {
    _id: input.remittance_id,
    _reason: input.reason,
    _client_request_id: clientRequestId,
  });
  if (error) throw error;
}