import { supabase } from "@/integrations/supabase/client";

export type PreviewLot = {
  lot_id: string;
  lot_code: string | null;
  take: number;
  cost_rate: number | null;
  cost_currency: string | null;
  cost_amount: number | null;
  account_id: string | null;
  entry_date: string;
  cost_basis_status: "known" | "unknown" | "capital";
};

export type PreviewResult = {
  lots: PreviewLot[];
  covered: number;
  shortfall: number;
  total_cost: number;
  known_cost: number;
  blended_cost_rate: number;
  known_blended_cost_rate: number;
  cost_basis_currency: string | null;
  has_unknown_cost: boolean;
  unknown_amount: number;
  mode: "fifo" | "weighted_average" | "manual";
};

export async function previewSellAllocation(args: {
  currency: string;
  amount: number;
  source_account_id?: string | null;
  mode?: "fifo" | "weighted_average" | "manual";
  manual?: Array<{ lot_id: string; take: number }>;
}): Promise<PreviewResult> {
  const { data, error } = await (supabase as any).rpc("preview_sell_allocation", {
    _currency: args.currency,
    _amount: args.amount,
    _source_account_id: args.source_account_id ?? null,
    _mode: args.mode ?? "fifo",
    _manual: args.manual ?? null,
  });
  if (error) throw error;
  return data as PreviewResult;
}

// Sensible clamp — IRR pair rates below 100 are almost certainly wrong (Toman leakage etc.)
export function sanitizeIrrRate(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  if (rate < 100) return null;
  return rate;
}

export function fmtProfitIRR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return sign + Math.abs(Math.round(n)).toLocaleString("en-US");
}

export function fmtProfitAED(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return sign + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}