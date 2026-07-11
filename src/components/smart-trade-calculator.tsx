import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Calculator, Sparkles, TrendingUp, TrendingDown, Info } from "lucide-react";
import { fmt, fmtProfit } from "@/lib/exchange";
import {
  compareToMarket,
  convertAmount,
  detectDirection,
  deriveOperation,
  pivotCurrency,
  scoreTrade,
  type ScoreInput,
} from "@/lib/trade-math";
import { useLatestMarketRates, pickDisplayRate, rateFreshness } from "@/lib/market-rates";

export type CalcProps = {
  giveCurrency: string;
  giveAmount: number;
  receiveCurrency: string;
  /** Rate the user is quoting. Convention: IRR per 1 unit of foreign currency. */
  userRate: number;
  /** Which side of the market we're on. */
  side: "buy" | "sell";
  /** Optional pairing: on matched trades pass both rates for realised margin. */
  buyRate?: number | null;
  sellRate?: number | null;
  /** For sells: available inventory in the pivot currency. */
  inventoryAvailable?: number | null;
  customerKnown?: boolean;
  customerHasDebt?: boolean;
};

export function SmartTradeCalculator(props: CalcProps) {
  const rates = useLatestMarketRates();
  const direction = detectDirection(props.giveCurrency, props.receiveCurrency);
  // Operation direction is derived from currency flow — NOT from the form's Sell/Buy label.
  // Give IRR + receive foreign = BUY that foreign; give foreign + receive IRR = SELL that foreign.
  const op = deriveOperation(props.giveCurrency, props.receiveCurrency);
  const effectiveSide = op.side;
  const pivot = op.pivot || pivotCurrency(props.giveCurrency, props.receiveCurrency);

  const pivotPick = pickDisplayRate(rates.data, pivot);
  const marketRow = pivotPick.row;
  const marketMid = marketRow?.mid_rate ? Number(marketRow.mid_rate) : null;
  const marketBuy = marketRow?.buy_rate ? Number(marketRow.buy_rate) : null;
  const marketSell = marketRow?.sell_rate ? Number(marketRow.sell_rate) : null;
  // When we BUY the foreign currency, compare our rate to Bonbast BUY rate.
  // When we SELL the foreign currency, compare to Bonbast SELL rate.
  const marketRef = effectiveSide === "buy" ? marketBuy ?? marketMid : marketSell ?? marketMid;

  // For cross-trades, we also need the receive-side market rate to convert.
  const receivePick = pickDisplayRate(rates.data, props.receiveCurrency);
  const receiveMarketMid = receivePick.row?.mid_rate ? Number(receivePick.row.mid_rate) : null;

  const receiveAmount = useMemo(
    () =>
      convertAmount(
        props.giveCurrency,
        props.receiveCurrency,
        props.giveAmount || 0,
        props.userRate || 0,
        receiveMarketMid,
      ),
    [props.giveCurrency, props.receiveCurrency, props.giveAmount, props.userRate, receiveMarketMid],
  );

  const marketReceive = useMemo(
    () =>
      marketRef
        ? convertAmount(
            props.giveCurrency,
            props.receiveCurrency,
            props.giveAmount || 0,
            marketRef,
            receiveMarketMid,
          )
        : 0,
    [props.giveCurrency, props.receiveCurrency, props.giveAmount, marketRef, receiveMarketMid],
  );

  const cmp = compareToMarket(effectiveSide, props.userRate, marketRef);

  // Advantage in receive currency: for both BUY and SELL, a favourable rate simply means
  // we end up with more of the receive currency than the market would have given us.
  const profitVsMarket = receiveAmount && marketReceive ? receiveAmount - marketReceive : 0;

  const freshness = rateFreshness(marketRow?.fetched_at);

  const score = useMemo(() => {
    const input: ScoreInput = {
      side: effectiveSide,
      userRate: props.userRate || 0,
      marketRate: marketRef,
      buyRate: props.buyRate ?? null,
      sellRate: props.sellRate ?? null,
      amount: props.giveAmount || 0,
      inventoryAvailable: props.inventoryAvailable ?? null,
      marketAgeMinutes: freshness.minutes === Infinity ? null : freshness.minutes,
      customerKnown: props.customerKnown,
      customerHasDebt: props.customerHasDebt,
    };
    return scoreTrade(input);
  }, [
    effectiveSide,
    props.userRate,
    marketRef,
    props.buyRate,
    props.sellRate,
    props.giveAmount,
    props.inventoryAvailable,
    freshness.minutes,
    props.customerKnown,
    props.customerHasDebt,
  ]);

  const canCompute = props.giveAmount > 0 && props.userRate > 0 && direction !== "same";
  const rateLabel = direction === "irr_to_foreign" || direction === "foreign_to_irr" || direction === "cross"
    ? `IRR per 1 ${pivot}`
    : `${props.receiveCurrency} per 1 ${props.giveCurrency}`;

  const scoreTone =
    score.band === "excellent" || score.band === "good"
      ? "text-emerald-600"
      : score.band === "acceptable"
      ? "text-amber-600"
      : "text-destructive";

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-background to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Smart trade calculator
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
              {op.verb}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {rateLabel}
            </Badge>
            <Badge
              variant={freshness.tone === "ok" ? "default" : freshness.tone === "warn" ? "secondary" : "destructive"}
              className="text-[10px]"
            >
              Market: {freshness.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Direction strip */}
        <div className="flex items-center gap-3 text-sm">
          <div className="flex-1 rounded-md border bg-background p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">You give</div>
            <div className="text-lg font-semibold font-mono">
              {props.giveAmount ? fmt(props.giveAmount, props.giveCurrency) : `— ${props.giveCurrency}`}
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 rounded-md border bg-background p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">You receive</div>
            <div className="text-lg font-semibold font-mono">
              {canCompute ? fmt(receiveAmount, props.receiveCurrency) : `— ${props.receiveCurrency}`}
            </div>
          </div>
        </div>

        {/* Rate compare */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <MetricBox
            label="Your rate"
            value={props.userRate ? props.userRate.toLocaleString() : "—"}
            hint={rateLabel}
          />
          <MetricBox
            label={`Bonbast ${effectiveSide === "buy" ? "buy" : "sell"} (${pivot})`}
            value={marketRef ? marketRef.toLocaleString() : "—"}
            hint={marketRow?.source ? `Source: ${marketRow.source}` : "No data"}
          />
          <MetricBox
            label="vs market"
            value={cmp ? `${cmp.pct >= 0 ? "+" : ""}${cmp.pct.toFixed(2)}%` : "—"}
            hint={cmp ? cmp.label : "Enter rate"}
            tone={cmp?.tone}
          />
        </div>

        {/* Quality banner */}
        {cmp && (
          <div
            className={`rounded-md border p-3 text-sm flex items-start gap-2 ${
              cmp.tone === "excellent" || cmp.tone === "good"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : cmp.tone === "neutral"
                ? "border-muted bg-muted/40"
                : cmp.tone === "bad"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-destructive/50 bg-destructive/10 text-destructive"
            }`}
          >
            <span className="text-lg leading-none">{cmp.emoji}</span>
            <div className="flex-1">
              <div className="font-medium">{cmp.label}</div>
              <div className="text-[11px] opacity-80">
                {effectiveSide === "sell"
                  ? `You are selling ${pivot} — a higher rate than market is favourable.`
                  : `You are buying ${pivot} — a lower rate than market is favourable.`}
              </div>
            </div>
            {profitVsMarket !== 0 && canCompute && (
              <div className={`text-right font-mono text-sm ${profitVsMarket >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {profitVsMarket >= 0 ? <TrendingUp className="inline h-3.5 w-3.5 mr-1" /> : <TrendingDown className="inline h-3.5 w-3.5 mr-1" />}
                {fmtProfit(profitVsMarket, props.receiveCurrency)}
                <div className="text-[10px] opacity-70 font-sans">vs market</div>
              </div>
            )}
          </div>
        )}

        {/* Realised margin (matched trades) */}
        {props.buyRate && props.sellRate && props.buyRate > 0 && (
          <div className="rounded-md border p-3 bg-background text-sm">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Realised margin</div>
            <div className="flex items-center justify-between font-mono">
              <span>
                Buy {props.buyRate.toLocaleString()} → Sell {props.sellRate.toLocaleString()}
              </span>
              <span
                className={`font-semibold ${
                  props.sellRate - props.buyRate >= 0 ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {(((props.sellRate - props.buyRate) / props.buyRate) * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        )}

        {/* AI Trade Score */}
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Trade Score
            </div>
            <div className={`text-2xl font-bold font-mono ${scoreTone}`}>
              {score.score}
              <span className="text-xs text-muted-foreground font-normal">/100</span>
            </div>
          </div>
          <Progress value={score.score} className="h-2" />
          <div className={`mt-1 text-xs font-medium ${scoreTone}`}>{score.label}</div>
          <div className="mt-2 space-y-1">
            {score.factors.map((f) => (
              <div key={f.key} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground truncate mr-2" title={f.detail}>
                  {f.label}
                </span>
                <span
                  className={`font-mono shrink-0 ${
                    f.points > 0 ? "text-emerald-600" : f.points < 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {f.points > 0 ? "+" : ""}
                  {f.points.toFixed(0)}
                  <span className="opacity-50"> / {f.max}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {direction === "cross" && !receiveMarketMid && (
          <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Cross-currency trade needs a market rate for {props.receiveCurrency} to compute the receive amount.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricBox({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "excellent" | "good" | "neutral" | "bad" | "terrible";
}) {
  const toneClass =
    tone === "excellent" || tone === "good"
      ? "text-emerald-600"
      : tone === "bad" || tone === "terrible"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-sm font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
    </div>
  );
}