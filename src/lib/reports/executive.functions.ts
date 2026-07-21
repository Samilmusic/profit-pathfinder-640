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

export type QualityMode = "all" | "exclude_invalid" | "exclude_suspicious";
export type QualityClass = "valid" | "suspicious" | "invalid";
export type QualitySeverity = "info" | "warning" | "critical";

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
  quality_mode: QualityMode;
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

export async function fetchExecutiveKpis(mode: QualityMode = "all"): Promise<ExecutiveKpis> {
  const { data, error } = await supabase.rpc("report_executive_kpis", { _quality_mode: mode });
  if (error) throw error;
  return data as unknown as ExecutiveKpis;
}

export async function fetchOperationalKpis(): Promise<OperationalKpis> {
  const { data, error } = await supabase.rpc("report_operational_kpis");
  if (error) throw error;
  return data as unknown as OperationalKpis;
}

// -------------------- Data Quality --------------------

export type DataQualityRow = {
  id: string;
  source_table: "sell_transactions" | "remittances";
  entry_date: string | null;
  closed_at: string | null;
  classification: QualityClass;
  severity: QualitySeverity;
  reason: string | null;
  suggested_remediation: string | null;
  details: Record<string, unknown>;
  customer_id: string | null;
  created_by: string | null;
};

export type DataQualitySummary = {
  meta: ReportMeta;
  by_source: Array<{ source_table: string; classification: QualityClass; n: number }>;
  by_class: Partial<Record<QualityClass, number>>;
  by_severity: Partial<Record<QualitySeverity, number>>;
  executive_impact: {
    total_amount_aed_all: number;
    total_amount_aed_exclude_invalid: number;
    total_amount_aed_exclude_suspicious: number;
  };
};

export async function fetchDataQualitySummary(): Promise<DataQualitySummary> {
  const { data, error } = await supabase.rpc("report_data_quality_summary");
  if (error) throw error;
  return data as unknown as DataQualitySummary;
}

export async function fetchDataQualityRows(opts: {
  classification?: QualityClass | "any";
  severity?: QualitySeverity | "any";
  source?: "sell_transactions" | "remittances" | "any";
  limit?: number;
} = {}): Promise<DataQualityRow[]> {
  let q = supabase.from("v_data_quality").select("*").order("closed_at", { ascending: false, nullsFirst: false });
  if (opts.classification && opts.classification !== "any") q = q.eq("classification", opts.classification);
  if (opts.severity && opts.severity !== "any") q = q.eq("severity", opts.severity);
  if (opts.source && opts.source !== "any") q = q.eq("source_table", opts.source);
  q = q.limit(opts.limit ?? 500);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as DataQualityRow[];
}

// -------------------- Profit Analytics (Slice 2) --------------------

export type Granularity = "day" | "week" | "month" | "year";
export type BreakdownDim =
  | "customer"
  | "supplier"
  | "currency"
  | "buy_lot"
  | "operator"
  | "payment_destination";

export type ReportEnvelope = {
  meta: ReportMeta;
  quality_mode: QualityMode;
  rows_included: number;
  rows_excluded: number;
  date_from: string;
  date_to: string;
};

export type ProfitSeriesResponse = ReportEnvelope & {
  granularity: Granularity;
  series: Array<{ bucket_start: string; profit_aed: number; events: number }>;
};

export type ProfitBreakdownBucket = {
  key: string | null;
  label: string;
  events: number;
  profit_aed: number;
  spread_aed: number;
  commission_aed: number;
};

export type ProfitBreakdownResponse = ReportEnvelope & {
  dimension: BreakdownDim;
  limit: number;
  buckets: ProfitBreakdownBucket[];
};

export type ProfitLeader = {
  source: "sell" | "remittance";
  ref_id: string;
  doc_no: string | null;
  customer_id: string | null;
  currency: string;
  profit_aed: number;
  event_date: string;
};

export type ProfitSummaryResponse = ReportEnvelope & {
  limit: number;
  total_profit_aed: number;
  avg_spread_aed: number;
  avg_commission_aed: number;
  top_winners: ProfitLeader[];
  top_losers: ProfitLeader[];
};

type SeriesArgs = { quality_mode: QualityMode; granularity: Granularity; from?: string | null; to?: string | null };
type BreakdownArgs = { quality_mode: QualityMode; dimension: BreakdownDim; from?: string | null; to?: string | null; limit?: number };
type SummaryArgs = { quality_mode: QualityMode; from?: string | null; to?: string | null; limit?: number };

export async function fetchProfitSeries(a: SeriesArgs): Promise<ProfitSeriesResponse> {
  const { data, error } = await supabase.rpc("report_profit_series", {
    _quality_mode: a.quality_mode,
    _granularity: a.granularity,
    _from: a.from ?? null,
    _to: a.to ?? null,
  });
  if (error) throw error;
  return data as unknown as ProfitSeriesResponse;
}

export async function fetchProfitBreakdown(a: BreakdownArgs): Promise<ProfitBreakdownResponse> {
  const { data, error } = await supabase.rpc("report_profit_breakdown", {
    _quality_mode: a.quality_mode,
    _dimension: a.dimension,
    _from: a.from ?? null,
    _to: a.to ?? null,
    _limit: a.limit ?? 25,
  });
  if (error) throw error;
  return data as unknown as ProfitBreakdownResponse;
}

export async function fetchProfitSummary(a: SummaryArgs): Promise<ProfitSummaryResponse> {
  const { data, error } = await supabase.rpc("report_profit_summary", {
    _quality_mode: a.quality_mode,
    _from: a.from ?? null,
    _to: a.to ?? null,
    _limit: a.limit ?? 10,
  });
  if (error) throw error;
  return data as unknown as ProfitSummaryResponse;
}