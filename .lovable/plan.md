
# Exchange Portal — Simplification & Accounting Repair

This is a large, multi-phase upgrade. To keep it safe (no data loss, no schema resets, no auth rebuild) and reviewable, I will ship it in **3 phases across multiple turns**, not all at once. Each phase ends in a working, testable state.

Before I start, I need you to confirm the plan and a few key decisions. Everything is additive — old records, migrations, triggers, and pages stay intact.

---

## Phase 1 — Financial integrity (backend, invisible to daily users)

Goal: one source of truth, correct math, safe closing.

1. **Unified deal codes** via one Postgres sequence per prefix (`BUY`, `SELL`, `MATCH`, `BR`, `TRF`, `EXP`). Reuse existing `doc_counters` / `next_doc_no`. Backfill missing codes for existing rows; never regenerate existing ones.
2. **Three trade modes** stored on `trade_cycles.cycle_kind`: `buy_only`, `sell_from_inventory`, `matched_direct`. Existing rows keep their current kind.
3. **Buy-only mode**: creates inventory lot + ledger for payment source only. No sell record, no realized profit. (Already mostly works via `buy_transactions` — I'll expose it as its own mode instead of forcing the New Trade combo.)
4. **Sell-from-inventory**: FIFO stays as-is; add AED-equivalent profit column computed from stored reference rate; expose lot allocation under Advanced only.
5. **Matched-direct**: new posting rules — no company IRR movement, only profit ledger to a **mandatory profit destination account** (or a new `profit_receivables` row if unpaid). Fixes the current bug where matched trades don't appear in dashboard profit / open deals.
6. **Close rules**: remove silent failures. New RPC `validate_close(deal_id)` returns a JSON checklist. UI shows exact missing items. `_override` becomes a separate admin RPC `admin_force_close(deal_id, reason)` that writes to `audit_events`.
7. **Reconciliation**: new view `v_balance_reconciliation` comparing ledger vs inventory vs account. New admin RPC `admin_reconcile(reason)` that logs corrections — never silently rewrites history.
8. **Currency-agnostic rate model**: helper `compute_received(paid_amount, paid_ccy, received_ccy, rate, base_ccy, quote_ccy)` used by all three modes.
9. **Bonbast normalization**: audit the fetcher; ensure Toman→IRR ×10 happens exactly once (already fixed previously — I'll add a unit test guard).
10. **Automated tests**: Vitest suite hitting the DB via server functions for the 18 scenarios you listed. Runs in CI on every migration.

Deliverable: one forward-only migration + a `tests/accounting/` folder. No UI changes yet.

---

## Phase 2 — Daily simplicity (UI)

1. **New Trade** rewritten as **3-card mode picker** → focused form per mode. All accounting fields hidden by default; only "What did we pay / receive / rate / who / where / where's the profit / proof".
2. **Deal Details** simplified to Summary → Timeline → Advanced (collapsed). Uses the validation checklist from Phase 1.
3. **Milad Box** — rename the user-facing string "Ali Cash Box" → "Milad Box" in code + a soft migration (`UPDATE accounts SET name = replace(name, 'Ali Cash Box', 'Milad Box')` only for auto-created rows; no ID changes). The Box→Location→Currency hierarchy already exists.
4. **Number formatting**: audit every money input, replace stragglers with `<NumberInput />`.
5. **Documents**: verify camera/gallery/PDF upload works on iOS Safari across all three modes.

---

## Phase 3 — Dashboard, navigation, cleanup

1. Dashboard reads only from the reconciled view. Per-currency cards, no mixed totals by default.
2. Realized AED profit query includes matched trades + service income − profit-reducing expenses.
3. Nav trimmed to 8 top items + Advanced group. Mobile: 5 items.
4. Remove duplicate "New Trade" buttons; keep one FAB.
5. Refactor oversized route files (`sells.$id.tsx`, `trades.new.tsx`) into `components/` + `lib/` modules.

---

## Technical notes

- **One forward-only migration** per phase. No history rewrites, no drops of existing tables/policies unless replacing an incorrect one in place.
- **Auth untouched.** No changes to Supabase auth, RLS helpers, or role model.
- **Data preserved.** All renames use `UPDATE`, not `DROP`. Cancel/reversal instead of delete.
- **Score** renamed everywhere from "AI Deal/Trade Score" to **"Trade Quality Score"** with visible factor breakdown. The Gemini-powered Business Brain chat keeps the "AI" label since it *is* an LLM.

---

## What I need from you before I start

1. **Scope confirmation**: Do you want me to proceed with all 3 phases across the next several turns, or only Phase 1 first and then decide?
2. **Milad Box rename**: OK to update the display name on existing auto-created accounts (e.g. "Ali Cash Box (AED)" → "Milad Box (AED)")? IDs and balances stay identical.
3. **Existing matched trades**: Some already exist in `trade_cycles` without a profit destination. On the first Phase-1 migration, should I (a) leave them as-is and require admin to set a destination before they count in dashboard profit, or (b) auto-assign them to a "Profit — Unassigned (AED)" holding account you can reclassify later?
4. **Test runtime**: Vitest tests will hit the real Supabase project (read-only + rollback). OK, or do you want a separate test schema?

Reply with answers (or "go ahead with defaults: full scope, yes rename, option b, real DB") and I'll start Phase 1 in the next turn.
