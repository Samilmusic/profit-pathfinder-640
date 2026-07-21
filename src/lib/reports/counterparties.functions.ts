/**
 * Reporting — Customer & Supplier Analytics (Phase 6 Slice 3)
 * Version: 1.0.0
 *
 * READ-ONLY. Wraps `report_customer_list`, `report_customer_detail`,
 * `report_supplier_list`, `report_supplier_detail`. Server-authoritative
 * math (proportional multi-lot attribution, workflow-derived durations,
 * deterministic risk/reliability scoring). No live rates.
 */

import { supabase } from "@/integrations/supabase/client";
import type { ReportMeta, QualityMode } from "@/lib/reports/executive.functions";

export type ReportEnvelope<T> = {
  meta: ReportMeta;
  quality_mode: QualityMode;
  date_from: string;
  date_to: string;
  rows_included: number;
  rows_excluded: number;
} & T;

// -------------------- Customers --------------------

export type CustomerListRow = {
  customer_id: string;
  name: string | null;
  phone: string | null;
  trade_count: number;
  lifetime_profit_aed: number;
  lifetime_volume_aed: number;
  avg_profit_aed: number | null;
  avg_spread_aed: number | null;
  avg_commission_aed: number | null;
  largest_profit_aed: number | null;
  largest_loss_aed: number | null;
  preferred_currency: string | null;
  preferred_destination_id: string | null;
  most_active_month: string | null;
  events_30d: number;
  events_90d: number;
  first_event_at: string | null;
  last_event_at: string | null;
  rem_total: number;
  rem_open: number;
  rem_closed: number;
  rem_cancelled: number;
  avg_settle_seconds: number | null;
  avg_alloc_seconds: number | null;
  avg_close_seconds: number | null;
  success_rate: number | null;
  cancel_rate: number | null;
  loss_rate: number | null;
  dormant_days: number | null;
  risk_points: number;
  risk_level: "low" | "medium" | "high" | "unknown";
};

export type CustomerListResponse = ReportEnvelope<{
  total: number;
  limit: number;
  offset: number;
  sort: string;
  search: string | null;
  rows: CustomerListRow[];
}>;

export type CustomerListArgs = {
  quality_mode?: QualityMode;
  from?: string | null;
  to?: string | null;
  search?: string | null;
  sort?: string;
  limit?: number;
  offset?: number;
};

export async function fetchCustomerList(a: CustomerListArgs = {}): Promise<CustomerListResponse> {
  const { data, error } = await supabase.rpc("report_customer_list", {
    _quality_mode: a.quality_mode ?? "exclude_invalid",
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
    _search: a.search ?? undefined,
    _sort: a.sort ?? "profit_desc",
    _limit: a.limit ?? 50,
    _offset: a.offset ?? 0,
  });
  if (error) throw error;
  return data as unknown as CustomerListResponse;
}

export type CustomerDetailResponse = ReportEnvelope<{
  customer: { id: string; name: string | null; phone: string | null; notes: string | null; created_at: string } | null;
  totals: {
    event_count: number;
    profit_total_aed: number;
    volume_total_aed: number;
    largest_profit_aed: number | null;
    largest_loss_aed: number | null;
    avg_profit_aed: number | null;
    avg_spread_aed: number | null;
    avg_commission_aed: number | null;
  } | null;
  monthly: Array<{ bucket: string; profit_aed: number; volume_aed: number; events: number }>;
  recent: Array<{
    source: "sell" | "remittance";
    ref_id: string;
    doc_no: string | null;
    currency: string;
    amount_aed: number;
    event_at: string;
    classification: string | null;
    severity: string | null;
    operator_label: string | null;
  }>;
  settlement_timeline: Array<{
    remittance_id: string;
    doc_no: string | null;
    from_state: string | null;
    to_state: string;
    reason: string | null;
    created_at: string;
    actor_label: string | null;
  }>;
  allocation_history: Array<{
    id: string;
    remittance_id: string;
    doc_no: string | null;
    buy_id: string | null;
    currency: string;
    allocated_amount: number;
    status: string;
    entry_kind: string;
    frozen_total_profit_aed: number | null;
    created_at: string;
  }>;
}>;

export async function fetchCustomerDetail(
  customer_id: string,
  quality_mode: QualityMode = "exclude_invalid",
  from?: string | null,
  to?: string | null,
): Promise<CustomerDetailResponse> {
  const { data, error } = await supabase.rpc("report_customer_detail", {
    _customer_id: customer_id,
    _quality_mode: quality_mode,
    _from: from ?? undefined,
    _to: to ?? undefined,
  });
  if (error) throw error;
  return data as unknown as CustomerDetailResponse;
}

