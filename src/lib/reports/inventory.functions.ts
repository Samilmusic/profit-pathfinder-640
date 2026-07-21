/**
 * Reporting — Inventory Analytics (Phase 6 Slice 4)
 * Version: 1.0.0
 *
 * READ-ONLY wrappers around the server-authoritative inventory RPCs:
 *   - report_inventory_overview
 *   - report_inventory_lots
 *   - report_inventory_lot_detail
 *   - report_inventory_timeline
 *   - report_inventory_consumption
 *
 * All aggregation, FX conversion, unrealized P&L, and market comparisons
 * are computed in SQL. Market comparison uses only persisted snapshots via
 * `v_market_rate_latest`; live rate lookups are forbidden here.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QualityMode, ReportMeta } from "@/lib/reports/executive.functions";

export type InventoryOverviewArgs = {
  quality_mode?: QualityMode;
  from?: string | null;
  to?: string | null;
  currency?: string | null;
  account_id?: string | null;
  status?: string | null;
  source_ref_type?: string | null;
  operator_id?: string | null;
};

export type InventoryOverviewKpis = {
  total_lots: number;
  available_lots: number;
  partial_lots: number;
  depleted_lots: number;
  remaining_cost_aed: number;
  consumed_cost_aed: number;
  original_cost_aed: number;
  oldest_entry_date: string | null;
  newest_entry_date: string | null;
  avg_age_days: number | null;
  utilization_pct: number | null;
  turnover_ratio: number | null;
  aed_market_snapshot_rate: number | null;
};

export type InventoryAgingBucket = {
  bucket: string;
  lot_count: number;
  remaining_amount: number;
  remaining_cost: number;
  remaining_cost_aed: number | null;
  original_cost: number;
  pct_of_remaining: number | null;
};

export type InventoryCurrencyRow = {
  currency: string;
  cost_basis_currency: string | null;
  original_amount: number;
  remaining_amount: number;
  consumed_amount: number;
  original_cost: number;
  remaining_cost: number;
  consumed_cost: number;
  wap_cost_rate: number | null;
  lot_count: number;
  available_lots: number;
  partial_lots: number;
  depleted_lots: number;
  oldest_entry_date: string | null;
  newest_entry_date: string | null;
  avg_age_days: number | null;
  utilization_pct: number | null;
};

export type InventoryAccountRow = {
  account_id: string;
  account_name: string | null;
  account_owner: string | null;
  lot_count: number;
  original_amount: number;
  remaining_amount: number;
  consumed_amount: number;
  original_cost: number;
  remaining_cost: number;
  consumed_cost: number;
  remaining_cost_aed: number | null;
  currencies: string[];
  largest_lot_amount: number;
  oldest_entry: string | null;
  newest_entry: string | null;
  utilization_pct: number | null;
};

export type InventoryMarketRow = {
  currency: string;
  cost_basis_currency: string | null;
  wap_cost_rate: number | null;
  market_mid: number | null;
  market_snapshot_at: string | null;
  market_snapshot_source: string | null;
  remaining_amount: number;
  remaining_cost: number;
  estimated_market_value_aed: number | null;
  remaining_cost_aed: number | null;
  unrealized_pnl_aed: number | null;
};

export type InventoryOverviewResponse = {
  meta: ReportMeta;
  quality_mode: QualityMode;
  date_from: string;
  date_to: string;
  rows_included: number;
  rows_excluded: number;
  kpis: InventoryOverviewKpis;
  aging: InventoryAgingBucket[];
  by_currency: InventoryCurrencyRow[];
  by_account: InventoryAccountRow[];
  market: InventoryMarketRow[];
};

export async function fetchInventoryOverview(
  a: InventoryOverviewArgs = {},
): Promise<InventoryOverviewResponse> {
  const { data, error } = await supabase.rpc("report_inventory_overview", {
    _quality_mode: a.quality_mode ?? "exclude_invalid",
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
    _currency: a.currency ?? undefined,
    _account_id: a.account_id ?? undefined,
    _status: a.status ?? undefined,
    _source_ref_type: a.source_ref_type ?? undefined,
    _operator_id: a.operator_id ?? undefined,
  });
  if (error) throw error;
  return data as unknown as InventoryOverviewResponse;
}

// -------------------- Lots --------------------

export type InventoryLotRow = {
  lot_id: string;
  lot_code: string;
  currency: string;
  account_id: string;
  account_name: string | null;
  account_owner: string | null;
  account_currency: string | null;
  entry_date: string;
  created_at: string;
  created_by: string | null;
  operator_name: string | null;
  operator_label: string | null;
  status: "available" | "partial" | "depleted";
  original_amount: number;
  remaining_amount: number;
  consumed_amount: number;
  original_cost: number;
  remaining_cost: number;
  consumed_cost: number;
  cost_basis_rate: number | null;
  cost_basis_currency: string | null;
  cost_basis_status: string | null;
  age_days: number;
  age_bucket: string;
  source_ref_type: string | null;
  source_ref_id: string | null;
  source_description: string | null;
  notes: string | null;
};

export type InventoryLotsArgs = InventoryOverviewArgs & {
  age_bucket?: string | null;
  search?: string | null;
  sort?: string;
  limit?: number;
  offset?: number;
};

export type InventoryLotsResponse = {
  meta: ReportMeta;
  quality_mode: QualityMode;
  date_from: string;
  date_to: string;
  rows_included: number;
  rows_excluded: number;
  total: number;
  limit: number;
  offset: number;
  sort: string;
  search: string | null;
  rows: InventoryLotRow[];
};

export async function fetchInventoryLots(
  a: InventoryLotsArgs = {},
): Promise<InventoryLotsResponse> {
  const { data, error } = await supabase.rpc("report_inventory_lots", {
    _quality_mode: a.quality_mode ?? "exclude_invalid",
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
    _currency: a.currency ?? undefined,
    _account_id: a.account_id ?? undefined,
    _status: a.status ?? undefined,
    _age_bucket: a.age_bucket ?? undefined,
    _source_ref_type: a.source_ref_type ?? undefined,
    _operator_id: a.operator_id ?? undefined,
    _search: a.search ?? undefined,
    _sort: a.sort ?? "entry_desc",
    _limit: a.limit ?? 50,
    _offset: a.offset ?? 0,
  });
  if (error) throw error;
  return data as unknown as InventoryLotsResponse;
}

// -------------------- Lot Detail --------------------

export type InventoryLotDetailResponse = {
  meta: ReportMeta;
  lot: (InventoryLotRow & Record<string, unknown>) | null;
  consumption: Array<{
    consumption_id: string;
    sell_ref_type: string;
    sell_ref_id: string;
    currency: string;
    amount: number;
    cost_rate: number;
    cost_amount: number;
    entry_date: string;
    created_at: string;
  }>;
  allocations: Array<{
    allocation_id: string;
    remittance_id: string;
    currency: string;
    allocated_amount: number;
    status: string;
    entry_kind: string;
    created_at: string;
  }>;
  related_sells: Array<{
    sell_id: string;
    doc_no: string | null;
    entry_date: string;
    sold_currency: string | null;
    sold_amount: number | null;
    received_currency: string | null;
    received_amount: number | null;
    net_profit_aed: number | null;
  }>;
  related_remittances: Array<{
    remittance_id: string;
    doc_no: string | null;
    entry_date: string;
    transfer_currency: string | null;
    transferred_amount: number | null;
    workflow_state: string | null;
  }>;
};

export async function fetchInventoryLotDetail(
  lotId: string,
): Promise<InventoryLotDetailResponse> {
  const { data, error } = await supabase.rpc("report_inventory_lot_detail", {
    _lot_id: lotId,
  });
  if (error) throw error;
  return data as unknown as InventoryLotDetailResponse;
}

// -------------------- Timeline --------------------

export type InventoryTimelineArgs = {
  granularity?: "day" | "week" | "month" | "year";
  from?: string | null;
  to?: string | null;
  currency?: string | null;
  account_id?: string | null;
};

export type InventoryTimelineBucket = {
  bucket_start: string;
  lots_added: number;
  added_amount: number;
  added_cost: number;
  consumption_events: number;
  consumed_amount: number;
  consumed_cost: number;
  net_amount: number;
  net_cost: number;
};

export type InventoryTimelineResponse = {
  meta: ReportMeta;
  granularity: string;
  date_from: string;
  date_to: string;
  series: InventoryTimelineBucket[];
};

export async function fetchInventoryTimeline(
  a: InventoryTimelineArgs = {},
): Promise<InventoryTimelineResponse> {
  const { data, error } = await supabase.rpc("report_inventory_timeline", {
    _granularity: a.granularity ?? "day",
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
    _currency: a.currency ?? undefined,
    _account_id: a.account_id ?? undefined,
  });
  if (error) throw error;
  return data as unknown as InventoryTimelineResponse;
}

// -------------------- Consumption --------------------

export type ConsumptionLotRow = {
  lot_id: string;
  lot_code: string;
  currency: string;
  account_id: string;
  entry_date: string;
  consumption_events: number;
  original_amount: number;
  consumed_amount: number;
  remaining_amount: number;
  consumed_pct: number | null;
  first_consumption: string | null;
  last_consumption: string | null;
  delay_seconds: number | null;
  span_seconds: number | null;
};

export type InventoryConsumptionResponse = {
  meta: ReportMeta;
  quality_mode: QualityMode;
  date_from: string;
  date_to: string;
  most_consumed_lots: ConsumptionLotRow[];
  least_consumed_lots: ConsumptionLotRow[];
  fastest_consumed_lots: ConsumptionLotRow[];
  slowest_consumed_lots: ConsumptionLotRow[];
  avg_consumption_delay_seconds: number | null;
  consumption_velocity_per_day: number | null;
  remaining_lifetime_days: number | null;
};

export async function fetchInventoryConsumption(
  a: InventoryOverviewArgs & { limit?: number } = {},
): Promise<InventoryConsumptionResponse> {
  const { data, error } = await supabase.rpc("report_inventory_consumption", {
    _quality_mode: a.quality_mode ?? "exclude_invalid",
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
    _currency: a.currency ?? undefined,
    _account_id: a.account_id ?? undefined,
    _limit: a.limit ?? 10,
  });
  if (error) throw error;
  return data as unknown as InventoryConsumptionResponse;
}

// -------------------- CSV meta helpers --------------------

export function buildInventoryCsvMeta(r: {
  meta: ReportMeta;
  quality_mode?: QualityMode;
  date_from?: string;
  date_to?: string;
  rows_included?: number;
  rows_excluded?: number;
}): string[] {
  return [
    `# report=${r.meta.report_key}`,
    `# version=${r.meta.report_version}`,
    `# generated_at=${r.meta.generated_at}`,
    `# data_cutoff=${r.meta.data_cutoff}`,
    `# generated_by_version=${r.meta.generated_by_version}`,
    `# quality_mode=${r.quality_mode ?? "n/a"}`,
    `# date_from=${r.date_from ?? "n/a"}`,
    `# date_to=${r.date_to ?? "n/a"}`,
    `# rows_included=${r.rows_included ?? "n/a"}`,
    `# rows_excluded=${r.rows_excluded ?? "n/a"}`,
  ];
}

export function downloadCsv(filename: string, meta: string[], header: string[], body: string[]) {
  const csv = [...meta, header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}