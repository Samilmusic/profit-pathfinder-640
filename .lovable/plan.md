## Sell Workflow → Deal Lifecycle Upgrade

Replace "Draft" concept with a real **Deal Status** state machine on sell transactions. Inventory still decreases immediately on save; profit is only realized when the deal is closed with payment confirmed.

### 1. Database (migration)

Add to `sell_transactions`:
- `deal_status` enum: `open`, `waiting_payment`, `partially_paid`, `waiting_receipt`, `ready_to_close`, `closed`, `cancelled` (default `open`)
- `amount_received` numeric default 0
- `payment_difference_reason` text
- `closed_at`, `closed_by`
- `expected_payment_date` date (optional, drives "Overdue")

New table `sell_payments` (customer payments against a sell):
- `sell_id`, `entry_date`, `currency`, `amount`, `received_into_account_id`, `notes`, standard audit cols
- ledger trigger: credits `received_into_account_id`
- trigger recomputes `amount_received` and `deal_status` on parent sell:
  - sum < received_amount → `partially_paid`
  - sum >= received_amount AND has receipt doc → `ready_to_close`
  - none yet → `waiting_payment`

Update sell triggers:
- `trg_sell_ledger_after`: only post the **received** leg when `deal_status = 'closed'`; sold-leg (inventory out) always posts on insert.
- `trg_sell_calc_and_ledger`: only feed `recompute_cycle_profit` on close.
- Remove `enforce_txn_completion` gate tied to `settlement_status='completed'` for sells; add `enforce_sell_close` that requires: receiving account, amount_received ≥ received_amount (or reason), receipt doc (unless admin override flag).

RPC `close_sell_deal(_id, _override boolean)` — validates, sets `deal_status='closed'`, posts received leg, sets `closed_at/by`.
RPC `cancel_sell_deal(_id, _reason)` — restores lots via existing consumption reverse path, sets `cancelled`.

### 2. Sell form (`sell.tsx` + `quick-sell.tsx`)

- Remove any "Save as Draft" wording.
- Primary bottom bar (mobile-safe, sticky, `safe-area-inset-bottom`):
  - `Save as Open Deal` (creates sell with `deal_status='open'`, inventory out, no received-leg yet)
  - `Save & Close Now` (only enabled if receiving account + receipt + amount known — same-day cash sales)
  - `Cancel`
- Receiving account no longer blocks Open Deal save (it's needed only to close).
- Show live status preview: "This will create an Open Deal. Customer will owe {received_amount} {ccy}."

### 3. Deal detail page (`sells.$id.tsx` — new route)

- Header: deal code, status badge, customer, sold/received summary.
- **Payments panel**: list `sell_payments`; "+ Record payment" (amount, account, date, receipt upload).
- **Documents panel**: reuse existing `DocumentsPanel`.
- **Timeline**: Created → AED Delivered → Waiting for Payment → Receipt Uploaded → Payment Confirmed → Closed.
- **Close Deal** button: enabled only when validation passes; opens confirm modal (+ optional difference reason).
- **Cancel Deal** button (admin/writer) with mandatory reason.

Existing `sell.tsx` list rows link to this detail page and show the new status badge.

### 4. Command Center

Add widgets driven by `deal_status`:
- Open Deals · Waiting for Payment · Partially Paid · Waiting for Receipt · Ready to Close · Overdue Deals (>expected_payment_date or >3d old and not closed).

### 5. Terminology sweep

Grep and remove "Draft" from sell-related UI, toasts, dialogs, and empty states. Keep "Draft" untouched elsewhere (e.g. customer bank-account drafts) — scoped to Sell only.

### Technical notes

- Migration adds enum, columns, table, triggers, RPCs, and GRANT/RLS for `sell_payments` (authenticated CRUD via `can_write`, service_role all).
- `recompute_cycle_profit` already ignores non-closed sells once we gate its trigger on `deal_status='closed'`.
- Backward-compat: existing sell rows get `deal_status='closed'` (they already posted received leg). Migration sets that default for historical rows.
- Mobile: reuse existing sticky action bar pattern from Brought-In / Accounts new pages.

### Out of scope

- No change to Buy, Deposit, Brought-In, Transfer workflows.
- No change to profit-sharing math.
