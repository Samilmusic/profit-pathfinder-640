
-- 1) Enforce inventory availability at the DB level (defense in depth)
CREATE OR REPLACE FUNCTION public.enforce_sell_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avail NUMERIC;
BEGIN
  IF NEW.sell_rate IS NULL OR NEW.sell_rate <= 0 THEN
    RAISE EXCEPTION 'Sell rate is required';
  END IF;
  IF NEW.sold_amount IS NULL OR NEW.sold_amount <= 0 THEN
    RAISE EXCEPTION 'Sold amount is required';
  END IF;

  SELECT COALESCE(SUM(remaining_amount),0) INTO avail
    FROM public.inventory_lots
   WHERE currency = NEW.sold_currency
     AND (NEW.sold_from_account_id IS NULL OR account_id = NEW.sold_from_account_id)
     AND status <> 'depleted';

  -- On UPDATE the old consumption was restored inside consume_lots_fifo before
  -- this AFTER trigger runs, so `avail` already reflects post-restore state.
  IF avail + 0.00001 < NEW.sold_amount THEN
    RAISE EXCEPTION 'Not enough % inventory in selected account. Available: %',
      NEW.sold_currency, avail;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sell_enforce_inventory ON public.sell_transactions;
CREATE TRIGGER sell_enforce_inventory
  BEFORE INSERT OR UPDATE ON public.sell_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sell_inventory();

-- 2) Profit by account / location
CREATE OR REPLACE VIEW public.profit_by_account AS
SELECT
  a.id            AS account_id,
  a.name          AS account_name,
  a.currency      AS account_currency,
  s.sold_currency,
  s.received_currency,
  COUNT(DISTINCT s.id) AS sell_count,
  SUM(s.sold_amount)   AS sold_amount,
  SUM(s.received_amount) AS received_amount,
  SUM(s.cost_basis_amount) AS total_cost,
  SUM(s.gross_profit)  AS gross_profit,
  SUM(s.milad_profit)  AS milad_profit,
  SUM(s.ali_profit)    AS ali_profit
FROM public.sell_transactions s
LEFT JOIN public.accounts a ON a.id = s.sold_from_account_id
WHERE s.deleted_at IS NULL
GROUP BY a.id, a.name, a.currency, s.sold_currency, s.received_currency;

GRANT SELECT ON public.profit_by_account TO authenticated;

-- 3) Profit by source brought-in / source person
CREATE OR REPLACE VIEW public.profit_by_source AS
SELECT
  l.source_ref_type,
  l.source_ref_id,
  COALESCE(bi.brought_by::text, 'buy/other')  AS source_person,
  bi.source_name,
  l.currency,
  l.cost_basis_currency,
  SUM(lc.amount)                              AS sold_amount,
  SUM(lc.cost_amount)                         AS total_cost,
  SUM(lc.amount * s.sell_rate)                AS total_received,
  SUM(lc.amount * s.sell_rate - lc.cost_amount) AS gross_profit
FROM public.lot_consumptions lc
JOIN public.inventory_lots l ON l.id = lc.lot_id
JOIN public.sell_transactions s ON s.id = lc.sell_ref_id AND lc.sell_ref_type = 'sell'
LEFT JOIN public.brought_in_money bi
       ON l.source_ref_type = 'brought_in' AND bi.id = l.source_ref_id
WHERE s.deleted_at IS NULL
  AND s.received_currency = l.cost_basis_currency
GROUP BY l.source_ref_type, l.source_ref_id, bi.brought_by, bi.source_name,
         l.currency, l.cost_basis_currency;

GRANT SELECT ON public.profit_by_source TO authenticated;

-- 4) Sales allocations detail view
CREATE OR REPLACE VIEW public.sale_allocations_view AS
SELECT
  lc.id,
  lc.entry_date,
  s.id                       AS sell_id,
  s.received_currency,
  s.sell_rate,
  l.lot_code,
  l.currency,
  l.account_id,
  a.name                     AS account_name,
  lc.amount                  AS amount_consumed,
  lc.cost_rate,
  lc.cost_amount,
  lc.cost_basis_currency,
  (lc.amount * s.sell_rate)  AS received_amount,
  CASE WHEN s.received_currency = lc.cost_basis_currency
       THEN (lc.amount * s.sell_rate) - lc.cost_amount
       ELSE NULL END         AS gross_profit,
  l.source_ref_type,
  l.source_ref_id,
  l.source_description
FROM public.lot_consumptions lc
JOIN public.inventory_lots l ON l.id = lc.lot_id
JOIN public.sell_transactions s ON s.id = lc.sell_ref_id AND lc.sell_ref_type = 'sell'
LEFT JOIN public.accounts a ON a.id = l.account_id
WHERE s.deleted_at IS NULL;

GRANT SELECT ON public.sale_allocations_view TO authenticated;

-- 5) Remaining inventory grouped by cost rate
CREATE OR REPLACE VIEW public.remaining_by_cost_rate AS
SELECT
  l.currency,
  l.cost_basis_currency,
  l.cost_basis_rate,
  l.account_id,
  a.name AS account_name,
  COUNT(*)                       AS lot_count,
  SUM(l.remaining_amount)        AS remaining_amount,
  SUM(l.remaining_amount * l.cost_basis_rate) AS remaining_cost
FROM public.inventory_lots l
LEFT JOIN public.accounts a ON a.id = l.account_id
WHERE l.remaining_amount > 0
GROUP BY l.currency, l.cost_basis_currency, l.cost_basis_rate, l.account_id, a.name
ORDER BY l.currency, l.cost_basis_rate;

GRANT SELECT ON public.remaining_by_cost_rate TO authenticated;
