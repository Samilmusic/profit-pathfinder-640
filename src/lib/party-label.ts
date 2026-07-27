/**
 * Presentation-only helper: resolves the human identity of a transaction.
 *
 * Fallback priority (per operator requirement):
 *   customer.name → supplier.name → counterparty.name → beneficiary.name
 *   → account.name → "Unknown"
 *
 * No accounting logic lives here — labels only.
 */

// Values that are ownership/bookkeeping tags, never a real party identity.
const PLACEHOLDERS = new Set([
  "shared",
  "unknown",
  "unnamed",
  "unnamed customer",
  "unnamed supplier",
  "n/a",
  "-",
  "—",
]);

export function cleanName(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (PLACEHOLDERS.has(s.toLowerCase())) return null;
  return s;
}

/** First real party name from the candidate chain, else "Unknown". */
export function partyLabel(...candidates: unknown[]): string {
  for (const c of candidates) {
    const n = cleanName(c);
    if (n) return n;
  }
  return "Unknown";
}

/** Same chain but returns null when nothing real exists (for conditional UI). */
export function partyLabelOrNull(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    const n = cleanName(c);
    if (n) return n;
  }
  return null;
}

/** Looks up an account name from an id→name map. */
export function accountName(
  map: Map<string, string> | undefined,
  id: string | null | undefined,
): string | null {
  if (!map || !id) return null;
  return cleanName(map.get(id));
}
