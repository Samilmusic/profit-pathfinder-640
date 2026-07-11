/**
 * Smart trade math.
 *
 * Rate convention: rates are always quoted as
 *   IRR per 1 unit of the FOREIGN currency
 * (matching Bonbast / how the system stores market_rates for AED, USD…).
 *
 * Given (giveCcy, receiveCcy, userRate), the calculator auto-detects the
 * conversion direction so users never have to think about multiply vs. divide.
 */

export type Direction =
  | "foreign_to_irr" // give foreign, receive IRR → receive = amt * rate
  | "irr_to_foreign" // give IRR, receive foreign → receive = amt / rate
  | "cross" //            neither side is IRR (needs market cross)
  | "same"; //            same currency, no conversion

export function detectDirection(giveCcy: string, receiveCcy: string): Direction {
  if (giveCcy === receiveCcy) return "same";
  if (giveCcy === "IRR") return "irr_to_foreign";
  if (receiveCcy === "IRR") return "foreign_to_irr";
  return "cross";
}

/**
 * The non-IRR leg — its rate is what the user is quoting.
 * For cross-trades, returns the give currency (we quote via give-side).
 */
export function pivotCurrency(giveCcy: string, receiveCcy: string): string {
  if (giveCcy === "IRR") return receiveCcy;
  return giveCcy;
}

/**
 * Convert giveAmount into the receive currency using the entered rate.
 * userRate is IRR-per-foreign for the pivot currency.
 * For cross-trades a second market rate for the receive side is required.
 */
export function convertAmount(
  giveCcy: string,
  receiveCcy: string,
  giveAmount: number,
  userRate: number,
  receiveMarketRate?: number | null,
): number {
  if (!giveAmount || !userRate) return 0;
  const dir = detectDirection(giveCcy, receiveCcy);
  switch (dir) {
    case "same":
      return giveAmount;
    case "foreign_to_irr":
      return giveAmount * userRate;
    case "irr_to_foreign":
      return giveAmount / userRate;
    case "cross": {
      // Cross: give (foreign A) → IRR (via userRate) → receive (foreign B).
      // Needs market rate for receive-side. If missing, best-effort returns 0.
      if (!receiveMarketRate) return 0;
      const asIrr = giveAmount * userRate;
      return asIrr / receiveMarketRate;
    }
  }
}

/**
 * Compare user's entered rate vs. current market rate.
 *
 * side="buy": we are BUYING the pivot currency (lower rate = better for us)
 * side="sell": we are SELLING the pivot currency (higher rate = better for us)
 */
export function compareToMarket(
  side: "buy" | "sell",
  userRate: number | null | undefined,
  marketRate: number | null | undefined,
): {
  diff: number;
  pct: number;
  tone: "excellent" | "good" | "neutral" | "bad" | "terrible";
  label: string;
  emoji: string;
} | null {
  if (!userRate || !marketRate || marketRate <= 0) return null;
  const diff = Number(userRate) - Number(marketRate);
  const pct = (diff / Number(marketRate)) * 100;
  const favourable = side === "sell" ? diff > 0 : diff < 0;
  const abs = Math.abs(pct);

  if (abs < 0.1) {
    return { diff, pct, tone: "neutral", label: "At market", emoji: "⚪" };
  }
  if (favourable) {
    if (abs >= 1.5) return { diff, pct, tone: "excellent", label: side === "sell" ? "Excellent sale" : "Excellent buy", emoji: "🟢" };
    if (abs >= 0.5) return { diff, pct, tone: "good", label: side === "sell" ? "Good sale" : "Good buy", emoji: "🟢" };
    return { diff, pct, tone: "good", label: "Slight edge", emoji: "🟢" };
  }
  if (abs >= 1.5) return { diff, pct, tone: "terrible", label: side === "sell" ? "Bad sale" : "Bad buy", emoji: "🔴" };
  if (abs >= 0.5) return { diff, pct, tone: "bad", label: "Below market", emoji: "🟠" };
  return { diff, pct, tone: "bad", label: "Slightly off", emoji: "🟠" };
}

// ----------------------------------------------------------------------
// AI Trade Score (deterministic — every point backed by real numbers)
// ----------------------------------------------------------------------

export type ScoreInput = {
  side: "buy" | "sell";
  userRate: number;
  marketRate: number | null;
  /** For matched trades: buy rate and sell rate on the same trade. */
  buyRate?: number | null;
  sellRate?: number | null;
  /** Amount in pivot currency, used for liquidity weighting. */
  amount: number;
  /** Available inventory in pivot currency (for sell/inventory trades). */
  inventoryAvailable?: number | null;
  /** Market data freshness in minutes. */
  marketAgeMinutes?: number | null;
  /** Optional customer history flags. */
  customerKnown?: boolean;
  customerHasDebt?: boolean;
};

export type ScoreFactor = {
  key: string;
  label: string;
  points: number; // signed contribution
  max: number;
  detail: string;
};

export type ScoreResult = {
  score: number; // 0..100
  band: "excellent" | "good" | "acceptable" | "poor" | "avoid";
  label: string;
  factors: ScoreFactor[];
};

