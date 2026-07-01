
This is a large pass. I'll ship it in one go, focused on the daily-use surface, without breaking the accounting engine already in place.

## 1. Rounding + formatting (foundation)
Update `src/lib/exchange.ts`:
- `roundAmount(v, currency)`: IRR → `Math.round`; AED/USD/GBP/EUR/USDT → round to 4 decimals.
- `fmt(v, currency)`: IRR whole numbers; others up to 4 decimals, trailing zeros trimmed.
- `fmtProfit(v, currency)`: always 2 decimals.
- Add GBP/EUR/USDT to `CURRENCIES` so the picker exposes them.
Apply `fmtProfit` on dashboard/sell profit columns; `fmt` everywhere else picks up the new rounding automatically.

## 2. Mobile shell
`src/components/app-shell.tsx`:
- Sidebar collapses to a bottom sheet on mobile (Sheet component already used).
- Add sticky mobile bottom nav bar with 5 tiles: Dashboard, Quick Sell, Buy, Expense, Pending. Fixed, safe-area padding, hidden on `md:`.
- Larger tap targets, `inputMode="decimal"` on all numeric inputs (new helper `<NumberInput>` in `src/components/number-input.tsx`).

## 3. Dashboard fast-actions
`src/routes/_authenticated/dashboard.tsx`:
- Replace top row with 3 big primary buttons: "New Sell" (biggest, emerald), "New Buy", "New Expense". Full-width on mobile.
- Keep balances + Action Center; move quick-action tiles below.
- Recent-customers strip: last 6 distinct customers from sells (chips → link to Quick Sell with `?customer=`).
- Recent-accounts strip: last 6 distinct accounts touched (chips → link to Quick Sell with `?src=`).

## 4. Quick Sell wizard (main deliverable)
New route `src/routes/_authenticated/quick-sell.tsx` — single page, 8 collapsible sections, but all visible on desktop and stacked on mobile with sticky "Save Draft / Complete" footer.

Behavior:
- Step-by-step highlighting via a small stepper; each step auto-advances but any step is editable.
- **Auto-fills**: last used sell rate for the pair (query `sell_transactions` desc); available balance of chosen source (from `account_balances` view); last customer if `?customer=` in URL.
- **Live panel** always visible: cost rate (`avg_buy_rate` RPC), sell rate, gross profit, today's expense allocated=0 (informational), net profit = gross, Milad share, Ali share.
- Warnings: `sold_amount > available balance` → red banner "Selling more than available"; if result would push account negative → red banner. Non-blocking (can still save draft).
- Missing steps checklist under Complete button ("Payment proof missing", "Delivery proof missing", "Completion note missing").
- Two save buttons: **Save as Draft** (no doc checks) and **Complete** (invokes existing trigger; if it fails, shows toast with the DB message).
- Camera upload: existing `DocumentsPanel` already uses `<input type="file">`; add `capture="environment"` attribute so mobile opens the camera by default. Add the same to expense/buy/transfer upload buttons.

## 5. Smart labels
Extend `src/components/settlement-status-badge.tsx` with computed labels driven by transaction state, not just `settlement_status`:
- Pending payment (money_holder set, not received)
- Pending delivery (payment received, no delivery doc)
- Missing receipt (completed intent but doc missing)
- Held by person (any holder ≠ customer)
- Profit ready (completed and gross_profit > 0)
- Loss warning (gross_profit < 0)
- Needs action (any of the above except Completed/Profit ready)
Render as a small pill group on the Sell/Buy/Expenses tables and on Quick Sell.

## 6. Global search
New route `src/routes/_authenticated/search.tsx` + a header search icon that opens a `<CommandDialog>` (already in shadcn) triggered by `/`.
Searches (client-side across pre-loaded caches; falls back to server `ilike` for large datasets):
- customers (name, phone, card_number, account_number)
- accounts (name, iban, card_number)
- sell/buy/expense (by amount, currency, id prefix, date, description)
Results grouped by type with links to the relevant page + dialog.

## 7. Transaction timeline
Add `src/components/txn-timeline.tsx`. Renders vertical list of events for a transaction:
1. Created (from `created_at`)
2. Money received (first `payment_receipt`/`bank_transfer_screenshot` doc date, or `settlement_status=payment_received`)
3. Currency delivered (first `currency_handover_proof`/`cash_delivery_receipt` doc date, or `settlement_status=currency_delivered`)
4. Receipt uploaded (any doc after step 2)
5. Completed (`settlement_status=completed`)
6. Edit history (from `audit_logs` filtered by ref_id)
Embed inside `TxnDetailDialog` (buy/sell/expense/transfer).

## 8. Strict rules
- Audit log on delete: DB migration adds `trg_audit_delete` triggers on buy/sell/expense/transfer/brought_in writing to `audit_logs` (table already exists) with actor `auth.uid()`, action `delete`, snapshot in JSON. Ensures "no delete without audit log".
- The existing enforce_*_completion triggers already prevent "completed without proof"; no change.
- "No silent balance changes" — existing ledger triggers already recompute on every update.

## Technical notes
- All new components use existing shadcn primitives (Sheet, Command, Tabs, Badge, Card).
- New route `/quick-sell` and `/search` added to `app-shell.tsx` sidebar + mobile bottom nav.
- Existing `/sell` page stays as the advanced form; Quick Sell becomes the default entrypoint.
- No new npm deps.
- `capture="environment"` added to file inputs — Chrome/Safari on iOS/Android open the camera; desktop unaffected.
- All new inputs use `inputMode="decimal"` and `type="text"` (not `type="number"`) to avoid mobile browser step arrows and to allow custom decimal parsing per currency.
- Only one DB migration (audit delete triggers). No schema-breaking changes.

## Out of scope this pass (call out for later)
- Full offline/PWA install — separate task.
- IRR-specific numeric keypad component (uses OS keypad for now).
- Server-side full-text search index — command palette runs on last-500 caches, which is fast enough for daily use.
