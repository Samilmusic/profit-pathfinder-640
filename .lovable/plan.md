
# AI Business Brain & Deal Score

Grounded, tool-based AI layer over the existing portal. The AI never writes SQL, never invents numbers, and only speaks from a fixed set of read-only "data tools" that hit the current tables (`accounts`, `inventory_lots`, `sell_transactions`, `buy_transactions`, `customers`, `customer_bank_accounts`, `brought_in_money`, `trade_cycles`, `expenses`, `transfers`, `market_rates_latest`, `sell_payments`, `documents`, `audit_events`). No accounting logic, triggers, or existing forms are rebuilt — Deal Score is a read-only overlay.

## Scope (7 deliverables)

1. **Server AI layer** — TanStack `createServerFn` handlers, protected by `requireSupabaseAuth` + `has_role('admin'|'milad'|'ali')`, using Lovable AI Gateway (`google/gemini-3-flash-preview`) with the AI SDK `tool()` + `stopWhen(stepCountIs(50))` pattern. AI never sees raw tables — only tool results.
2. **AI Business Brain page** at `/_authenticated/ai-brain` — chat-style Q&A, suggested-question chips, cards for Money location / Open deals / Customer risk / Inventory exposure / Market movement / Today summary.
3. **Floating "Ask Business" button** on Dashboard that opens the same brain in a slide-over.
4. **AI Deal Score card** — reusable `<DealScoreCard />` embedded in Sell, Buy, and Brought-In (conversion) forms. Computed **fully deterministically in the client from the same tool outputs** (no LLM in the scoring loop → instant, cheap, reliable). LLM is only used to produce the plain-English "why" line.
5. **Daily CEO Report** — "Generate Today Report" button on Dashboard, renders a structured brief filled from tool data, LLM only writes the narrative paragraphs.
6. **Risk warnings surface** — same rule engine as Deal Score, exposed as inline warnings in forms and as an "AI Risk" section on the brain page.
7. **Guardrails** — role check on every server fn, allow-list of tool names, hard input validation with Zod, no raw-SQL tool, strict "I don't have enough data for that" fallback, tool results capped in size, tokens capped per call.

## Data tools (the only way AI can read data)

Every tool = one server fn returning a compact JSON DTO from the existing DB. No new tables required.

| Tool | Backing query |
|---|---|
| `getCurrencyBalances({currency?})` | `SUM(remaining_amount)` from `inventory_lots` grouped by currency |
| `getAccountBalances({type?, currency?})` | `ledger_entries` sums joined to `accounts` |
| `getInventoryLots({currency?, maxCostRate?, holder?})` | `inventory_lots` with `remaining_amount>0` |
| `getOpenDeals({status?})` | `sell_transactions` where `deal_status NOT IN ('closed','cancelled')` |
| `getCustomerBalances({customer_id?})` | wallet + open-deal receivables per customer |
| `getPendingReceipts()` | deals in `waiting_receipt` / `waiting_payment` / `partially_paid` |
| `getPendingPayments()` | expenses/payment_orders not completed |
| `getMarketRates({currency?})` | `market_rates_latest` + staleness |
| `getProfitSummary({from?, to?})` | realized (closed same-ccy) vs pending (open cycles) |
| `getInvestorSummary()` | reuses existing Ali investor view |
| `getRateExposure()` | inventory value @ cost vs @ live mid |
| `getRecentActivity({since?})` | last N `audit_events` rows |
| `findCustomer({q})` | fuzzy `ilike` on customers, returns id + summary |
| `getCashWithPerson({person?})` | `accounts` where `account_type='person_holding'` |

Each returns ≤ ~50 rows and includes `record_id` + route link so the UI can render drill-downs.

## AI Deal Score (deterministic + narrated)

Client-side pure function scores 10 factors, each capped so the total is 0–100. Runs on every debounced form change. LLM is called **once** after scoring to produce the one-line explanation per factor from the numeric result — it cannot change the score.

```text
factor              max   check
rate_quality        20    (our_rate - market_mid) / market_mid  vs sell/buy side
inventory_avail     15    sum(remaining) >= sold_amount (source account)
cost_basis_ok       10    FIFO preview returns non-zero blended rate
expected_margin     15    (our_rate - avg_cost) / avg_cost, sign-aware for buy/sell
settlement_risk    -15    customer has open unpaid / overdue deals
receipt_risk        -5    required docs missing (soft — informational)
balance_impact     -10    resulting account balance < 20% of 30-day avg
market_movement    -10    |Δ 15m| > threshold from app_settings
completeness       -20    any required field missing → clamps score to <40
customer_history    10    on-time settlement ratio ≥ 0.8
```

Labels: 90+ Excellent, 75+ Good, 60+ Acceptable, 40+ Risky, <40 Dangerous. Never blocks save — hard blocks stay owned by existing DB triggers (`enforce_sell_inventory`, `enforce_txn_completion`, etc.). Uses the already-captured `reference_*` snapshot columns on transactions.

## Daily CEO Report

Server fn `generateDailyReport()` calls the tool set in a fixed sequence (not by LLM), assembles a typed brief, then asks the LLM to write short narrative sections (headline, biggest risk, best deal, worst issue, follow-ups) with the brief as the only source. Renders as a printable card on the brain page.

## Guardrails (zero-hallucination)

- Server fn `askBusinessBrain({ question, history })` — role-gated, uses AI SDK `streamText` with an allow-listed `tools` map (the getters above), `stopWhen: stepCountIs(50)`, system prompt: *"Only use tool results. If a tool returns empty, say 'I don't have enough data for that.' Never invent numbers. Cite record IDs."*
- No `dynamicTool`, no SQL tool, no filesystem tool.
- Tool inputs validated by Zod; outputs truncated.
- Every numeric shown in the answer must appear in a tool result — enforced by prompt + reviewed via the "Sources" list rendered under each answer.
- Rate-limit / 402 handling per gateway rules.

## Technical notes (for the record)

- Files created:
  - `src/lib/ai/tools.server.ts` — the 14 data tools (server-only helpers)
  - `src/lib/ai/gateway.server.ts` — Lovable AI Gateway provider (per knowledge file)
  - `src/lib/ai/brain.functions.ts` — `askBusinessBrain`, `generateDailyReport`
  - `src/lib/ai/deal-score.ts` — pure deterministic scorer (client-safe)
  - `src/lib/ai/deal-score.functions.ts` — server fn wrapping scorer + narration LLM call
  - `src/routes/_authenticated/ai-brain.tsx` — page
  - `src/components/ai/ask-business-button.tsx` — floating dashboard button + sheet
  - `src/components/ai/deal-score-card.tsx` — embeddable card
  - `src/components/ai/daily-report.tsx` — CEO report renderer
  - `src/components/ai/message-bubble.tsx`, `sources-list.tsx`
- Integrations: mount `<DealScoreCard/>` in existing Sell (`/_authenticated/sell.tsx` — quick-sell dialog), Buy, Brought-In conversion forms — no logic changes to their submit handlers. Add `<AskBusinessButton/>` to the dashboard route.
- Auth attacher: verify `src/start.ts` has bearer middleware (already present per project history); no changes if so.
- No schema migrations required — reuses existing tables and views.

## Out of scope

- No changes to any trigger, RPC, ledger, or profit logic.
- No new tables.
- No public/anon exposure — every AI endpoint is admin/staff only.
- No auto-actions — AI is read-only advisory; it can never create/edit/cancel records.

Ready to build once you approve.
