/**
 * Reporting — Enterprise Administration (Phase 6 Slice 7)
 * Version: 1.0.0
 *
 * READ-ONLY wrappers over admin/reporting-health RPCs.
 * Admin/manager/partner/accountant gated server-side.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ReportMeta } from "@/lib/reports/executive.functions";

export type SystemHealth = {
  meta: ReportMeta;
  db: {
    server_version: string;
    server_version_num: string;
    database: string;
    size_bytes: number;
    now: string;
    timezone: string;
  };
  extensions: { name: string; version: string }[];
  feature_flags: {
    key: string;
    enabled: boolean;
    description: string | null;
    updated_at: string;
  }[];
  data_quality: { total: number; invalid: number; suspicious: number; valid: number };
  last_reconciliation: { run_at: string | null; row_count: number };
  matviews: { schema: string; name: string }[];
  report_functions: { name: string; args: number }[];
  report_function_count: number;
  table_count: number;
  view_count: number;
  pg_stat_statements_available: boolean;
  pg_cron_available: boolean;
  background_jobs: unknown[];
  auth_users: number;
  user_roles_count: number;
};

export async function fetchSystemHealth(): Promise<SystemHealth> {
  const { data, error } = await supabase.rpc("report_system_health");
  if (error) throw error;
  return data as unknown as SystemHealth;
}

export type ReportingHealth = {
  meta: ReportMeta;
  summary: {
    total: number;
    valid: number;
    suspicious: number;
    invalid: number;
    included_in_executive: number;
    excluded_in_executive: number;
  };
  by_source: {
    source_table: string;
    total: number;
    valid: number;
    suspicious: number;
    invalid: number;
  }[];
  report_query_stats: SlowQueryRow[];
  pg_stat_statements_available: boolean;
};

export async function fetchReportingHealth(): Promise<ReportingHealth> {
  const { data, error } = await supabase.rpc("report_reporting_health");
  if (error) throw error;
  return data as unknown as ReportingHealth;
}

export type SlowQueryRow = {
  query: string;
  calls: number;
  total_ms: number;
  mean_ms: number;
  max_ms: number;
  rows: number;
};

export type SlowQueriesResponse = {
  meta: ReportMeta;
  available: boolean;
  rows: SlowQueryRow[];
};

export async function fetchSlowQueries(limit = 25): Promise<SlowQueriesResponse> {
  const { data, error } = await supabase.rpc("report_slow_queries", { _limit: limit });
  if (error) throw error;
  return data as unknown as SlowQueriesResponse;
}

export type BiReportEntry = {
  key: string;
  route: string;
  rpc: string;
  version: string;
  slice: number;
  read_only: boolean;
};

export type BiInventory = {
  meta: ReportMeta;
  reports: BiReportEntry[];
  export_formats: string[];
  metadata_fields: string[];
};

export async function fetchBiInventory(): Promise<BiInventory> {
  const { data, error } = await supabase.rpc("report_bi_inventory");
  if (error) throw error;
  return data as unknown as BiInventory;
}

export type AlertLevel = "critical" | "warning" | "info";
export type Alert = {
  key: string;
  category: string;
  level: AlertLevel;
  title: string;
  message: string;
  metric: Record<string, unknown>;
  raised_at: string;
  dismissed: boolean;
  dismissed_meta: {
    dismissed_at: string;
    dismissed_by: string | null;
    reason: string | null;
  } | null;
};

export type BusinessAlertsResponse = {
  meta: ReportMeta;
  thresholds: Record<string, number>;
  counts: { total: number; critical: number; warning: number; info: number };
  alerts: Alert[];
};

export async function fetchBusinessAlerts(
  includeDismissed = false,
  thresholds: Record<string, number> = {},
): Promise<BusinessAlertsResponse> {
  const { data, error } = await supabase.rpc("report_business_alerts", {
    _include_dismissed: includeDismissed,
    _thresholds: thresholds as unknown as Record<string, never>,
  });
  if (error) throw error;
  return data as unknown as BusinessAlertsResponse;
}

export async function dismissAlert(key: string, reason?: string): Promise<string> {
  const { data, error } = await supabase.rpc("admin_alert_dismiss", {
    _key: key,
    _reason: reason ?? undefined,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function undismissAlert(key: string): Promise<number> {
  const { data, error } = await supabase.rpc("admin_alert_undismiss", { _key: key });
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

export type DismissHistoryRow = {
  id: string;
  alert_key: string;
  dismissed_by: string | null;
  dismissed_at: string;
  reason: string | null;
  active: boolean;
};

export async function fetchAlertHistory(
  limit = 200,
): Promise<{ meta: ReportMeta; rows: DismissHistoryRow[] }> {
  const { data, error } = await supabase.rpc("admin_alert_dismiss_history", { _limit: limit });
  if (error) throw error;
  return data as unknown as { meta: ReportMeta; rows: DismissHistoryRow[] };
}

// Generic export helpers (CSV with standard metadata header)
export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  meta: ReportMeta,
  extras: Record<string, unknown> = {},
): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const metaLines = [
    `# report=${meta.report_key}`,
    `# report_version=${meta.report_version}`,
    `# generated_at=${meta.generated_at}`,
    `# generated_by_version=${meta.generated_by_version}`,
    `# data_cutoff=${meta.data_cutoff}`,
    ...Object.entries(extras).map(([k, v]) => `# ${k}=${String(v)}`),
  ];
  return [...metaLines, headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join(
    "\n",
  );
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}
