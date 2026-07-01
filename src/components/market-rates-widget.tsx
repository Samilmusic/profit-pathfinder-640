import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useLatestMarketRates,
  useMarketRateHistory,
  rateFreshness,
  findRate,
  triggerMarketRateRefresh,
  type MarketRateRow,
} from "@/lib/market-rates";
import { fmt } from "@/lib/exchange";
import { RefreshCw, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Sparkline({ currency }: { currency: string }) {
  const q = useMarketRateHistory(currency, 24);
  const rows = (q.data ?? []) as Array<{ fetched_at: string; mid_rate: number | null }>;
  const path = useMemo(() => {
    const pts = rows
      .map((r) => Number(r.mid_rate))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (pts.length < 2) return null;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 1;
    const w = 120, h = 32;
    const step = w / (pts.length - 1);
    const d = pts
      .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
      .join(" ");
    return { d, w, h, min, max };
  }, [rows]);
  if (!path) {
    return <div className="text-[10px] text-muted-foreground">Not enough history yet</div>;
  }
  return (
    <div className="flex items-center gap-2">
      <svg width={path.w} height={path.h} className="text-primary">
        <path d={path.d} fill="none" stroke="currentColor" strokeWidth={1.5} />
      </svg>
      <div className="text-[10px] text-muted-foreground leading-tight">
        <div>24h low {fmt(path.min)}</div>
        <div>24h high {fmt(path.max)}</div>
      </div>
    </div>
  );
}

function RateBlock({ row, currency }: { row?: MarketRateRow; currency: string }) {
  const fresh = rateFreshness(row?.fetched_at);
  const toneCls =
    fresh.tone === "ok"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : fresh.tone === "warn"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
  return (
    <div className="rounded-lg border p-3 bg-card/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground">{currency} / IRR</span>
          <Badge variant="outline" className={toneCls}>{fresh.label}</Badge>
        </div>
        <div className="text-[10px] text-muted-foreground">Updated {fmtTime(row?.fetched_at)}</div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Buy</div>
          <div className="font-mono font-semibold">{row?.buy_rate != null ? fmt(row.buy_rate) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Sell</div>
          <div className="font-mono font-semibold">{row?.sell_rate != null ? fmt(row.sell_rate) : "—"}</div>
        </div>
      </div>
      {fresh.tone === "danger" && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" /> Market rate is stale. Enter rate manually.
        </div>
      )}
      <div className="mt-2">
        <Sparkline currency={currency} />
      </div>
    </div>
  );
}

export function MarketRatesWidget() {
  const qc = useQueryClient();
  const q = useLatestMarketRates();
  const refresh = useMutation({
    mutationFn: triggerMarketRateRefresh,
    onSuccess: () => {
      toast.success("Market rates refreshed");
      qc.invalidateQueries({ queryKey: ["market_rates_latest"] });
      qc.invalidateQueries({ queryKey: ["market_rate_history"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Refresh failed"),
  });
  const rates = q.data ?? [];
  const aed = findRate(rates, "AED");
  const usd = findRate(rates, "USD");

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Bonbast Market Rates
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="h-8"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RateBlock row={aed} currency="AED" />
        <RateBlock row={usd} currency="USD" />
      </CardContent>
    </Card>
  );
}