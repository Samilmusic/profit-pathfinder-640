## Lot-Based Inventory & Sell Profit Engine — Redesign

Reuse everything that exists (`inventory_lots`, `lot_consumptions`, `sell_transactions`, `currency_inventory` view, market_rates). No data will be deleted, no lots merged. What changes is how cost basis is tracked, how it is surfaced in the UI, and how profit is computed and frozen.

---

### 1. Schema additions (single migration)

**inventory_lots**
- `cost_basis_status text NOT NULL default 'known'` — one of `known`, `unknown`, `capital` (no cost basis, explicitly flagged as capital).
- `allocation_mode text default 'fifo'` (informational, drives Sell form only).

Backfill: existing rows with `cost_basis_rate IS NULL OR cost_basis_rate = 0` → `unknown`; everything else → `known`.

**sell_transactions — permanent profit snapshot (frozen at close)**
- `cost_basis_snapshot jsonb` — array of `{lot_id, lot_code, take, cost_rate, cost_currency, cost_amount}`.
- `allocated_cost_irr numeric`, `allocated_cost_currency text`, `allocated_cost_amount numeric`.
- `sale_value_amount numeric`, `sale_value_currency text`.
- `linked_expenses_amount numeric default 0`.
- `net_profit_irr numeric`, `net_profit_aed numeric`, `margin_pct numeric`.
- `market_reference_rate numeric`, `market_reference_source text`, `market_reference_time timestamptz`.
- `profit_frozen_at timestamptz`, `profit_frozen_by uuid`.
- `allocation_mode text default 'fifo'` — `fifo` | `weighted_average` | `manual`.
- `manual_allocation jsonb` — used when `allocation_mode = 'manual'`.

**New RPC: `preview_sell_allocation(_currency, _amount, _source_account_id, _mode, _manual jsonb)`**
Returns `{lots: [...], covered, shortfall, blended_cost_rate, cost_basis_currency, total_cost, has_unknown_cost, unknown_amount}`. Pure — never writes.

**New RPC: `freeze_sell_profit(_sell_id uuid)`**
Called from `close_sell_deal` (existing) *after* the ledger is posted:
1. Read all `lot_consumptions` for this sell.
2. Sum cost, compute sale value = `sold_amount * sell_rate`.
3. Read latest AED market rate at close time to compute AED equivalents.
4. Pull linked expenses (via `expenses.linked_sell_id` if present; otherwise 0).
5. Write `cost_basis_snapshot` + all snapshot columns above.
6. Insert audit entry `sell.profit_frozen`.
Idempotent — refuses to overwrite unless called with `_recompute := true` (Accounting Correction path with reason).

**New RPC: `assign_lot_cost_basis(_lot_id, _cost_rate, _cost_currency, _reason)`**
For "Direct Deposit / Capital" lots — admin-only, writes audit entry.

**View: `v_currency_inventory_summary`** (per currency)
Columns: `currency, available_amount, known_cost_amount, unknown_cost_amount, capital_amount, weighted_avg_cost_rate, cost_basis_currency, lot_count, market_buy, market_sell, estimated_value_irr, unrealized_profit_irr, unrealized_profit_aed`.
- Weighted avg uses only lots with `cost_basis_status = 'known'` AND `remaining_amount > 0` AND `status IN ('available','partial')`.
- Never includes depleted/cancelled/reversed lots, pending receivables, or lots with unknown cost.

**View: `v_lot_detailed`**
`lot_code, currency, original_amount, remaining_amount, sold_amount, cost_basis_rate, cost_basis_currency, cost_basis_status, source_ref_type, source_ref_id, source_description, account_id, account_path, entry_date, age_days, status, market_rate, unrealized_pl, unrealized_pl_pct`.
`account_path` = "Milad Box → ENBD → AED"-style breadcrumb built from `accounts.parent_id`.

---

### 2. Backend: sell close pipeline

`close_sell_deal(_id, _override, _difference_reason)` becomes:

```text
1. Existing FIFO consumption logic (unchanged) — still writes lot_consumptions
2. NEW: call freeze_sell_profit(_id)
3. Existing ledger posting & received-lot creation on payment (unchanged)
```

Manual allocation: if `sell_transactions.allocation_mode = 'manual'` at close time, the FIFO trigger reads `manual_allocation` instead of walking lots in FIFO order. Validation ensures every referenced lot has enough `remaining_amount` and same currency.

Guard rails:
- Refuse to close if `preview_sell_allocation` reports `has_unknown_cost = true` AND admin has not ticked "Sell without recorded cost basis". This blocks silent fake-profit.
- Received-currency lot creation stays on the payment-received event — unchanged.

---

### 3. Frontend — Currency Inventory page (`inventory.tsx`)

Replace the current 7-tab table view with a hero-summary + lots layout, one section per currency.

Per-currency card:

```text
┌───────────────────────────────────────────────────────────────┐
│ AED                                            22,984 AED     │
│                                                                │
│  Available            Known cost      Unknown cost   Capital  │
│  22,984              18,500          4,484          0         │
│                                                                │
│  Weighted avg cost   Market buy      Market sell              │
│  483,250 IRR/AED     522,500         523,000                  │
│                                                                │
│  Estimated value ≈ 12,019,832,000 IRR                         │
│  Unrealized P/L    +735,000,000 IRR  ≈ +1,405 AED             │
└───────────────────────────────────────────────────────────────┘
```

