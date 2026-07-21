# Recommended architecture: Option C — Independent documents + allocation layer

## TL;DR

Neither A nor B is right long-term.

- **Option A** (Buy first, link Remittance) forces supplier-first thinking. Real operators start with the customer.
- **Option B** (Remittance auto-creates a hidden Buy) is what the app does today. It looks convenient but couples two independent economic events into one record. It cannot express N:1 or 1:N supplier/customer relationships, breaks when a buy already existed, and pollutes reports with "ghost" buys.

**Option C** is the clean model:

1. **Remittance** and **Buy** are both first-class, independent documents.
2. A small **Allocation** table joins them (which lots fulfill which remittance).
3. A **Third-Party Clearing** ledger account absorbs the customer-pays-supplier-directly leg with zero fake cash.

The operator creates whichever comes first. Nothing is auto-generated behind their back.

---

## Why the current setup fails

The remittance form silently inserts a `buy_transactions` row with nulled columns (paid_from, received_into). Each null we permit is a symptom of the wrong shape:

- A supplier buy that never touched an account of ours — but it lives in the Buys table as if it did.
- Editing the supplier rate on the remittance and on the buy can diverge.
- One supplier delivery cannot cover two customer remittances.
- One customer remittance cannot be sourced from two suppliers.
- If the remittance is voided, the hidden buy either orphans or cascade-deletes real inventory.
- Reports list a "buy" that is not really a standalone buy.

Every one of those is a modeling problem, not a validation problem.

---

## The mental model

Two independent economic events, joined by intent:

```text
CUSTOMER SIDE                        SUPPLIER SIDE
-------------                        -------------
Remittance                           Buy (SupplierDeal)
  who: Customer A                      who: Supplier B
  we owe:  IRR -> beneficiary          we owe:  AED cost, later
  they owe: payment to us              they owe: AED delivery to us
  profit:  commission + spread share   inventory: lot created on delivery
                    \                 /
                     \               /
                    Allocation (join)
                     - remittance_id
                     - lot_id (FIFO or manual)
                     - qty, cost_rate, sale_rate
                     - realized_profit (frozen at close)
```

Allocations are the **only** place spread profit is realized. That single rule replaces most of the current profit logic.

---

## Workflow (operator's view)

The operator is never forced to create records in a specific order.

**Path 1 — Customer walks in first (most common):**

1. Create Remittance. Status: *Awaiting supply*.
2. Record how the customer settled: cash to us, wallet, or "paid Supplier B directly" (third-party).
3. When Supplier B delivers AED, either create a new Buy or pick an existing open Buy, then hit "Allocate to remittance". The allocation consumes the lot and closes the remittance.

**Path 2 — We pre-bought AED yesterday:**

1. The Buy already exists with a live inventory lot.
2. Customer walks in. Create Remittance.
3. On the remittance, click "Allocate from inventory" — FIFO picks the lot, or operator overrides.
4. Close.

**Path 3 — Pure broker trade (no remittance):**

1. Create Buy. Create Sell. Done. Same tables, no allocation needed beyond the normal FIFO sell consumption.

One workflow, three modes, zero duplicate entry.

---

## Third-party settlement without fake cash

When Customer A pays Supplier B directly, no money moves through us. The correct entry is a two-sided offset against a clearing account:

```text
Dr  Customer A receivable       (they still "owe" us conceptually)
Cr  Supplier B payable          (we still "owe" Supplier B conceptually)
Dr  Third-party clearing        offset both sides on the settlement date
Cr  Third-party clearing
```

Net effect: zero cash movement, both counterparty balances flattened, and the clearing account nets to zero once matched. No account of ours needs a nullable "paid_from". No ghost inflow appears in cash reports.

The remittance stores *how* the customer settled (a payment_method enum: `cash_in`, `wallet`, `third_party_direct`). If third-party, it references the linked Buy and the settlement amount — but the Buy is not created from it, it is *linked* to it.

---

## Realized profit, defined once

At allocation time, per allocated quantity:

```text
spread_profit = qty * (customer_sell_rate - lot_cost_rate)
commission    = remittance.commission_amount (allocated pro-rata if multi-lot)
realized      = spread_profit + commission
```

Realized profit is written to the allocation row and frozen when the remittance closes. Dashboards sum allocations. No recomputation from remittances or buys — those are input documents, allocations are the truth.

FIFO stays intact because allocations consume `inventory_lots` by id + qty, the same primitive a normal Sell uses today.

---

## Requirements check

- No duplicate data entry — each fact lives in one place; allocation is a pointer.
- No duplicate ledger movements — cash entries only when cash actually moves; third-party legs go through clearing, not cash.
- No fake cash movements — clearing account offsets, nothing debits a real box.
- FIFO correct — allocations consume lots identically to sells.
- Realized profit correct — one formula, one place.
- Normal inventory buys — Buy alone, allocated later by Sell or Remittance.
- Direct broker trades — Buy + Sell, no remittance.
- Remittance with third-party settlement — Remittance + linked Buy + clearing entry.
- Buy today, sell days later — allocation is time-independent by design.
- Simple for operators — one "New Remittance", one "New Buy", one "Allocate" button; no hidden records.

---

## Technical details (for later, not this turn)

- Tables: keep `remittances`, `buy_transactions`, `inventory_lots` as-is. Add `remittance_allocations (remittance_id, lot_id, qty, cost_rate, sale_rate, realized_profit_aed, allocated_at)`.
- Add ledger account of type `third_party_clearing` (system-owned, one per currency pair or one global AED-denominated).
- Remove the auto-insert of a hidden `buy_transactions` row from `remittances.new.tsx`. Replace with an explicit "Link supplier deal" step that either creates a Buy or picks an open one.
- Roll back the two `DROP NOT NULL` migrations on `buy_transactions.paid_from_account_id` and `received_into_account_id` once the coupling is gone — a real Buy always has real accounts.
- Existing hidden buys: migrate to the new shape by promoting them to real Buys and inserting a matching allocation row.
- Profit reports read from `remittance_allocations` and existing `lot_consumptions` (for sells). Two sources, both allocation-shaped.

---

## Recommendation

Adopt Option C. It is the only shape that models what actually happens: two counterparties, two obligations, one intent, one profit event at fulfillment. Options A and B both try to compress that into a single record and pay for it forever in null columns, ghost rows, and edge cases.

If you approve, next step is a migration plan and a UI plan — not code yet.
