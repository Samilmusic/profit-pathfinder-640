/**
 * Operational Infrastructure — Remittance V2 Reconciliation
 * Version: 1.0.0 (Phase 5 Production Readiness)
 *
 * This client wrapper invokes `public.remittance_v2_reconcile()`, a server-side
 * financial contract that validates structural and monetary integrity of the
 * Remittance v2 workflow. Whenever a new workflow state, reconciliation rule,
 * or financial invariant is introduced, both the RPC implementation and this
 * contract must be updated in the same pull request.
 */

import { supabase } from "@/integrations/supabase/client";

export type ReconCheck = {

  check_id: number;
  check_name: string;
  severity: "critical" | "warning" | "info";
  passed: boolean;
  delta: number;
  details: Record<string, unknown>;
};

export async function runRemittanceV2Reconciliation(): Promise<ReconCheck[]> {
  const { data, error } = await supabase.rpc("remittance_v2_reconcile");
  if (error) throw error;
  return (data ?? []) as ReconCheck[];
}
