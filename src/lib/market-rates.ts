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