// Pure deterministic Deal Score. No LLM. Input = signals from getDealSignals + form state.

export type DealScoreInput = {
  kind: "sell" | "buy" | "brought_in";
  sold_currency?: string;
  received_currency?: string;
  sold_amount?: number;
  sell_rate?: number;
  sold_from_account_id?: string | null;
  received_into_account_id?: string | null;
  customer_id?: string | null;
  signals: {
    market_rate: { source: string; buy: number; sell: number; mid: number; stale_minutes: number | null } | null;
    available_inventory: number;
    avg_cost_rate: number;
    customer: { name: string; open_deal_count: number; owed: Record<string, number> } | null;
  };
};

export type FactorResult = { key: string; label: string; points: number; max: number; note: string; tone: "positive" | "warn" | "danger" | "info" };

export type DealScore = {
  score: number;
  label: "Excellent" | "Good" | "Acceptable" | "Risky" | "Dangerous" | "Incomplete";
  factors: FactorResult[];
  headline: string;
};

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

export function scoreDeal(input: DealScoreInput): DealScore {
  const f: FactorResult[] = [];
  const s = input.signals;

  // 9 — completeness gate
  const missing: string[] = [];
  if (!input.sold_currency) missing.push("currency out");
  if (!input.received_currency && input.kind === "sell") missing.push("currency in");
  if (!(input.sold_amount ?? 0)) missing.push("amount");
  if (!(input.sell_rate ?? 0)) missing.push("rate");
  if (!input.sold_from_account_id) missing.push("source account");
  if (input.kind === "sell" && !input.received_into_account_id) missing.push("receiving account");
  if (missing.length) {
    f.push({ key: "completeness", label: "Deal completeness", points: 0, max: 20, tone: "danger",
      note: `Missing: ${missing.join(", ")}. Fill required fields to see the full score.` });
  } else {
    f.push({ key: "completeness", label: "Deal completeness", points: 20, max: 20, tone: "positive", note: "All required fields present." });
  }

  // 1 — rate quality
  if (s.market_rate && input.sell_rate) {
    const mkt = s.market_rate.mid || (s.market_rate.buy + s.market_rate.sell) / 2;
    const diffPct = mkt > 0 ? ((input.sell_rate - mkt) / mkt) * 100 : 0;
    // sell: higher-than-market is better; buy: lower-than-market is better
    const scoreDir = input.kind === "buy" ? -diffPct : diffPct;
    const pts = clamp(Math.round(scoreDir * 20), -10, 20);
    f.push({
      key: "rate", label: "Rate vs market", points: pts, max: 20,
      tone: pts >= 8 ? "positive" : pts <= -4 ? "danger" : "info",
      note: `Your rate is ${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(2)}% vs ${s.market_rate.source} mid (${s.market_rate.mid}).${s.market_rate.stale_minutes != null && s.market_rate.stale_minutes > 15 ? ` Market rate is ${s.market_rate.stale_minutes} min old.` : ""}`,
    });
  } else {
    f.push({ key: "rate", label: "Rate vs market", points: 0, max: 20, tone: "warn",
      note: s.market_rate ? "Enter a rate to compare with market." : "No live market rate available for this currency." });
  }

  // 2 — inventory availability (sell only)
  if (input.kind === "sell") {
    if (input.sold_amount && s.available_inventory >= input.sold_amount) {
      f.push({ key: "inv", label: "Inventory availability", points: 15, max: 15, tone: "positive",
        note: `${s.available_inventory.toLocaleString()} ${input.sold_currency} available; deal needs ${input.sold_amount.toLocaleString()}.` });
    } else if (input.sold_amount) {
      f.push({ key: "inv", label: "Inventory availability", points: -10, max: 15, tone: "danger",
        note: `Only ${s.available_inventory.toLocaleString()} ${input.sold_currency} available; deal needs ${input.sold_amount.toLocaleString()}. Save will be blocked.` });
    } else {
      f.push({ key: "inv", label: "Inventory availability", points: 0, max: 15, tone: "info", note: "Enter an amount." });
    }
  }

  // 3 — cost basis / expected margin
  if (s.avg_cost_rate > 0 && input.sell_rate) {
    const marginPct = ((input.sell_rate - s.avg_cost_rate) / s.avg_cost_rate) * 100 * (input.kind === "buy" ? -1 : 1);
    const pts = clamp(Math.round(marginPct * 8), -10, 15);
    f.push({ key: "margin", label: "Expected margin", points: pts, max: 15,
      tone: pts >= 8 ? "positive" : pts <= -4 ? "danger" : "info",
      note: `${marginPct >= 0 ? "+" : ""}${marginPct.toFixed(2)}% vs avg cost ${s.avg_cost_rate.toFixed(4)}.` });
  } else {
    f.push({ key: "margin", label: "Expected margin", points: 0, max: 15, tone: "warn",
      note: "Cost basis not available yet — cannot compute expected margin." });
  }

  // 4 — customer settlement risk
  if (s.customer) {
    if (s.customer.open_deal_count === 0) {
      f.push({ key: "cust", label: "Customer history", points: 10, max: 10, tone: "positive", note: `${s.customer.name} has no open unpaid deals.` });
    } else {
      const pts = -Math.min(15, s.customer.open_deal_count * 5);
      f.push({ key: "cust", label: "Customer settlement risk", points: pts, max: 10, tone: "danger",
        note: `${s.customer.name} has ${s.customer.open_deal_count} open deal${s.customer.open_deal_count > 1 ? "s" : ""}${
          Object.keys(s.customer.owed).length ? ` (${Object.entries(s.customer.owed).map(([c, v]) => `${(v as number).toLocaleString()} ${c}`).join(", ")} outstanding)` : ""
        }.` });
    }
  } else if (input.customer_id) {
    f.push({ key: "cust", label: "Customer history", points: 0, max: 10, tone: "info", note: "No customer history yet." });
  }

  // 5 — market movement (staleness proxy)
  if (s.market_rate?.stale_minutes != null && s.market_rate.stale_minutes > 30) {
    f.push({ key: "mkt", label: "Market movement", points: -5, max: 10, tone: "warn",
      note: `Market rate is stale (${s.market_rate.stale_minutes} min). Score does not include live movement.` });
  }

  const raw = f.reduce((n, x) => n + x.points, 0);
  const maxTotal = f.reduce((n, x) => n + x.max, 0);
  const score = maxTotal > 0 ? clamp(Math.round((raw / maxTotal) * 100), 0, 100) : 0;

  let label: DealScore["label"] = "Incomplete";
  if (missing.length) label = "Incomplete";
  else if (score >= 90) label = "Excellent";
  else if (score >= 75) label = "Good";
  else if (score >= 60) label = "Acceptable";
  else if (score >= 40) label = "Risky";
  else label = "Dangerous";

  const positives = f.filter((x) => x.points > 0).sort((a, b) => b.points - a.points)[0];
  const negatives = f.filter((x) => x.points < 0).sort((a, b) => a.points - b.points)[0];
  const headline = missing.length
    ? `Fill: ${missing.join(", ")}`
    : negatives
      ? `${positives ? positives.note.split(".")[0] + ". " : ""}But: ${negatives.note}`
      : positives?.note ?? "Deal looks clean.";

  return { score, label, factors: f, headline };
}