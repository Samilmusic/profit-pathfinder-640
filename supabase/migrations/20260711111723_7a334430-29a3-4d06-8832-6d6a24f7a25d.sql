
-- 1. node_type enum
DO $$ BEGIN
  CREATE TYPE public.account_node_type AS ENUM ('box', 'location', 'currency_account');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. add columns
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS node_type public.account_node_type NOT NULL DEFAULT 'currency_account';

CREATE INDEX IF NOT EXISTS accounts_parent_id_idx ON public.accounts(parent_id);
CREATE INDEX IF NOT EXISTS accounts_node_type_idx ON public.accounts(node_type);

-- 3. allow currency null for non-leaf nodes (box/location)
ALTER TABLE public.accounts ALTER COLUMN currency DROP NOT NULL;

-- 4. guardrail: only currency_account rows may be referenced by ledger entries
--    (we don't add FK check; app enforces. But add CHECK: leaf must have currency)
DO $$ BEGIN
  ALTER TABLE public.accounts
    ADD CONSTRAINT accounts_leaf_has_currency
    CHECK (node_type <> 'currency_account' OR currency IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Rolled-up balances view for boxes/locations
CREATE OR REPLACE VIEW public.account_hierarchy_balances
WITH (security_invoker = on)
AS
WITH RECURSIVE
  leaf_balances AS (
    SELECT
      a.id AS account_id,
      a.currency,
      a.opening_balance + COALESCE(SUM(le.amount), 0) AS balance
    FROM public.accounts a
    LEFT JOIN public.ledger_entries le ON le.account_id = a.id
    WHERE a.node_type = 'currency_account' AND a.deleted_at IS NULL
    GROUP BY a.id, a.currency, a.opening_balance
  ),
  tree AS (
    -- start from every non-leaf node
    SELECT a.id AS root_id, a.id AS current_id
    FROM public.accounts a
    WHERE a.node_type IN ('box', 'location') AND a.deleted_at IS NULL
    UNION ALL
    SELECT t.root_id, c.id
    FROM tree t
    JOIN public.accounts c ON c.parent_id = t.current_id
    WHERE c.deleted_at IS NULL
  )
SELECT
  t.root_id AS account_id,
  lb.currency,
  SUM(lb.balance) AS balance
FROM tree t
JOIN leaf_balances lb ON lb.account_id = t.current_id
GROUP BY t.root_id, lb.currency;

GRANT SELECT ON public.account_hierarchy_balances TO authenticated;
