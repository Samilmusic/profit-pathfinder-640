import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useLatestMarketRates,
  useRecentMarketRates,
  useMarketRateHistory,
  rateFreshness,
  pickDisplayRate,
  triggerMarketRateRefresh,
  type MarketRateRow,
  type MarketRateRecentRow,
} from "@/lib/market-rates";
import { MARKET_CURRENCIES, currencyMeta } from "@/lib/market-currencies";
import { fmt } from "@/lib/exchange";
import {
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import { toast } from "sonner";

type Range = 1 | 24 | 168;

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TrendArrow({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  }
  const delta = current - previous;
  const pct = previous > 0 ? (delta / previous) * 100 : 0;
  if (Math.abs(delta) < 0.0000001) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Minus className="h-3 w-3" /> 0.00%
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

function Sparkline({ currency, hours }: { currency: string; hours: number }) {
  const q = useMarketRateHistory(currency, hours);
  const rows = (q.data ?? []) as Array<{ fetched_at: string; mid_rate: number | null }>;
  const path = useMemo(() => {
    const pts = rows.map((r) => Number(r.mid_rate)).filter((n) => Number.isFinite(n) && n > 0);
    if (pts.length < 2) return null;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 1;
    const w = 140, h = 32;
    const step = w / (pts.length - 1);
    const d = pts
      .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
      .join(" ");
    return { d, w, h, min, max };
  }, [rows]);
  if (!path) return <div className="text-[10px] text-muted-foreground">Not enough history yet</div>;
  return (
    <div className="flex items-center gap-2">
      <svg width={path.w} height={path.h} className="text-primary">
        <path d={path.d} fill="none" stroke="currentColor" strokeWidth={1.5} />
      </svg>
      <div className="text-[10px] text-muted-foreground leading-tight">
        <div>low {fmt(path.min)}</div>
        <div>high {fmt(path.max)}</div>
      </div>
    </div>
  );
}

function RateBlock({
  code,
  row,
  previous,
  usedFallback,
  historyHours,
}: {
  code: string;
  row?: MarketRateRow;
  previous?: MarketRateRecentRow;
  usedFallback: boolean;
  historyHours: number;
}) {
  const meta = currencyMeta(code);
  const fresh = rateFreshness(row?.fetched_at);
  const sourceLabel = row?.source === "manual" ? "Manual" : row?.source === "bonbast" ? "Bonbast" : "—";
  const toneCls =
    fresh.tone === "ok"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : fresh.tone === "warn"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
  return (
    <div className="rounded-lg border p-3 bg-card/60">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">{meta.flag}</span>
          <span className="text-xs font-semibold tracking-wider text-muted-foreground truncate">
            {code} / IRR
          </span>
          <Badge variant="outline" className={toneCls}>{fresh.label}</Badge>
          <Badge variant="outline" className="text-[10px]">{sourceLabel}</Badge>
        </div>
        <div className="text-[10px] text-muted-foreground shrink-0">{fmtTime(row?.fetched_at)}</div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
            Buy <TrendArrow current={row?.buy_rate ?? null} previous={previous?.buy_rate ?? null} />
          </div>
          <div className="font-mono font-semibold">{row?.buy_rate != null ? fmt(row.buy_rate) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
            Sell <TrendArrow current={row?.sell_rate ?? null} previous={previous?.sell_rate ?? null} />
          </div>
          <div className="font-mono font-semibold">{row?.sell_rate != null ? fmt(row.sell_rate) : "—"}</div>
        </div>
      </div>
      {usedFallback && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" /> Bonbast unavailable — showing manual fallback.
        </div>
      )}
      {row?.source === "bonbast" && row?.source_unit === "TOMAN" && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Source: Bonbast, converted from Toman ×10
        </div>
      )}
      {!row && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" /> No rate yet. Set a manual rate in Settings.
        </div>
      )}
      {row && !usedFallback && fresh.tone === "danger" && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" /> Market rate is stale.
        </div>
      )}
      <div className="mt-2">
        <Sparkline currency={code} hours={historyHours} />
      </div>
    </div>
  );
}

export function MarketRatesWidget() {
  const qc = useQueryClient();
  const latest = useLatestMarketRates();
  const recent = useRecentMarketRates();
  const [range, setRange] = useState<Range>(24);

  const refresh = useMutation({
    mutationFn: triggerMarketRateRefresh,
    onSuccess: (res: any) => {
      if (res?.ok === false) {
        toast.warning(res?.message ?? "Bonbast unavailable — using last saved rate.");
      } else {
        toast.success(`Market rates refreshed (${res?.success ?? 0} ok, ${res?.failed ?? 0} failed)`);
      }
      qc.invalidateQueries({ queryKey: ["market_rates_latest"] });
      qc.invalidateQueries({ queryKey: ["market_rates_recent"] });
      qc.invalidateQueries({ queryKey: ["market_rate_history"] });
      qc.invalidateQueries({ queryKey: ["market_rate_fetches"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Refresh failed"),
  });

  const displayCurrencies = MARKET_CURRENCIES.filter((c) => c.primary);

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 flex-wrap">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Bonbast Market Rates
        </CardTitle>
        <div className="flex items-center gap-1">
          {([
            { v: 1 as Range, label: "1h" },
            { v: 24 as Range, label: "24h" },
            { v: 168 as Range, label: "7d" },
          ]).map((opt) => (
            <Button
              key={opt.v}
              size="sm"
              variant={range === opt.v ? "default" : "outline"}
              className="h-7 px-2 text-[11px]"
              onClick={() => setRange(opt.v)}
            >
              {opt.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="h-7"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {displayCurrencies.map((c) => {
          const picked = pickDisplayRate(latest.data, c.code);
          const prev = (recent.data ?? []).find(
            (r) => r.currency === c.code && r.source === (picked.row?.source ?? "bonbast") && r.rn === 2,
          );
          return (
            <RateBlock
              key={c.code}
              code={c.code}
              row={picked.row}
              previous={prev}
              usedFallback={picked.usedFallback}
              historyHours={range}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}