Under it, one row per lot:
`AED-LOT-001 · 10,000 avail · 476,000 IRR/AED · Milad Box → Cash → AED · 12 days old · Available · Unrealized +46,500,000 IRR`

Lots with `cost_basis_status = 'unknown'` render **"Cost Basis: Not Recorded"** in muted red with an inline **[Assign Cost]** action (admin only) that opens a dialog calling `assign_lot_cost_basis`. Lots marked `capital` render **"Capital — no P/L"** and are excluded from unrealized-profit math.

Filter chips: `All / Known / Unknown / Capital / Depleted` (default: hide Depleted).

The existing tabs stay behind a "Details" toggle for auditability (allocations, profit-by-lot, etc.).

---

### 4. Frontend — Sell form (`sell.tsx` + `trades.new.tsx` sell mode)

Replace the current "FIFO cost preview" block with a redesigned **Inventory Cost Preview** card driven by `preview_sell_allocation`:

- Header: allocation-mode picker `FIFO · Weighted Avg · Manual`.
- Manual mode reveals a lot table with amount inputs per lot (validated against `remaining_amount`); server RPC returns a manual preview.
- Lot list: `LOT-CODE · take × cost_rate` with per-lot subtotals.
- Cost calculation block: sum lines like `10,000 × 476,000 = 4,760,000,000 IRR`.
- **Total cost / Effective cost rate / Sale value / Realized profit IRR / Profit in AED**, exactly per spec §5.
- If `has_unknown_cost`, replace the profit box with a red warning: *"Cannot calculate exact profit: X AED inventory has no recorded cost basis."* No fake numbers shown.
- Sub-card "Expected Profit" (large) below, per spec §11, with `Spread`, `Expected Net Profit`, `Inventory After Sale`.

Manual-mode warning: if manual allocation total cost > FIFO total cost, show *"Manual allocation reduces profit by X IRR vs FIFO"*.

Save-close button is disabled with a reason when: shortfall > 0, unknown-cost blocks profit and override not ticked, or manual allocation is incomplete.

---

### 5. Currency card / dashboard IRR fix

`CurrencyLedger` component:
- For IRR: hide `Avg Cost`, `Market`, `Floating P/L` tiles (they show `1` today). Instead show "Cash Balance" only. Add a subtitle "Settlement cash — no floating P/L".
- For AED/USD/etc.: pull `weighted_avg_cost_rate` and `market_sell` from `v_currency_inventory_summary` — not the raw ledger — so tiles never render `0` or `1` again.

Bonbast rate normalization already stores IRR/unit (post-fix Toman×10). Sanity clamp: any rate < 100 for IRR pair is treated as missing.

---

### 6. Immutability of closed-deal profit

- `freeze_sell_profit` writes once. `cost_basis_snapshot` and all `net_profit_*` columns are the only source of truth for reports after close.
- Reports (`profits.tsx`, `dashboard.tsx`, `ali-investor.tsx`) read `net_profit_irr / net_profit_aed` from `sell_transactions` for closed deals, not recomputed from current lots.
- A future **Accounting Correction** action (admin + reason, out of scope for this task's UI but the RPC path is wired) can call `freeze_sell_profit(_id, _recompute := true)` and creates an audit event.

---

### 7. Data audit / cleanup

Migration includes a `SELECT` reporting script (as comment) but does **not** mutate historical data. Two safe backfills only:
- Set `cost_basis_status = 'unknown'` on lots with rate 0/NULL.
- For sells already closed with FIFO consumption, populate `cost_basis_snapshot`, `allocated_cost_amount`, `net_profit_irr`, and `net_profit_aed` from existing `lot_consumptions` + a lookup market rate at their close date (best-effort — if no market rate exists, leave AED profit NULL). This gives immediate consistent reporting without losing history.

---

### Technical notes

- All new views run `security_invoker = on` and grant `SELECT` to `authenticated`.
- All new RPCs are `SECURITY INVOKER`, `EXECUTE` granted to `authenticated`; the admin-only `assign_lot_cost_basis` checks `has_role(auth.uid(), 'admin')` internally.
- No changes to `close_sell_deal` signature — it calls `freeze_sell_profit` in-transaction.
- Frontend uses `useSuspenseQuery` where already established, `useQuery` for the preview RPC (called on every keystroke, debounced 150ms).
- Numeric inputs continue to use the existing `NumberInput` component (thousands separators, raw persistence).

### Files touched

- **Migration**: 1 new file (schema + views + RPCs + backfill).
- `src/routes/_authenticated/inventory.tsx` — rebuilt around per-currency hero cards.
- `src/routes/_authenticated/sell.tsx` — new Inventory Cost Preview block.
- `src/routes/_authenticated/trades.new.tsx` — same preview block in "Sell from Inventory" mode.
- `src/components/currency-ledger.tsx` — IRR-aware tiles + summary-view driven values.
- `src/routes/_authenticated/dashboard.tsx` — currency cards read `v_currency_inventory_summary`.
- New `src/components/inventory-cost-preview.tsx` (shared between Sell and Quick-Sell).
- New `src/components/lot-cost-basis-dialog.tsx` (admin "Assign Cost" flow).
- `src/lib/inventory.ts` — client helpers (weighted avg, formatting).
