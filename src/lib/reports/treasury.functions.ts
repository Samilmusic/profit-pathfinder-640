/**
 * Reporting — Treasury & Cash Intelligence (Phase 6 Slice 5)
 * Version: 1.0.0
 * READ-ONLY wrappers around server-authoritative treasury RPCs.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QualityMode, ReportMeta } from "@/lib/reports/executive.functions";

export type TreasuryOverviewArgs = {
  quality_mode?: QualityMode;
  currency?: string | null;
  account_id?: string | null;
  owner?: string | null;
  from?: string | null;
  to?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

export type TreasuryOverviewResponse = {
  meta: ReportMeta;
  quality_mode: QualityMode;
  date_from: string;
  date_to: string;
  kpis: {
    total_accounts: number;
    accounts_with_balance: number;
    total_aed_equiv: number | null;
    aed_snapshot_rate: number | null;
    oldest_activity: string | null;
    newest_activity: string | null;
  };
  by_currency: J[];
  by_account: J[];
  by_owner: J[];
  largest_balances: J[];
  dormant_accounts: J[];
  reserved: J[];
  pending: J[];
  expected_inflows: J[];
  expected_outflows: J[];
  largest_daily_movement: J | null;
};

export async function fetchTreasuryOverview(a: TreasuryOverviewArgs = {}): Promise<TreasuryOverviewResponse> {
  const { data, error } = await supabase.rpc("report_treasury_overview", {
    _quality_mode: a.quality_mode ?? "exclude_invalid",
    _currency: a.currency ?? undefined,
    _account_id: a.account_id ?? undefined,
    _owner: a.owner ?? undefined,
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
  });
  if (error) throw error;
  return data as unknown as TreasuryOverviewResponse;
}

export type CashflowArgs = {
  granularity?: "day" | "week" | "month" | "year";
  from?: string | null;
  to?: string | null;
  currency?: string | null;
  account_id?: string | null;
  owner?: string | null;
  forecast_days?: number;
};

export type CashflowResponse = {
  meta: ReportMeta;
  granularity: string;
  date_from: string;
  date_to: string;
  forecast_days: number;
  series: J[];
  forecast: J[];
  forecast_stats: J;
  forecast_note: string;
};

export async function fetchCashflow(a: CashflowArgs = {}): Promise<CashflowResponse> {
  const { data, error } = await supabase.rpc("report_treasury_cashflow", {
    _granularity: a.granularity ?? "day",
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
    _currency: a.currency ?? undefined,
    _account_id: a.account_id ?? undefined,
    _owner: a.owner ?? undefined,
    _forecast_days: a.forecast_days ?? 14,
  });
  if (error) throw error;
  return data as unknown as CashflowResponse;
}

export type CurrencyExposureResponse = {
  meta: ReportMeta;
  date_from: string;
  date_to: string;
  rows: J[];
  trend: J[];
};

export async function fetchCurrencyExposure(from?: string | null, to?: string | null): Promise<CurrencyExposureResponse> {
  const { data, error } = await supabase.rpc("report_currency_exposure", {
    _from: from ?? undefined,
    _to: to ?? undefined,
  });
  if (error) throw error;
  return data as unknown as CurrencyExposureResponse;
}

export type BankAnalyticsArgs = {
  from?: string | null;
  to?: string | null;
  currency?: string | null;
  owner?: string | null;
  limit?: number;
  offset?: number;
};

export type BankAnalyticsResponse = {
  meta: ReportMeta;
  date_from: string;
  date_to: string;
  total: number;
  limit: number;
  offset: number;
  rows: J[];
};

export async function fetchBankAccountAnalytics(a: BankAnalyticsArgs = {}): Promise<BankAnalyticsResponse> {
  const { data, error } = await supabase.rpc("report_bank_account_analytics", {
    _from: a.from ?? undefined,
    _to: a.to ?? undefined,
    _currency: a.currency ?? undefined,
    _owner: a.owner ?? undefined,
    _limit: a.limit ?? 100,
    _offset: a.offset ?? 0,
  });
  if (error) throw error;
  return data as unknown as BankAnalyticsResponse;
}

export type AccountDetailResponse = {
  meta: ReportMeta;
  date_from: string;
  date_to: string;
  account: J;
  series: J[];
  transactions: J[];
};

export async function fetchAccountDetail(accountId: string, from?: string | null, to?: string | null): Promise<AccountDetailResponse> {
  const { data, error } = await supabase.rpc("report_treasury_account_detail", {
    _account_id: accountId,
    _from: from ?? undefined,
    _to: to ?? undefined,
  });
  if (error) throw error;
  return data as unknown as AccountDetailResponse;
}

export function buildTreasuryCsvMeta(meta: ReportMeta, extras: Record<string, string | number | null | undefined> = {}): string[] {
  const base = [
    `# report=${meta.report_key}`,
    `# version=${meta.report_version}`,
    `# generated_at=${meta.generated_at}`,
    `# data_cutoff=${meta.data_cutoff}`,
    `# generated_by_version=${meta.generated_by_version}`,
  ];
  for (const [k, v] of Object.entries(extras)) base.push(`# ${k}=${v ?? "n/a"}`);
  return base;
}

export function downloadCsv(filename: string, meta: string[], header: string[], body: string[]) {
  const csv = [...meta, header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
