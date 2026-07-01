import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";
import {
  useLatestMarketRates,
  pickDisplayRate,
  rateFreshness,
  computeRateMargin,
  rateMarginTone,
} from "@/lib/market-rates";
import { fmt } from "@/lib/exchange";
import { cn } from "@/lib/utils";

type Side = "sell" | "buy";

const MARGIN_PRESETS: Array<{ label: string; type: "abs" | "pct"; value: number }> = [
  { label: "+500", type: "abs", value: 500 },
  { label: "+1,000", type: "abs", value: 1000 },
  { label: "+0.5%", type: "pct", value: 0.5 },
  { label: "-0.5%", type: "pct", value: -0.5 },
];

/**
 * Live rate comparison + "Use live rate" / "Use live + margin" actions.
 * Purely additive — never overrides the user's typed value.
 */
export function RateComparison({
  currency,
  side,
  txnRate,
  onApply,
  className,
  compact,
}: {
  currency: string;
  side: Side;
  txnRate: number | null | undefined;
  onApply: (rate: number) => void;
  className?: string;
  compact?: boolean;
}) {
  const q = useLatestMarketRates();
  const { row, usedFallback } = pickDisplayRate(q.data, currency);
  const fresh = rateFreshness(row?.fetched_at);
  const marketMid = row?.mid_rate ?? null;
  const marketBuy = row?.buy_rate ?? null;
  const marketSell = row?.sell_rate ?? null;
  const margin = useMemo(() => computeRateMargin(txnRate, marketMid), [txnRate, marketMid]);
  const tone = rateMarginTone(side, margin);
  const toneCls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  const toneBg =
    tone === "ok"
      ? "bg-emerald-500/10 border-emerald-500/30"
      : tone === "danger"
        ? "bg-red-500/10 border-red-500/30"
        : "bg-muted/40 border-muted-foreground/20";
  const baseRate = side === "sell" ? marketSell ?? marketMid : marketBuy ?? marketMid;

  const applyMarket = () => {
    if (baseRate) onApply(Number(baseRate));
  };
  const applyWithMargin = (preset: (typeof MARGIN_PRESETS)[number]) => {
    if (!baseRate) return;
    const adjusted =
      preset.type === "abs"
        ? Number(baseRate) + preset.value
        : Number(baseRate) * (1 + preset.value / 100);
    onApply(Math.round(adjusted));
  };

  if (!row) {
    return (
      <div className={cn("rounded-md border border-dashed p-2 text-[11px] text-muted-foreground", className)}>
        No {currency} market rate available.
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border p-2 space-y-2", toneBg, className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold tracking-wider text-muted-foreground">{currency} MARKET</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              fresh.tone === "ok"
                ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                : fresh.tone === "warn"
                  ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                  : "border-red-500/40 text-red-700 dark:text-red-400",
            )}
          >
            {fresh.label}
          </Badge>
          {usedFallback && (
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700">
              fallback
            </Badge>
          )}
        </div>
        {!compact && (
          <div className="text-[11px] text-muted-foreground font-mono">
            buy {marketBuy != null ? fmt(marketBuy) : "—"} · sell {marketSell != null ? fmt(marketSell) : "—"}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Market {side}</div>
          <div className="font-mono font-semibold">{baseRate != null ? fmt(baseRate) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Your rate</div>
          <div className="font-mono font-semibold">{txnRate ? fmt(Number(txnRate)) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Margin</div>
          <div className={cn("font-mono font-semibold flex items-center gap-1", toneCls)}>
            {tone === "ok" ? (
              <TrendingUp className="h-3 w-3" />
            ) : tone === "danger" ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {margin ? `${margin.diff > 0 ? "+" : ""}${fmt(margin.diff)} (${margin.pct.toFixed(2)}%)` : "—"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={applyMarket}
          disabled={!baseRate}
        >
          <Zap className="h-3 w-3 mr-1" /> Use live rate
        </Button>
        {MARGIN_PRESETS.map((p) => (
          <Button
            key={p.label}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={() => applyWithMargin(p)}
            disabled={!baseRate}
          >
            Live {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}