function band(score: number): ScoreResult["band"] {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 55) return "acceptable";
  if (score >= 30) return "poor";
  return "avoid";
}

function bandLabel(b: ScoreResult["band"]): string {
  switch (b) {
    case "excellent": return "Excellent trade";
    case "good": return "Good trade";
    case "acceptable": return "Acceptable";
    case "poor": return "Poor trade";
    case "avoid": return "Avoid";
  }
}

export function scoreTrade(inp: ScoreInput): ScoreResult {
  const factors: ScoreFactor[] = [];

  // 1. Rate vs market — up to 40 pts
  {
    const max = 40;
    let pts = 0;
    let detail = "No market rate available";
    if (inp.marketRate && inp.userRate) {
      const cmp = compareToMarket(inp.side, inp.userRate, inp.marketRate)!;
      // 0.5% favourable = +20, 1.5% favourable = +40, unfavourable is negative.
      const favSign = inp.side === "sell" ? 1 : -1;
      const signedPct = cmp.pct * favSign; // positive when favourable
      pts = Math.max(-max, Math.min(max, (signedPct / 1.5) * max));
      detail = `${cmp.emoji} ${cmp.label} · ${cmp.pct >= 0 ? "+" : ""}${cmp.pct.toFixed(2)}% vs market`;
    }
    factors.push({ key: "market", label: "Rate vs market", points: pts, max, detail });
  }

  // 2. Matched-trade margin (buy vs sell on the same deal) — up to 25 pts
  if (inp.buyRate && inp.sellRate && inp.buyRate > 0) {
    const max = 25;
    const margin = ((inp.sellRate - inp.buyRate) / inp.buyRate) * 100;
    const pts = Math.max(-max, Math.min(max, (margin / 2) * max));
    factors.push({
      key: "margin",
      label: "Realised margin",
      points: pts,
      max,
      detail: `Sell − Buy = ${margin >= 0 ? "+" : ""}${margin.toFixed(2)}%`,
    });
  }

  // 3. Inventory availability (for sells) — up to 15 pts
  if (inp.side === "sell" && inp.amount > 0) {
    const max = 15;
    const avail = inp.inventoryAvailable ?? 0;
    let pts = 0;
    let detail = "";
    if (avail <= 0) {
      pts = -max;
      detail = "No inventory — needs sourcing";
    } else if (avail >= inp.amount * 1.5) {
      pts = max;
      detail = `Plenty available (${avail.toLocaleString()})`;
    } else if (avail >= inp.amount) {
      pts = max * 0.7;
      detail = `Enough inventory (${avail.toLocaleString()})`;
    } else {
      pts = -max * 0.5;
      detail = `Short by ${(inp.amount - avail).toLocaleString()}`;
    }
    factors.push({ key: "inventory", label: "Inventory", points: pts, max, detail });
  }

  // 4. Market data freshness — up to 10 pts
  {
    const max = 10;
    const ageMin = inp.marketAgeMinutes ?? null;
    let pts = 0;
    let detail = "No market data";
    if (ageMin != null) {
      if (ageMin <= 5) { pts = max; detail = "Market data live (<5m)"; }
      else if (ageMin <= 15) { pts = max * 0.6; detail = "Market data recent (<15m)"; }
      else if (ageMin <= 60) { pts = 0; detail = "Market data delayed"; }
      else { pts = -max; detail = "Market data stale — verify manually"; }
    }
    factors.push({ key: "freshness", label: "Market data quality", points: pts, max, detail });
  }

  // 5. Trade size / liquidity — up to 5 pts (small = safer)
  {
    const max = 5;
    // Heuristic: >100k pivot units of AED-equiv is a big deal.
    const amt = inp.amount || 0;
    let pts = amt <= 10_000 ? max : amt <= 100_000 ? max * 0.5 : 0;
    factors.push({
      key: "liquidity",
      label: "Liquidity / size",
      points: pts,
      max,
      detail: amt ? `Size ${amt.toLocaleString()}` : "—",
    });
  }

  // 6. Customer risk — up to 5 pts
  {
    const max = 5;
    let pts = 0;
    let detail = "Unknown customer";
    if (inp.customerKnown) {
      pts = inp.customerHasDebt ? -max * 0.5 : max;
      detail = inp.customerHasDebt ? "Known customer with debt" : "Known customer, no debt";
    }
    factors.push({ key: "customer", label: "Customer risk", points: pts, max, detail });
  }

  // Aggregate: normalize sum of signed contributions to a 0..100 score.
  const totalMax = factors.reduce((s, f) => s + f.max, 0);
  const totalPts = factors.reduce((s, f) => s + f.points, 0);
  // Neutral trade (all points 0) → 50. Full favourable → 100. Full unfavourable → 0.
  const score = totalMax === 0 ? 50 : Math.round(50 + (totalPts / totalMax) * 50);
  const clamped = Math.max(0, Math.min(100, score));
  const b = band(clamped);
  return { score: clamped, band: b, label: bandLabel(b), factors };
}