// -------------------- Suppliers --------------------

export type SupplierListRow = {
  supplier_id: string;
  supplier_name: string | null;
  phone: string | null;
  delivered_count: number;
  delivered_profit_aed: number;
  delivered_volume_aed: number;
  avg_profit_aed: number | null;
  rem_total: number;
  rem_closed: number;
  rem_cancelled: number;
  rem_open: number;
  avg_delivery_seconds: number | null;
  median_delivery_seconds: number | null;
  late_deliveries: number;
  alloc_total: number;
  alloc_reversed: number;
  alloc_delay_seconds: number | null;
  avg_remittance_amount: number | null;
  currencies_served: string[] | null;
  top_customers: Array<{ customer_id: string; customer_name: string | null; n: number }> | null;
  cancel_rate: number | null;
  alloc_success_rate: number | null;
  on_time_rate: number | null;
  sample_ratio: number;
  reliability_score: number;
};

export type SupplierListResponse = ReportEnvelope<{
  total: number;
  limit: number;
  offset: number;
  sort: string;
  search: string | null;
  rows: SupplierListRow[];
}>;

export type SupplierListArgs = {
  quality_mode?: QualityMode;
  from?: string | null;
  to?: string | null;
  search?: string | null;
  sort?: string;
  limit?: number;
  offset?: number;
};

export async function fetchSupplierList(a: SupplierListArgs = {}): Promise<SupplierListResponse> {
  const { data, error } = await supabase.rpc("report_supplier_list", {
    _quality_mode: a.quality_mode ?? "exclude_invalid",
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
    _search: a.search ?? undefined,
    _sort: a.sort ?? "volume_desc",
    _limit: a.limit ?? 50,
    _offset: a.offset ?? 0,
  });
  if (error) throw error;
  return data as unknown as SupplierListResponse;
}

export type SupplierDetailResponse = ReportEnvelope<{
  supplier: { id: string; name: string | null; phone: string | null; notes: string | null; created_at: string } | null;
  totals: {
    event_count: number;
    profit_total_aed: number;
    volume_total_aed: number;
    largest_profit_aed: number | null;
    largest_loss_aed: number | null;
    avg_profit_aed: number | null;
  } | null;
  monthly: Array<{ bucket: string; profit_aed: number; volume_aed: number; events: number }>;
  outstanding: Array<{
    id: string;
    doc_no: string | null;
    entry_date: string;
    transferred_amount: number | null;
    transfer_currency: string;
    workflow_state: string;
    status: string;
  }>;
  completed: Array<{
    id: string;
    doc_no: string | null;
    entry_date: string;
    transferred_amount: number | null;
    transfer_currency: string;
    total_profit_aed: number | null;
    settle_seconds: number | null;
    close_seconds: number | null;
  }>;
}>;

export async function fetchSupplierDetail(
  supplier_id: string,
  quality_mode: QualityMode = "exclude_invalid",
  from?: string | null,
  to?: string | null,
): Promise<SupplierDetailResponse> {
  const { data, error } = await supabase.rpc("report_supplier_detail", {
    _supplier_id: supplier_id,
    _quality_mode: quality_mode,
    _from: from ?? undefined,
    _to: to ?? undefined,
  });
  if (error) throw error;
  return data as unknown as SupplierDetailResponse;
}

// -------------------- Small helpers --------------------

export const formatDurationSeconds = (s: number | null | undefined): string => {
  if (s === null || s === undefined || !Number.isFinite(s)) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
};

export const buildCsvMetaHeader = (r: {
  meta: ReportMeta;
  quality_mode: QualityMode;
  date_from: string;
  date_to: string;
  rows_included: number;
  rows_excluded: number;
}): string[] => [
  `# report=${r.meta.report_key}`,
  `# version=${r.meta.report_version}`,
  `# generated_at=${r.meta.generated_at}`,
  `# data_cutoff=${r.meta.data_cutoff}`,
  `# generated_by_version=${r.meta.generated_by_version}`,
  `# quality_mode=${r.quality_mode}`,
  `# date_from=${r.date_from}`,
  `# date_to=${r.date_to}`,
  `# rows_included=${r.rows_included}`,
  `# rows_excluded=${r.rows_excluded}`,
];

export const downloadCsv = (filename: string, lines: string[]) => {
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};