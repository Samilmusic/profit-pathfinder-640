/**
 * Unified human-readable "deal codes" derived from existing records.
 * No DB migration — we build the code from doc_no (when present) or from
 * the row's id + entry_date. Purely display-side.
 */

export type DealKind =
  | "sell" | "buy" | "brought_in" | "expense" | "transfer" | "deposit" | "payment_order" | "remittance";

const PREFIX: Record<DealKind, string> = {
  sell: "DEAL",
  buy: "BUY",
  brought_in: "BR",
  expense: "EXP",
  transfer: "TRF",
  deposit: "DEP",
  payment_order: "PO",
  remittance: "REM",
};

export function kindLabel(k: DealKind): string {
  const m: Record<DealKind, string> = {
    sell: "Sell", buy: "Buy", brought_in: "Brought-In",
    expense: "Expense", transfer: "Transfer",
    deposit: "Deposit", payment_order: "Payment Order",
    remittance: "Remittance",
  };
  return m[k] ?? k;
}

/**
 * Derive a display deal code.
 *  - If the row has `doc_no` (e.g. "SELL-2026-000042"), reuse it verbatim.
 *  - Otherwise synthesize PREFIX-YYYY-<shortid> from entry_date + id.
 */
export function dealCode(kind: DealKind, row: { id?: string | null; doc_no?: string | null; entry_date?: string | null; created_at?: string | null }): string {
  if (row?.doc_no && String(row.doc_no).trim() !== "") return String(row.doc_no);
  const p = PREFIX[kind] ?? "REC";
  const raw = row?.entry_date ?? row?.created_at ?? "";
  const year = raw ? String(raw).slice(0, 4) : new Date().getFullYear().toString();
  const suffix = row?.id ? String(row.id).replace(/-/g, "").slice(0, 6).toUpperCase() : "XXXXXX";
  return `${p}-${year}-${suffix}`;
}

/** Route each kind to its detail/edit page. */
export function kindHref(kind: DealKind, id: string): string {
  switch (kind) {
    case "sell": return `/sells/${id}`;
    case "buy": return `/buy`;
    case "brought_in": return `/brought-in`;
    case "expense": return `/expenses`;
    case "transfer": return `/transfers`;
    case "deposit": return `/deposits`;
    case "payment_order": return `/payment-orders`;
    case "remittance": return `/remittances/${id}`;
  }
}