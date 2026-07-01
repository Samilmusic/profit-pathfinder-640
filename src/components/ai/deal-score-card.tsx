import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDealSignals } from "@/lib/ai/brain.functions";
import { scoreDeal, type DealScoreInput } from "@/lib/ai/deal-score";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const toneClass = {
  positive: "tone-positive",
  warn: "tone-warn",
  danger: "tone-danger",
  info: "tone-info",
} as const;

const labelColor: Record<string, string> = {
  Excellent: "text-emerald-600",
  Good: "text-emerald-600",
  Acceptable: "text-amber-600",
  Risky: "text-orange-600",
  Dangerous: "text-rose-600",
  Incomplete: "text-muted-foreground",
};

type Props = Omit<DealScoreInput, "signals">;

export function DealScoreCard(props: Props) {
  const fetchSignals = useServerFn(getDealSignals);
  const [signals, setSignals] = useState<DealScoreInput["signals"] | null>(null);
  const [loading, setLoading] = useState(false);

  const key = JSON.stringify({
    ccy: props.sold_currency,
    rc: props.received_currency,
    acc: props.sold_from_account_id,
    cust: props.customer_id,
  });

  useEffect(() => {
    if (!props.sold_currency) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetchSignals({
          data: {
            kind: props.kind,
            customer_id: props.customer_id ?? null,
            sold_currency: props.sold_currency,
            received_currency: props.received_currency,
            sold_amount: props.sold_amount,
            sell_rate: props.sell_rate,
            sold_from_account_id: props.sold_from_account_id ?? null,
            received_into_account_id: props.received_into_account_id ?? null,
          },
        });
        if (!cancelled) setSignals(r as any);
      } catch { /* ignore — card just shows blank state */ }
      finally { if (!cancelled) setLoading(false); }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!signals) {
    return (
      <Card className="glass"><CardContent className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        {props.sold_currency ? (loading ? "Analysing deal…" : "Preparing AI Deal Score…") : "AI Deal Score will appear once you pick a currency."}
      </CardContent></Card>
    );
  }

  const result = scoreDeal({ ...props, signals });

  return (
    <Card className="glass card-lift">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">AI Deal Score</span>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold leading-none">{result.score}<span className="text-sm text-muted-foreground">/100</span></div>
            <div className={cn("text-xs font-medium", labelColor[result.label])}>{result.label}</div>
          </div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full transition-all",
              result.score >= 75 ? "bg-emerald-500" :
              result.score >= 60 ? "bg-amber-500" :
              result.score >= 40 ? "bg-orange-500" : "bg-rose-500")}
            style={{ width: `${result.score}%` }}
          />
        </div>
        <p className="text-sm">{result.headline}</p>
        <ul className="space-y-1.5">
          {result.factors.map((x) => (
            <li key={x.key} className="flex items-start gap-2 text-xs">
              <span className={cn("mt-0.5 shrink-0", toneClass[x.tone])}>
                {x.points > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : x.points < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
              </span>
              <div className="flex-1">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{x.label}</span>
                  <span className={cn("tabular-nums", x.points > 0 ? "text-emerald-600" : x.points < 0 ? "text-rose-600" : "text-muted-foreground")}>
                    {x.points > 0 ? "+" : ""}{x.points}
                  </span>
                </div>
                <div className="text-muted-foreground">{x.note}</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground italic">Score is advisory. Existing accounting rules still block invalid saves.</p>
      </CardContent>
    </Card>
  );
}