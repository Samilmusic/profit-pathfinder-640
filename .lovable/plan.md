# Exchange OS Upgrade Plan

**Ground rules:** Keep every existing table, page, form, RLS policy, storage bucket, auth flow, and row of data. All work is additive — new columns, new tables, new pages, and visual polish on top of what's already shipped. Nothing gets renamed or dropped.

## 1. Database (safe, additive migrations)

Inspect first, then run small migrations in this order — each one is idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`):

1. **Settlement status enum extension** — extend `settlement_status` with the missing values (`waiting_payment`, `payment_received`, `waiting_delivery`, `currency_delivered`, `waiting_receipt`, `cancelled`). Keep existing `draft` / `completed` untouched. Backfill: any legacy row with NULL stays where it is; no forced re-classification.
2. **Money location** — add `money_location` enum (`cash_box`, `aed_bank`, `toman_bank`, `foreign_bank`, `held_milad`, `held_ali`, `held_customer`, `pending_delivery`, `pending_deposit`) and a nullable `money_location` column on `buy_transactions`, `sell_transactions`, `transfers`, `deposits`, `payment_orders`, `expenses`. Derive a default from existing `holder_type` / account type where possible; otherwise leave NULL.
3. **Expense taxonomy** — add `expense_kind` enum (petrol, parking, delivery, transfer_fee, bank_charge, personal_ali, business, other) plus `reduces_profit boolean default true`, `related_txn_ref_type`, `related_txn_ref_id` on `expenses`.
4. **Payment order polish** — ensure `receiver_name`, `receiver_bank`, `receiver_account`, `is_free_service`, `service_charge_currency` exist; add any missing ones.
5. **Audit log** — new table `audit_events (id, actor_id, entity_type, entity_id, action, old_value jsonb, new_value jsonb, reason, created_at)` with RLS + GRANTs. Triggers on `buy_transactions`, `sell_transactions`, `transfers`, `expenses`, `deposits`, `payment_orders`, `brought_in_money` capture UPDATE/DELETE diffs. Deletes become soft-deletes (`deleted_at`) with a reversal ledger entry — never physically remove financial rows.
6. **Ali capital view** — SQL view `ali_capital_summary` aggregating brought_in, withdrawals, share of realized profit, cash currently in company accounts. Read-only, `security_invoker=true`.
7. **Dashboard rollups** — views: `today_profit`, `month_profit`, `total_assets_by_currency`, `cash_available`, `money_in_circulation`, `customer_funds_held`, `service_fees_mtd`, `roi_summary`. All `security_invoker=true`, respect existing RLS.

## 2. Command Center (new page)

New route `src/routes/_authenticated/command-center.tsx`. Pure action-item board — grouped cards with counts + drill-down links:
- Held by Milad / Ali / Customer (per currency)
- Missing receipts, Pending delivery, Pending payment
- Customer debt, Negative balances, Low cash warnings
- Transactions not completed, Daily closing missing

Data comes from existing tables + the new rollup views. Each card links into the relevant filtered list.

## 3. Dashboard upgrade

Rework `src/routes/_authenticated/dashboard.tsx` in place — same route, richer content:
- Hero KPI row: Total assets, Today's profit, Monthly profit, Cash available
- Second row: Money in circulation, Customer funds held, Service fees MTD, ROI
- Ali capital summary card
- Pending settlements + Open tasks + Expenses today
- Sparkline charts (recharts, already installed) for profit + assets trend

## 4. Transaction forms

Upgrade — not replace — the existing Deposit / Buy / Sell / Transfer / Expense forms:
- Large mobile-first inputs (reuse `NumberInput`)
- Live calculation panel + selected-account balance preview
- Negative-balance warning banner
- "Save as Draft" vs "Complete" with document gate (already enforced server-side)
- Extended settlement status dropdown
- Money location selector

Expenses form gains: expense kind, reduces-profit toggle, related transaction picker.

## 5. Payment Orders

Extend existing `payment-orders.tsx` with receiver bank/account/IBAN fields, free-vs-paid service toggle, and receipt requirement gate.

## 6. Ali Investor page

New route `src/routes/_authenticated/ali-investor.tsx`: initial capital, current capital, net profit, ROI, withdrawals, pending capital, money working, cash available, profit share, recharts line + donut.

## 7. Profit sharing

Existing sell trigger already computes Milad/Ali split. Surface it: dashboard card + per-transaction breakdown (gross, expense deduction, net, Milad share, Ali share). Per-transaction override already supported via `milad_share_pct`.

## 8. Audit log page

New route `src/routes/_authenticated/audit.tsx` — searchable feed of `audit_events` with old/new diff viewer. Admin-only.

## 9. UI polish

Update `src/styles.css` design tokens for premium light-fintech look: refined neutrals, subtle glass surfaces (`backdrop-blur`, translucent cards), softer shadows, tighter type scale, motion tokens. Apply across shell, cards, tables, KPI tiles. No component API breakage.

## 10. Auth

No changes. Sign-up already restricted in practice to Milad/Ali via role assignment. Leave `/auth` as-is.

## Out of scope (explicit)

- No public customer portal, no customer login
- No table renames or drops
- No destructive data migration
- No new backend framework — stays on Supabase + TanStack Start

## Delivery order

1. Migration batch (enums + columns + audit + views)
2. Command Center + Dashboard rebuild on new views
3. Form upgrades (shared components)
4. Ali Investor + Audit pages
5. UI token polish pass

Ready to execute on approval.
