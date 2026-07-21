/**
 * Reporting — Executive & Operational KPIs (Phase 6 Slice 1)
 * Version: 1.0.0
 *
 * READ-ONLY. Wraps `report_executive_kpis()` and `report_operational_kpis()`.
 * All financial math is server-authoritative. Market values come from the
 * latest persisted `market_rates` snapshot; live rates are never fetched.
 * Executive metrics are cached (60s stale); operational metrics refresh
 * frequently (15s stale).
 */

import { supabase } from "@/integrations/supabase/client";

export type ReportMeta = {
  report_key: string;
  report_version: string;
  generated_at: string;
  data_cutoff: string;
  generated_by_version: string;
};

export type InventoryRow = {
  currency: string;
  remaining_amount: number;
  wap_cost_rate: number | null;
  cost_value: number;
  cost_basis_currency: string | null;
  market_mid: number | null;
  market_snapshot_at: string | null;
  market_snapshot_source: string | null;
  estimated_market_value_aed: number | null;
  unrealized_pl_aed: number | null;
};

export type ExecutiveKpis = {
  meta: ReportMeta;
  profit: {
    today: number;
    yesterday: number;
    mtd: number;
    last_month: number;
    ytd: number;
    currency: "AED";
  };
  remittances: {
    by_state: Record<string, number>;
    open: number;
    closed: number;
    waiting_supplier: number;
    waiting_allocation: number;
    ready_to_close: number;
  };
  inventory: InventoryRow[];
};

export type OperatorWorkload = {
  operator_id: string;
  open_drafts: number;
  in_flight: number;
  closed_today: number;
  cancelled_today: number;
};

export type OperationalKpis = {
  meta: ReportMeta;
  states: Record<string, number>;
  operator_workload: OperatorWorkload[];
  closed_today: number;
  cancelled_today: number;
  avg_processing_seconds: number | null;
};

export async function fetchExecutiveKpis(): Promise<ExecutiveKpis> {
  const { data, error } = await supabase.rpc("report_executive_kpis");
  if (error) throw error;
  return data as unknown as ExecutiveKpis;
}

export async function fetchOperationalKpis(): Promise<OperationalKpis> {
  const { data, error } = await supabase.rpc("report_operational_kpis");
  if (error) throw error;
  return data as unknown as OperationalKpis;
}