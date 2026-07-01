# Customer Wallet & Trust Account System

Adds a full customer-funds subsystem on top of the existing exchange portal. Customer money is tracked separately from company money end-to-end.

## Scope (v1)

1. **Wallets** — every customer gets a multi-currency wallet (AED, IRR, USD, GBP, EUR, USDT + custom). Balances split into Available / Reserved / Pending, plus lifetime aggregates.
2. **Deposits** — record a customer bringing money in without any exchange; increases wallet only.
3. **Payment Orders (Withdrawals)** — customer instructs us to send their money out (bank transfer, cash, currency handover, internal, international, other). Debits wallet on completion, requires docs, supports service charges.
4. **Service Charges** — fixed / percentage / manual fee on payment orders and exchanges. Booked to a separate "Service Charge Income" ledger, reported apart from exchange profit.
5. **Customer Debt / AR** — signed wallet balance (negative = customer owes us, positive = we owe customer). Credit-limit + overdue tracking with badges.
6. **Trust separation** — dashboard cleanly shows Company vs Customer funds; customer wallet totals never roll into company cash/inventory.
7. **Customer Statement** — one page per customer showing deposits, withdrawals, exchanges, transfers, service charges, docs and running wallet balance per currency.
8. **Action Center** — new alerts for customer money awaiting transfer, debts, overdue, missing receipts, pending settlement.
9. **Reports** — Wallet, Debt, Held-for-customers, Payment orders, Service charges, Exchange profit, Daily settlement, Ledger, Aging.
10. **Mobile** — new one-page wizards for Deposit, Payment Order, Expense; extend existing Quick Sell/Buy shortcuts. Big buttons, numeric keypad, minimal typing.

## Data model

New tables (in `public`, RLS + GRANTs):

- `customer_wallets(id, customer_id, currency, available, reserved, pending, credit_limit, last_activity_at)` — one row per customer × currency, auto-created on first use.
- `customer_deposits(id, customer_id, currency, amount, deposit_account_id, entry_date, notes, settlement_status, completion_note, created_by, deleted_at, ...)` — money in without exchange.
- `payment_orders(id, customer_id, currency, amount, source_wallet_currency, method [enum: bank_transfer|cash_delivery|currency_delivery|internal|international|other], destination_bank, receiver_name, receiver_account, iban_card, country, service_charge_amount, service_charge_currency, service_fee_type [fixed|percent|manual], paid_from_account_id, entry_date, notes, settlement_status, completion_note, ...)`.
- `service_charges(id, ref_type [payment_order|sell|buy|transfer], ref_id, customer_id, currency, amount, kind, notes, entry_date)` — normalized income ledger for charges.
- Extend `documents.ref_type` enum with `deposit`, `payment_order`.
- New account_type: `customer_wallet` (auto-created 1 per currency per customer, holder_type=customer).

Triggers:

- `trg_deposit_ledger` — credit customer_wallet + debit the deposit-receiving company/cash account (no P&L).
- `trg_payment_order_ledger` — on complete: debit customer_wallet, credit destination company account (or "Delivered Out"), plus a service-charge income entry.
- `trg_wallet_recalc` — maintain `customer_wallets.available/reserved/pending/last_activity_at` from ledger + status.
- `enforce_payment_order_completion` — requires proof-of-payment doc + completion note.
- Auto-create `customer_wallet` accounts for existing + new customers (replaces / extends the current "Held by …" auto-creation for the 3-currency defaults, plus GBP/EUR/USDT).

Views:

- `customer_wallet_balances` — per customer × currency with available / reserved / pending / debt / owed_to_us / owed_to_customer / credit_status.
- `service_charge_income` — daily and per-customer aggregations.
- `company_vs_customer_funds` — segregates existing accounts into company vs customer buckets for the dashboard.

## UI

New routes under `_authenticated/`:

- `/wallets` — grid of customers with wallet totals + status badge.
- `/wallets/$customerId` — the wallet detail: per-currency balances, credit limit, deposit/withdraw buttons, timeline, statement.
- `/deposits` — list + "New Deposit" wizard (customer → currency → amount → deposit-into account → note → done).
- `/payment-orders` — list + "New Payment Order" wizard (customer → currency → amount → method → receiver → fee → source account → docs → complete).
- `/service-charges` — read-only report grouped by day/customer.
- `/reports` — one page with all report tabs (Wallet, Debt, Held, Payment orders, Service charges, Exchange profit, Daily settlement, Aging).
- `/customer-statement/$customerId` — full statement page (also linked from wallet detail).

Updates to existing pages:

- Dashboard split into two clear panels: **Company Funds** vs **Customer Funds Held / Pending / Reserved**; add Service-charge income card next to Exchange profit and Total Net Income.
- Action Center: extend alert query to include customer debts, overdue, wallet mismatches, pending payment orders, missing receipts on deposits/payment orders.
- Customers table: show wallet status badge (Good / Small debt / High debt / Over limit) and `credit_limit` editor.
- Mobile bottom nav: add `Deposit` and `Payout` shortcuts alongside Quick Sell.

Wizards share a common pattern from Quick Sell: numeric keypad input, recent customers, live wallet-balance-after preview, "Save as draft" vs "Complete" (with proof requirement), sticky footer.

## Trust separation rules

- Customer wallet accounts (`account_type = 'customer_wallet'`) are **excluded** from all company cash / inventory / balance rollups.
- Dashboard queries filter `account_type <> 'customer_wallet'` for company totals and use the new view for customer totals.
- Buy/Sell/Expense/Transfer forms disallow selecting a customer wallet as the company source unless the txn is explicitly a customer exchange (in which case wallet debits happen through the payment-order or sell flow).

## Non-goals (v1)

- No FX auto-revaluation of wallet balances into a reporting currency.
- No customer login portal — everything is operator-facing.
- Custom currencies are supported via the existing free-text currency column; no per-tenant currency admin UI beyond what already exists.

## Rollout order

1. Migration: enums, `customer_wallets`, `customer_deposits`, `payment_orders`, `service_charges`, doc-type extension, triggers, views, auto-create wallets for existing customers.
2. Wallet + Deposit UI + wizard.
3. Payment Order UI + wizard + service charges.
4. Dashboard trust-separation panel + new Action Center alerts.
5. Customer statement page + Reports hub.
6. Mobile shortcut buttons + polish.

## Open question

Anything you want deferred (e.g. skip Reports hub for v1, or ship only Deposits + Payment Orders first)? Otherwise I'll build the full scope above in order.
