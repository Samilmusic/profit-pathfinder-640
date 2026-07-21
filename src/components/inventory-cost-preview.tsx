import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { previewSellAllocation, fmtProfitIRR, fmtProfitAED } from "@/lib/inventory";
import { fmt } from "@/lib/exchange";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info } from "lucide-react";

type Props = {
  soldCurrency: string;
  soldAmount: number;
  sellRate: number;
  receivedCurrency: string;
  sourceAccountId?: string | null;
  mode?: "fifo" | "weighted_average" | "manual";
  manual?: Array<{ lot_id: string; take: number }>;
  onModeChange?: (m: "fifo" | "weighted_average" | "manual") => void;
  onManualChange?: (m: Array<{ lot_id: string; take: number }>) => void;
  linkedExpensesIRR?: number;
};

/**
 * Big Bloomberg-style block that shows exactly which lots will be consumed,
 * cost calculation, realized profit in IRR + AED. Never shows fake profit
 * when part of inventory has no recorded cost basis.
 */
export function InventoryCostPreview(p: Props) {
  const mode = p.mode ?? "fifo";
  const amount = Number(p.soldAmount) || 0;
  const rate = Number(p.sellRate) || 0;
  const enabled = amount > 0 && !!p.soldCurrency;

  const previewQ = useQuery({
    queryKey: ["preview_sell_allocation", p.soldCurrency, amount, p.sourceAccountId ?? null, mode, p.manual ?? null],
    enabled,
    queryFn: () => previewSellAllocation({
      currency: p.soldCurrency,
      amount,
      source_account_id: p.sourceAccountId ?? null,
      mode,
      manual: p.manual,
    }),
    staleTime: 5000,
  });

  // Manual-mode helper: list all lots the user can pick from
  const lotsQ = useQuery({
    queryKey: ["all-lots-for-manual", p.soldCurrency, p.sourceAccountId ?? null],
    enabled: mode === "manual" && !!p.soldCurrency,
    queryFn: async () => {
      let q = supabase.from("inventory_lots" as any)
        .select("id,lot_code,remaining_amount,cost_basis_rate,cost_basis_currency,cost_basis_status,entry_date,account_id,status")
        .eq("currency", p.soldCurrency).gt("remaining_amount", 0).neq("status", "depleted")
        .order("entry_date", { ascending: true }).order("created_at", { ascending: true });
      if (p.sourceAccountId) q = q.eq("account_id", p.sourceAccountId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const result = previewQ.data;

  // For manual mode: compare vs FIFO to warn user
  const fifoCompareQ = useQuery({
    queryKey: ["preview_sell_fifo_compare", p.soldCurrency, amount, p.sourceAccountId ?? null],
    enabled: enabled && mode === "manual",
    queryFn: () => previewSellAllocation({
      currency: p.soldCurrency, amount, source_account_id: p.sourceAccountId ?? null, mode: "fifo",
    }),
  });

  const stats = useMemo(() => {
    if (!result) return null;
    const saleValue = amount * rate;
    const canComputeProfit =
      !result.has_unknown_cost &&
      result.cost_basis_currency != null &&
      result.cost_basis_currency === p.receivedCurrency;
    const gross = canComputeProfit ? saleValue - result.total_cost : null;
    const net   = gross != null ? gross - (p.linkedExpensesIRR ?? 0) : null;
    const effCostRate = result.covered > 0 ? result.total_cost / result.covered : 0;
    const spread = canComputeProfit ? rate - effCostRate : null;
    const profitAED = net != null && p.receivedCurrency === "IRR" && rate > 0 ? net / rate : (p.receivedCurrency === "AED" ? net : null);
    return { saleValue, canComputeProfit, gross, net, effCostRate, spread, profitAED };
  }, [result, amount, rate, p.receivedCurrency, p.linkedExpensesIRR]);

  if (!enabled) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        Enter amount and rate to preview inventory cost.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header + allocation mode picker */}
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm font-semibold">Inventory Cost Preview</div>
        <div className="flex items-center gap-1 rounded-md border p-0.5 text-[11px]">
          {(["fifo","weighted_average","manual"] as const).map(m => (
            <button key={m} type="button"
              onClick={() => p.onModeChange?.(m)}
              className={`px-2.5 py-1 rounded ${mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {m === "fifo" ? "FIFO" : m === "weighted_average" ? "Weighted Avg" : "Manual"}
            </button>
          ))}
        </div>
      </div>

      {/* Manual mode picker */}
      {mode === "manual" && (
        <div className="p-4 border-b bg-muted/20 space-y-1.5 max-h-64 overflow-auto">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Choose lots</div>
          {(lotsQ.data ?? []).map(l => {
            const current = p.manual?.find(x => x.lot_id === l.id)?.take ?? 0;
            return (
              <div key={l.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono w-24 shrink-0">{l.lot_code}</span>
                <span className="text-muted-foreground shrink-0">avail {fmt(l.remaining_amount, p.soldCurrency)}</span>
                <span className="text-muted-foreground shrink-0 hidden md:inline">@ {l.cost_basis_rate ? fmt(l.cost_basis_rate) : "—"} {l.cost_basis_currency}</span>
                {l.cost_basis_status !== "known" && <Badge variant="outline" className="text-[9px]">{l.cost_basis_status}</Badge>}
                <input
                  type="number" min={0} max={Number(l.remaining_amount)} step="0.0001"
                  className="ml-auto w-32 px-2 py-1 border rounded font-mono text-right"
                  value={current || ""}
                  onChange={(e) => {
                    const v = Math.min(Number(e.target.value) || 0, Number(l.remaining_amount));
                    const next = (p.manual ?? []).filter(x => x.lot_id !== l.id);
                    if (v > 0) next.push({ lot_id: l.id, take: v });
                    p.onManualChange?.(next);
                  }}
                />
              </div>
            );
          })}
          {lotsQ.data?.length === 0 && <div className="text-xs text-muted-foreground">No lots available for this currency.</div>}
        </div>
      )}

      {/* Body */}
      <div className="p-4 space-y-3">
        {previewQ.isLoading && <div className="text-xs text-muted-foreground">Calculating…</div>}

        {result && result.shortfall > 0 && (
          <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-destructive">Not enough inventory</div>
              <div className="text-muted-foreground">Short by {fmt(result.shortfall, p.soldCurrency)} {p.soldCurrency}. Reduce the amount or add inventory before selling.</div>
            </div>
          </div>
        )}

        {result && result.lots.length > 0 && (
          <>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Lots to be used ({mode === "fifo" ? "FIFO" : mode === "manual" ? "manual" : "weighted average"})
            </div>
            <div className="space-y-1 text-xs font-mono">
              {result.lots.map(l => (
                <div key={l.lot_id} className="grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-3 md:col-span-3 truncate">{l.lot_code}</span>
                  <span className="col-span-3 text-right">{fmt(l.take, p.soldCurrency)}</span>
                  <span className="col-span-1 text-muted-foreground text-center">×</span>
                  <span className="col-span-2 text-right">
                    {l.cost_basis_status === "known" && l.cost_rate ? fmt(l.cost_rate) : <span className="text-destructive text-[10px] uppercase">no cost</span>}
                  </span>
                  <span className="col-span-3 text-right text-muted-foreground">
                    {l.cost_amount != null ? `= ${fmt(l.cost_amount)} ${l.cost_currency}` : "—"}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-xs pt-2 border-t">
              <div>Total cost</div>
              <div className="text-right font-mono">
                {result.cost_basis_currency ? `${fmt(result.total_cost)} ${result.cost_basis_currency}` : "—"}
              </div>
              <div>Effective cost rate</div>
              <div className="text-right font-mono">
                {stats && stats.effCostRate ? `${fmt(stats.effCostRate)} ${result.cost_basis_currency}/${p.soldCurrency}` : "—"}
              </div>
              <div>Sell rate</div>
              <div className="text-right font-mono">{rate ? fmt(rate) : "—"}</div>
              <div>Sale value</div>
              <div className="text-right font-mono">{stats ? `${fmt(stats.saleValue)} ${p.receivedCurrency}` : "—"}</div>
            </div>
          </>
        )}

        {result?.has_unknown_cost && (
          <div className="flex items-start gap-2 rounded border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Cannot calculate exact profit</div>
              <div className="text-muted-foreground">
                {fmt(result.unknown_amount, p.soldCurrency)} {p.soldCurrency} of the inventory has no recorded cost basis.
                Assign a cost basis to those lots from Inventory, or admin-override at close.
              </div>
            </div>
          </div>
        )}

        {mode === "manual" && fifoCompareQ.data && result && stats?.canComputeProfit && fifoCompareQ.data.total_cost < result.total_cost && (
          <div className="rounded border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20 p-2 text-[11px]">
            Manual allocation reduces profit by {fmtProfitIRR(result.total_cost - fifoCompareQ.data.total_cost)} {result.cost_basis_currency} vs FIFO.
          </div>
        )}

        {/* Expected Profit hero card */}
        {stats && (
          <div className={`rounded-lg p-4 mt-2 ${stats.canComputeProfit ? "bg-primary/5 border border-primary/30" : "bg-muted/40 border border-dashed"}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Expected Profit</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <MiniStat label={`Selling`} value={`${fmt(amount, p.soldCurrency)} ${p.soldCurrency}`} />
              <MiniStat label="Effective cost" value={stats.effCostRate ? `${fmt(stats.effCostRate)} ${result?.cost_basis_currency}/${p.soldCurrency}` : "—"} />
              <MiniStat label="Your sell rate" value={rate ? `${fmt(rate)} ${p.receivedCurrency}/${p.soldCurrency}` : "—"} />
              <MiniStat label="Spread" value={stats.spread != null ? `${fmt(stats.spread)} ${p.receivedCurrency}/${p.soldCurrency}` : "—"} />
              <MiniStat
                label="Expected net profit"
                value={stats.net != null && result?.cost_basis_currency ? `${fmtProfitIRR(stats.net)} ${result.cost_basis_currency}` : "—"}
                tone={stats.net != null ? (stats.net >= 0 ? "ok" : "danger") : undefined}
                strong
              />
              <MiniStat
                label="≈ in AED"
                value={stats.profitAED != null ? `${fmtProfitAED(stats.profitAED)} AED` : "—"}
                tone={stats.profitAED != null ? (stats.profitAED >= 0 ? "ok" : "danger") : undefined}
                strong
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone, strong }: { label: string; value: string; tone?: "ok" | "danger"; strong?: boolean }) {
  const color = tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono ${strong ? "text-base font-semibold" : "text-sm"} ${color}`}>{value}</div>
    </div>
  );
}