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