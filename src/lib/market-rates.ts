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

export function useLatestMarketRates() {
  return useQuery({
    queryKey: ["market_rates_latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_rates_latest" as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as MarketRateRow[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
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
  return rates?.find((r) => r.currency === currency);
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