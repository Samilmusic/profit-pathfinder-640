import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { useLatestMarketRates, pickDisplayRate, rateFreshness } from "@/lib/market-rates";
import { toast } from "sonner";

/**
 * Fills a rate input with the latest bonbast mid rate for the given currency.
 * Users can still edit the value manually — market rate is reference only.
 */
export function UseMarketRateButton({
  currency,
  onApply,
  which = "mid",
  className,
}: {
  currency: string;
  onApply: (rate: number) => void;
  which?: "buy" | "sell" | "mid";
  className?: string;
}) {
  const q = useLatestMarketRates();
  const { row } = pickDisplayRate(q.data, currency);
  const value =
    which === "buy" ? row?.buy_rate : which === "sell" ? row?.sell_rate : row?.mid_rate;
  const fresh = rateFreshness(row?.fetched_at);
  const disabled = !value || !Number.isFinite(Number(value));
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      className={className}
      onClick={() => {
        if (!value) return;
        onApply(Number(value));
        if (fresh.tone === "danger") {
          toast.warning("Market rate is stale — verify manually.");
        } else {
          toast.success(`Filled ${currency} ${which} rate from bonbast`);
        }
      }}
      title={
        row
          ? `${currency} ${which}: ${value ?? "—"} · ${fresh.label}`
          : "No market rate available"
      }
    >
      <TrendingUp className="h-3.5 w-3.5 mr-1" />
      Use market rate
      {value ? <span className="ml-1 font-mono text-xs opacity-80">{Number(value).toLocaleString()}</span> : null}
    </Button>
  );
}