## Scope

20 premium UX/productivity upgrades. Accounting logic, database triggers, profit rules and settlement math stay exactly as they are. Everything below is presentation, indexing, and small helper tables.

Because this is a very large surface area, I will ship it in **4 phases** so you can review after each. Say "go" and I start Phase 1. Between phases you can reorder or drop items.

---

## Phase 1 — Foundations that everything else reuses

1. **Auto document numbers** (`SELL-2026-000021`, `BUY-…`, `BR-…`, `EXP-…`)
   - Add nullable `doc_no text unique` on `sell_transactions`, `buy_transactions`, `brought_in_money`, `expenses`.
   - `BEFORE INSERT` trigger fills it from a per-year sequence. Existing rows get backfilled once.
   - Displayed everywhere the row appears (list rows, detail headers, timeline, search results).

2. **Click-to-copy everywhere**
   - Reuse existing `CopyButton`. Wrap IBAN, card, phone, reference, doc_no, account no, txn id, customer id in a new `<Copyable value>` component so it's one-line to add.

3. **Smart global search (⌘K / mobile search bar)**
   - Extend the existing command palette with a debounced multi-table query: customers (name/phone/notes), customer_bank_accounts (iban/card/bank), accounts, sell/buy/brought-in/expenses (doc_no, reference, notes, amount-as-text), sell_payments (reference), documents (filename).
   - Results grouped by category with icons, keyboard nav, Enter routes to the record.

4. **Beautiful empty states**
   - `<EmptyState icon title body action>` component. Replace bare "No rows" across lists (deals, expenses, customers, receipts, transfers, cycles, alerts).

5. **Premium UI polish pass**
   - Standardize the semantic tone tokens: `--tone-positive` (green), `--tone-warn` (orange), `--tone-danger` (red), `--tone-info` (blue) in `src/styles.css`.
   - Card hover lift, subtle fade-in on lists, consistent typography scale. No new libraries.

---

## Phase 2 — Dashboard & operator cockpit

6. **Today's Summary widget** — AED bought, AED sold, IRR received, IRR paid, open deals, closed deals, expenses, new customers, net cash movement. Backed by a SQL view `today_summary` (SUMs grouped by currency + direction, filtered on `entry_date = current_date`).

7. **Recent Activity feed** — reads existing `audit_events` (already populated by triggers). Row: time · user (from `profiles`) · human action · clickable to the record. Groups "today / yesterday / earlier".

8. **Quick Actions panel** — 5 large tap targets (New Deal, New Brought-In, New Expense, New Transfer, New Customer) at the top of the dashboard and as a mobile FAB speed-dial.

9. **Open Deal reminders** — derived from `sell_transactions.entry_date` + status: green ≤1d, yellow ≤2d, orange ≤3d, red >7d. Colored dot + tooltip on every deal row, filter chip in Deals list, count badge on the sidebar.

10. **Soft notification center** — reuse the existing `NotificationBell`. Extend derived alerts: deal aged > threshold, receipt uploaded (last 1h), rate updated, inventory below avg cost, customer payment received. Non-blocking, dismissable.

---

## Phase 3 — Deal, Customer, Account depth

11. **Deal timeline (visual)** — vertical stepper on the Sell detail page. Steps: Created → Waiting Payment → Payment Received → Receipt Uploaded → Currency Delivered → Closed. Each step is a button; popover shows date, time, user, notes. Data sources: `sell_transactions`, `sell_payments`, `documents`, `audit_events`.

12. **Customer quick profile card** — hover/click a customer opens a side sheet: outstanding balance (from `customer_credit`), last deal, last payment, last receipt, total volume, favorite currency (mode of received_currency), avg deal size, current open deals. All computed client-side from already-fetched queries plus one `customer_quick_stats(customer_id)` SQL view for speed.

13. **Inventory drill-down** — clicking an inventory currency card opens a table of lots (`inventory_lots` + `lot_consumptions`): rate, source (brought-in / sell), owner, location account, status (open/exhausted), remaining amount, age in days.

14. **Account quick stats** — opening any account shows: current balance, today's movement, this week, txn count, last txn, largest txn. Built from a single `account_quick_stats` view keyed by `account_id`.

15. **Rate comparison on Buy/Sell forms** — already partially shipped via `RateComparison`; extend to show explicit "Market · Our · Δ · Δ%" row with green/red tone in the form summary card, and mirror it on the deal detail page.

---

## Phase 4 — Safeguards, closing, mobile

16. **Duplicate warning (non-blocking)** — before saving a receipt / payment, run three checks:
    - same file hash in `documents`
    - same `reference_number` on any payment in last 30d
    - same `customer + amount + ±10min` window in `sell_payments`
    Show a yellow banner with "Save anyway" / "Review".

17. **Daily Closing** — one button "Close Today" on the dashboard. Runs a `daily_reconciliation_check()` SQL function that returns issues in each bucket (open deals, missing receipts, negative balances, unmatched payments, inventory issues, duplicates). If empty → toast "Daily reconciliation completed" and insert a row in existing `daily_closings`. If not empty → a checklist modal with click-through links.

18. **Market intelligence card** — dashboard tile: current market, our avg cost, Δ, unrealized P/L, reference rate, last updated, auto-refresh every 5 min (reusing the existing `market_rate_deltas` + `inventory_exposure` views).

19. **Favorites (pinning)** — new tiny table `favorites(user_id, entity_type, entity_id)`. Star icon on customers, accounts, deals. "Pinned" section at the top of each list.

20. **Mobile speed pass** — audit every primary flow to ≤3 taps: bottom sticky save on all forms, 44px min tap target, skeleton loaders on lists, prefetch on `<Link>` hover/touchstart. No new lib.

---

## Technical section (for you and me only)

- **New tables**: `favorites` (user_id uuid, entity_type text, entity_id uuid, created_at, PK compound). Standard grants + RLS `user_id = auth.uid()`.
- **New columns**: `doc_no text unique` on 4 transaction tables; nullable → backfilled by trigger.
- **New views**: `today_summary`, `customer_quick_stats`, `account_quick_stats`. All `security_invoker=on`, `SELECT` grants to `authenticated`.
- **New RPC**: `daily_reconciliation_check()` returning `jsonb` — read-only, `SECURITY INVOKER`.
- **New client components**: `Copyable`, `EmptyState`, `DealTimeline`, `CustomerQuickProfile`, `InventoryLotsDrawer`, `AccountQuickStats`, `TodaySummary`, `RecentActivity`, `QuickActionsBar`, `DuplicateWarningBanner`, `DailyClosingButton`, `FavoritesStar`.
- **No changes** to: profit triggers, FIFO logic, ledger triggers, settlement enum, cycle recomputation, RLS policies on financial tables.
- **Migrations**: one per phase; each includes grants + RLS + trigger creation in the required order.

---

## Delivery order

Phase 1 → 2 → 3 → 4. After each phase I stop, you test, then say "next" or "adjust X".

Reply **"go"** to start Phase 1, or tell me which items to reorder / cut.