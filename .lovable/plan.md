# Third-Party Settlement for Remittances

Add an optional settlement path where the remittance customer pays a **third party** (usually a supplier we're buying currency from) instead of paying us. No money enters our accounts. A linked Buy deal creates inventory only when the supplier delivers.

The existing "Paid to our account / cash" remittance flow stays untouched — this is a new option on the same form.

## What we're changing

### 1. Database (one migration)

Add third-party settlement columns to `public.remittances`:
- `payment_destination` — `into_account | cash_to_us | to_third_party | settles_linked_buy | pending`
- `third_party_customer_id` — who received the customer's payment
- `linked_buy_id` — foreign key to `buy_transactions`
- `settlement_amount`, `settlement_currency`, `settlement_date`
- `settlement_proof_url` (documents table still used, this is a convenience mirror)
- `excess_allocation` — `our_account | another_supplier | customer_balance | pending | commission | none`
- `excess_allocation_target_id` (nullable)

Add to `public.buy_transactions`:
- `settlement_source` — `own_funds | remittance_payment | mixed`
- `settled_by_remittance_id` — FK back to `remittances`
- `supplier_settled_amount` — how much of the buy has been settled

Rewrite the remittance ledger trigger so:
- When `payment_destination in ('to_third_party','settles_linked_buy')`, **no** IRR ledger entry hits our accounts.
- A `third_party_settlement` ledger row is written (memo-only, `account_id = null`, using a new `ref_type = 'third_party_settlement'`).
- Commission is still tracked as profit.

Rewrite the buy inventory trigger so:
- When `settlement_source = 'remittance_payment'`, the outflow leg on our IRR account is skipped.
- Inventory lot is still created on the AED leg **only after delivery is recorded** (new `delivered_at` flag on buy_transactions — most flows already treat buy as immediate; we gate lot creation behind delivery when this settlement type is used).

Add a validation function `validate_third_party_settlement(_remittance_id)` returning a checklist (customer paid, proof uploaded, supplier delivered, remittance transferred, etc.).

Add `v_remittance_settlement_path` view returning the linked chain for Deal Center display.

### 2. Remittance form (`remittances.new.tsx`)

Add a **Settlement Method** section after the customer-payment amount:
- Radio: `Paid to our account | Cash to us | Paid to third party | Settles linked buy | Pending`
- When `third party` or `linked buy`: show
  - Third-party recipient picker (customer/supplier)
  - Settlement currency + amount (defaults from remittance)
  - Settlement date, proof upload
  - Linked Buy: existing (select from open buys where supplier matches) or **Create linked buy** inline (opens a mini form: supplier, AED amount, supplier rate → auto-fills settlement amount, marks `settlement_source='remittance_payment'`)
- If settlement amount ≠ linked buy amount, show an **Excess/Shortfall** allocator (options: our account, another supplier, customer balance, pending, commission). No auto-allocation.

Live **Settlement Path** panel: `Customer A → Customer B`, plus a summary showing "IRR into our account: 0", "AED expected from supplier: X", "Commission: Y".

### 3. Remittance detail (`remittances.$id.tsx`)

- New **Third-Party Settlement** card with the path, linked buy chip, delivery status, proof list, and a "Record supplier delivery" button that flips the buy's delivery flag and creates the AED lot.
- **Close checklist** driven by `validate_third_party_settlement` — each unchecked item explains why close is blocked.
- **Statuses** added to the badge: `Customer Paid Supplier`, `Waiting Supplier AED Delivery`, `Partially Settled`.

### 4. Buy form (`buy.tsx` / trades new)

Small addition: a **Settlement source** toggle (Own funds / From remittance payment). When "From remittance", user picks the open remittance; the buy is linked and its ledger IRR-out leg is skipped.

### 5. Deal Center + Action Center

- Deal Center: render remittance rows with their linked buy code as a chip; expanding shows the chain (REM → third party → BUY → delivery).
- Action Center alerts:
  - "Customer A paid X IRR directly to Customer B" (when settlement recorded, no proof yet)
  - "Payment proof missing on REM-..."
  - "Supplier still owes X AED on BUY-..."

### 6. Profit / Inventory correctness

- Remittance profit = commission only, unchanged.
- Linked buy creates an inventory lot with cost rate = `settlement_amount / bought_amount`, source description referencing both the buy code and the settling remittance code.
- IRR never appears in `v_currency_inventory_summary` from this path — verified by the trigger changes.

## Not changing

- Existing "paid into our account" and "cash to us" remittance flows.
- Normal buy transactions where we pay from our own funds.
- Sell / inventory / cost-preview logic shipped last turn.
- Milad Box / account balances (third-party settlements are memo entries with `account_id = null`).

## Technical layout

```text
supabase migration
  remittances.*  (new columns + status enum values)
  buy_transactions.*  (settlement_source, settled_by_remittance_id, delivered_at)
  ledger_ref_type += 'third_party_settlement'
  fn: validate_third_party_settlement(uuid) -> jsonb
  fn: record_supplier_delivery(uuid)  -- creates AED lot on demand
  view: v_remittance_settlement_path
  trigger rewrites: trg_remittance_ledger, trg_buy_ledger, trg_buy_lot

src/lib/
  remittance-settlement.ts  (rpc wrappers, path formatter)

src/components/
  settlement-method-picker.tsx
  linked-buy-picker.tsx  (search open buys / create-new mini form)
  excess-allocator.tsx
  settlement-path-summary.tsx
  third-party-settlement-card.tsx
  supplier-delivery-dialog.tsx

src/routes/_authenticated/
  remittances.new.tsx  (add Settlement Method section)
  remittances.$id.tsx  (add Third-Party card + expanded checklist)
  buy.tsx  (settlement-source toggle)
  deals.tsx  (render linked chain)
  dashboard.tsx  (extra Action Center rules)
```

Rollout order: migration first (approval), then RPC wrappers, then components, then wire the new form section, then detail-page card, then Deal Center / Action Center touches.
