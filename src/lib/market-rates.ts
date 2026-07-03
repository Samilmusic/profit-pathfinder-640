import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MarketRateRow = {
  id: string;
  source: string;
  currency: string;
  buy_rate: number | null;
  sell_rate: number | null;
  mid_rate: number | null;
  fetched_at: string;
  status: string;
  error_message: string | null;
  source_unit?: string | null;
  source_buy_rate?: number | null;
  source_sell_rate?: number | null;
  source_mid_rate?: number | null;
};

export type MarketRateRecentRow = MarketRateRow & { rn: number };

export type MarketRateFetchRow = {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  success_count: number;
  failed_count: number;
  currencies: Record<string, { ok: boolean; buy: number | null; sell: number | null; error?: string }> | null;
  error_message: string | null;
  triggered_by: string | null;
};

export type MarketRateDelta = {
  currency: string;
  current_buy: number | null;
  current_sell: number | null;
  current_mid: number | null;
  fetched_at: string;
  mid_5m: number | null;
  mid_15m: number | null;
  mid_1h: number | null;
  mid_24h: number | null;
  pct_5m: number | null;
  pct_15m: number | null;
  pct_1h: number | null;
  pct_24h: number | null;
};

export type InventoryExposureRow = {
  currency: string;
  available: number;
  avg_cost: number;
  cost_ccy: string | null;
  market_buy: number | null;
  market_sell: number | null;
  market_mid: number | null;
  market_fetched_at: string | null;
  unrealized_pl: number | null;
  unrealized_pl_pct: number | null;
};

export type MarketNotificationRow = {
  id: string;
  kind: string;
  severity: "info" | "warn" | "danger" | string;
  currency: string | null;
  title: string;
  body: string | null;
  metadata: any;
  ref_type: string | null;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type AlertThresholds = {
  alert_drop_pct_15min: number;
  alert_rise_pct_15min: number;
  alert_volatility_pct_1h: number;
  alert_stale_minutes: number;
  alert_near_cost_pct: number;
};

export function useLatestMarketRates() {
  return useQuery({
    queryKey: ["market_rates_latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_rates_latest" as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as MarketRateRow[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Latest + previous successful bonbast readings per currency (for trend arrows). */
export function useRecentMarketRates() {
  return useQuery({
    queryKey: ["market_rates_recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_rates_recent" as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as MarketRateRecentRow[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarketRateFetches(limit = 20) {
  return useQuery({
    queryKey: ["market_rate_fetches", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_rate_fetches" as any)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as MarketRateFetchRow[];
    },
    refetchInterval: 60_000,
  });
}

export function useMarketRateHistory(currency: string, hours = 24) {
  return useQuery({
    queryKey: ["market_rate_history", currency, hours],
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("market_rates")
        .select("fetched_at,buy_rate,sell_rate,mid_rate,status")
        .eq("currency", currency)
        .eq("status", "ok")
        .gte("fetched_at", since)
        .order("fetched_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

export function rateFreshness(fetchedAt?: string | null) {
  if (!fetchedAt) return { label: "No data", tone: "danger" as const, minutes: Infinity };
  const mins = (Date.now() - new Date(fetchedAt).getTime()) / 60_000;
  if (mins <= 6) return { label: "Live", tone: "ok" as const, minutes: mins };
  if (mins <= 15) return { label: "Delayed", tone: "warn" as const, minutes: mins };
  return { label: "Stale", tone: "danger" as const, minutes: mins };
}

export function findRate(rates: MarketRateRow[] | undefined, currency: string) {
  // Legacy helper — returns the first row for the currency (bonbast if present).
  return rates?.find((r) => r.currency === currency);
}

/**
 * Pick the rate to display for a currency:
 *  - bonbast if fresh (≤15 minutes),
 *  - else manual if it exists and is newer or bonbast is stale,
 *  - else stale bonbast (last known).
 */
export function pickDisplayRate(
  rates: MarketRateRow[] | undefined,
  currency: string,
): { row?: MarketRateRow; usedFallback: boolean; manualAvailable: boolean } {
  const rows = (rates ?? []).filter((r) => r.currency === currency);
  const bonbast = rows.find((r) => r.source === "bonbast");
  const manual = rows.find((r) => r.source === "manual");
  const bonbastFresh = bonbast && rateFreshness(bonbast.fetched_at).tone === "ok";
  if (bonbastFresh) return { row: bonbast, usedFallback: false, manualAvailable: !!manual };
  if (manual) return { row: manual, usedFallback: !!bonbast, manualAvailable: true };
  return { row: bonbast, usedFallback: false, manualAvailable: false };
}

export async function triggerMarketRateRefresh() {
  const res = await fetch("/api/public/hooks/fetch-market-rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`Refresh failed (HTTP ${res.status})`);
  return res.json().catch(() => ({}));
}

// ============= Market intelligence hooks =============

export function useMarketRateDeltas() {
  return useQuery({
    queryKey: ["market_rate_deltas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("market_rate_deltas" as any).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as MarketRateDelta[];
    },
    refetchInterval: 60_000,
  });
}

export function useInventoryExposure() {
  return useQuery({
    queryKey: ["inventory_exposure"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_exposure" as any).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as InventoryExposureRow[];
    },
    refetchInterval: 60_000,
  });
}

export function useMarketNotifications(limit = 50) {
  return useQuery({
    queryKey: ["market_notifications", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_notifications" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as MarketNotificationRow[];
    },
    refetchInterval: 45_000,
  });
}

export function useAlertThresholds() {
  return useQuery({
    queryKey: ["alert_thresholds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("alert_drop_pct_15min,alert_rise_pct_15min,alert_volatility_pct_1h,alert_stale_minutes,alert_near_cost_pct")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        alert_drop_pct_15min: 0.5,
        alert_rise_pct_15min: 0.5,
        alert_volatility_pct_1h: 1,
        alert_stale_minutes: 15,
        alert_near_cost_pct: 0.3,
      }) as unknown as AlertThresholds;
    },
  });
}

/** Compute rate margin between a user-entered rate and the current market mid. */
export function computeRateMargin(txnRate: number | null | undefined, marketMid: number | null | undefined) {
  if (!txnRate || !marketMid || marketMid <= 0) return null;
  const diff = Number(txnRate) - Number(marketMid);
  const pct = (diff / Number(marketMid)) * 100;
  return { diff, pct };
}

/**
 * Interpret rate margin quality for a given side.
 *   - "sell" from our perspective: higher than market = favourable (green)
 *   - "buy" from our perspective: lower than market = favourable (green)
 */
export function rateMarginTone(
  side: "sell" | "buy",
  margin: { diff: number; pct: number } | null,
): "ok" | "warn" | "danger" | "neutral" {
  if (!margin) return "neutral";
  const favourable = side === "sell" ? margin.diff > 0 : margin.diff < 0;
  if (Math.abs(margin.pct) < 0.05) return "neutral";
  return favourable ? "ok" : "danger";
}