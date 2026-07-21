
-- ---------- 1. inventory_lots: cost-basis status ---------------------
ALTER TABLE public.inventory_lots
  ADD COLUMN IF NOT EXISTS cost_basis_status TEXT NOT NULL DEFAULT 'known'
    CHECK (cost_basis_status IN ('known','unknown','capital'));

UPDATE public.inventory_lots
   SET cost_basis_status = 'unknown'
 WHERE cost_basis_status = 'known'
   AND (
     cost_basis_rate IS NULL
     OR cost_basis_rate = 0
     OR (cost_basis_rate = 1 AND cost_basis_currency = currency AND source_ref_type = 'brought_in')
   );

-- ---------- 2. sell_transactions: profit snapshot columns ------------
ALTER TABLE public.sell_transactions
  ADD COLUMN IF NOT EXISTS cost_basis_snapshot        JSONB,
  ADD COLUMN IF NOT EXISTS allocated_cost_amount      NUMERIC,
  ADD COLUMN IF NOT EXISTS allocated_cost_currency    TEXT,
  ADD COLUMN IF NOT EXISTS sale_value_amount          NUMERIC,
  ADD COLUMN IF NOT EXISTS sale_value_currency        TEXT,
  ADD COLUMN IF NOT EXISTS linked_expenses_amount     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_profit_irr             NUMERIC,
  ADD COLUMN IF NOT EXISTS net_profit_aed             NUMERIC,
  ADD COLUMN IF NOT EXISTS margin_pct                 NUMERIC,
  ADD COLUMN IF NOT EXISTS market_reference_rate      NUMERIC,
  ADD COLUMN IF NOT EXISTS market_reference_source    TEXT,
  ADD COLUMN IF NOT EXISTS market_reference_time      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profit_frozen_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profit_frozen_by           UUID,
  ADD COLUMN IF NOT EXISTS allocation_mode            TEXT DEFAULT 'fifo'
    CHECK (allocation_mode IN ('fifo','weighted_average','manual')),
  ADD COLUMN IF NOT EXISTS manual_allocation          JSONB;

-- ---------- 3. RPC: preview_sell_allocation --------------------------
CREATE OR REPLACE FUNCTION public.preview_sell_allocation(
  _currency         TEXT,
  _amount           NUMERIC,
  _source_account_id UUID DEFAULT NULL,
  _mode             TEXT DEFAULT 'fifo',
  _manual           JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  lot         RECORD;
  need        NUMERIC := COALESCE(_amount, 0);
  take        NUMERIC;
  rows        JSONB := '[]'::jsonb;
  covered     NUMERIC := 0;
  total_cost  NUMERIC := 0;
  known_cost  NUMERIC := 0;
  known_take  NUMERIC := 0;
  cost_ccy    TEXT;
  has_unknown BOOLEAN := false;
  unknown_amt NUMERIC := 0;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object(
      'lots','[]'::jsonb,'covered',0,'shortfall',0,
      'total_cost',0,'known_cost',0,'blended_cost_rate',0,
      'known_blended_cost_rate',0,
      'cost_basis_currency',NULL,'has_unknown_cost',false,'unknown_amount',0,'mode',_mode
    );
  END IF;

  IF _mode = 'manual' AND _manual IS NOT NULL THEN
    FOR lot IN
      SELECT l.*, (m.value->>'take')::numeric AS take_amt
        FROM jsonb_array_elements(_manual) m
        JOIN public.inventory_lots l ON l.id = (m.value->>'lot_id')::uuid
       WHERE l.currency = _currency
         AND l.remaining_amount > 0
         AND l.status <> 'depleted'
    LOOP
      take := LEAST(GREATEST(lot.take_amt, 0), lot.remaining_amount);
      IF take <= 0 THEN CONTINUE; END IF;
      covered := covered + take;

      IF lot.cost_basis_status = 'known' AND lot.cost_basis_rate IS NOT NULL AND lot.cost_basis_rate > 0 THEN
        IF cost_ccy IS NULL THEN cost_ccy := lot.cost_basis_currency; END IF;
        total_cost := total_cost + take * lot.cost_basis_rate;
        known_cost := known_cost + take * lot.cost_basis_rate;
        known_take := known_take + take;
      ELSE
        has_unknown := true;
        unknown_amt := unknown_amt + take;
      END IF;

      rows := rows || jsonb_build_array(jsonb_build_object(
        'lot_id', lot.id,
        'lot_code', lot.lot_code,
        'take', take,
        'cost_rate', lot.cost_basis_rate,
        'cost_currency', lot.cost_basis_currency,
        'cost_amount', CASE WHEN lot.cost_basis_status='known' AND lot.cost_basis_rate>0 THEN take * lot.cost_basis_rate ELSE NULL END,
        'account_id', lot.account_id,
        'entry_date', lot.entry_date,
        'cost_basis_status', lot.cost_basis_status
      ));
    END LOOP;
  ELSE
    FOR lot IN
      SELECT * FROM public.inventory_lots
       WHERE currency = _currency
         AND (_source_account_id IS NULL OR account_id = _source_account_id)
         AND remaining_amount > 0
         AND status <> 'depleted'
       ORDER BY entry_date ASC, created_at ASC
    LOOP
      EXIT WHEN need <= 0;
      take := LEAST(need, lot.remaining_amount);
      covered := covered + take;

      IF lot.cost_basis_status = 'known' AND lot.cost_basis_rate IS NOT NULL AND lot.cost_basis_rate > 0 THEN
        IF cost_ccy IS NULL THEN cost_ccy := lot.cost_basis_currency; END IF;
        total_cost := total_cost + take * lot.cost_basis_rate;
        known_cost := known_cost + take * lot.cost_basis_rate;
        known_take := known_take + take;
      ELSE
        has_unknown := true;
        unknown_amt := unknown_amt + take;
      END IF;

      rows := rows || jsonb_build_array(jsonb_build_object(
        'lot_id', lot.id,
        'lot_code', lot.lot_code,
        'take', take,
        'cost_rate', lot.cost_basis_rate,
        'cost_currency', lot.cost_basis_currency,
        'cost_amount', CASE WHEN lot.cost_basis_status='known' AND lot.cost_basis_rate>0 THEN take * lot.cost_basis_rate ELSE NULL END,
        'account_id', lot.account_id,
        'entry_date', lot.entry_date,
        'cost_basis_status', lot.cost_basis_status
      ));
      need := need - take;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'lots', rows,
    'covered', covered,
    'shortfall', GREATEST(0, _amount - covered),
    'total_cost', total_cost,
    'known_cost', known_cost,
    'blended_cost_rate', CASE WHEN known_take > 0 THEN total_cost / known_take ELSE 0 END,
    'known_blended_cost_rate', CASE WHEN known_take > 0 THEN known_cost / known_take ELSE 0 END,
    'cost_basis_currency', cost_ccy,
    'has_unknown_cost', has_unknown,
    'unknown_amount', unknown_amt,
    'mode', _mode
  );
END $$;

REVOKE ALL ON FUNCTION public.preview_sell_allocation(TEXT,NUMERIC,UUID,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_sell_allocation(TEXT,NUMERIC,UUID,TEXT,JSONB) TO authenticated;

-- ---------- 4. RPC: freeze_sell_profit -------------------------------
CREATE OR REPLACE FUNCTION public.freeze_sell_profit(
  _sell_id    UUID,
  _recompute  BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s              public.sell_transactions%ROWTYPE;
  cost_amt       NUMERIC := 0;
  cost_ccy       TEXT;
  sale_val       NUMERIC;
  exp_amt        NUMERIC := 0;
  profit_irr     NUMERIC;
  profit_aed     NUMERIC;
  aed_rate       NUMERIC;
  aed_source     TEXT;
  aed_time       TIMESTAMPTZ;
  snapshot       JSONB;
BEGIN
  SELECT * INTO s FROM public.sell_transactions WHERE id = _sell_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF s.profit_frozen_at IS NOT NULL AND NOT _recompute THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(cost_amount),0),
         MAX(cost_basis_currency),
         COALESCE(jsonb_agg(jsonb_build_object(
           'lot_id',    lot_id,
           'take',      amount,
           'cost_rate', cost_rate,
           'cost_currency', cost_basis_currency,
           'cost_amount', cost_amount
         ) ORDER BY entry_date, created_at), '[]'::jsonb)
    INTO cost_amt, cost_ccy, snapshot
    FROM public.lot_consumptions
   WHERE sell_ref_type = 'sell' AND sell_ref_id = _sell_id;

  sale_val := COALESCE(s.sold_amount,0) * COALESCE(s.sell_rate,0);

  IF cost_ccy IS NOT NULL AND cost_ccy = s.received_currency THEN
    profit_irr := sale_val - cost_amt - COALESCE(exp_amt,0);
  ELSE
    profit_irr := NULL;
  END IF;

  IF profit_irr IS NOT NULL AND cost_ccy = 'IRR' THEN
    SELECT mid_rate, source, fetched_at INTO aed_rate, aed_source, aed_time
      FROM public.market_rates
     WHERE currency = 'AED' AND source = 'bonbast' AND status = 'ok'
       AND mid_rate IS NOT NULL AND mid_rate > 0
     ORDER BY fetched_at DESC LIMIT 1;
    IF aed_rate IS NOT NULL AND aed_rate > 0 THEN
      profit_aed := profit_irr / aed_rate;
    END IF;
  ELSIF profit_irr IS NOT NULL AND cost_ccy = 'AED' THEN
    profit_aed := profit_irr;
  END IF;

  UPDATE public.sell_transactions
     SET cost_basis_snapshot     = snapshot,
         allocated_cost_amount   = cost_amt,
         allocated_cost_currency = cost_ccy,
         sale_value_amount       = sale_val,
         sale_value_currency     = s.received_currency,
         linked_expenses_amount  = 0,
         net_profit_irr          = CASE WHEN cost_ccy='IRR' THEN profit_irr ELSE NULL END,
         net_profit_aed          = profit_aed,
         margin_pct              = CASE WHEN cost_amt > 0 AND profit_irr IS NOT NULL
                                        THEN ROUND((profit_irr / cost_amt) * 100, 4) END,
         market_reference_rate   = aed_rate,
         market_reference_source = aed_source,
         market_reference_time   = aed_time,
         profit_frozen_at        = now(),
         profit_frozen_by        = auth.uid()
   WHERE id = _sell_id;

  INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, reason, new_value)
  VALUES (auth.uid(), 'sell_transactions', _sell_id,
          CASE WHEN _recompute THEN 'profit_recomputed' ELSE 'profit_frozen' END,
          NULL,
          jsonb_build_object('net_profit_irr', profit_irr, 'net_profit_aed', profit_aed, 'cost', cost_amt));
END $$;

REVOKE ALL ON FUNCTION public.freeze_sell_profit(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.freeze_sell_profit(UUID, BOOLEAN) TO authenticated;

-- ---------- 5. close_sell_deal calls freeze_sell_profit --------------
CREATE OR REPLACE FUNCTION public.close_sell_deal(_id uuid, _override boolean DEFAULT false, _difference_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.sell_transactions%ROWTYPE;
  paid numeric := 0;
  has_payment_receipt boolean := false;
  has_delivery_proof boolean := false;
BEGIN
  IF NOT public.can_write(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT * INTO s FROM public.sell_transactions WHERE id=_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sell not found'; END IF;
  IF s.deal_status = 'closed' THEN RETURN; END IF;
  IF s.deal_status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled sell cannot be closed'; END IF;

  IF s.received_into_account_id IS NULL THEN
    RAISE EXCEPTION 'Pick a receiving account before closing the deal';
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.sell_payments
    WHERE sell_id=_id AND deleted_at IS NULL AND currency=s.received_currency;

  IF paid + 0.0001 < s.received_amount AND NOT _override THEN
    RAISE EXCEPTION 'Cannot close: only % of % received. Record remaining payment or admin-override.', paid, s.received_amount;
  END IF;

  IF NOT _override THEN
    SELECT EXISTS(SELECT 1 FROM public.documents
       WHERE ref_type='sell' AND ref_id=_id
         AND doc_type IN ('payment_receipt','bank_transfer_screenshot','cash_delivery_receipt','whatsapp_confirmation'))
      OR EXISTS(SELECT 1 FROM public.sell_payments WHERE sell_id=_id AND deleted_at IS NULL AND receipt_url IS NOT NULL)
      INTO has_payment_receipt;
    IF NOT has_payment_receipt THEN
      RAISE EXCEPTION 'Cannot close: upload a payment receipt or admin-override';
    END IF;

    IF NOT s.currency_delivered THEN
      RAISE EXCEPTION 'Cannot close: currency delivery is not recorded';
    END IF;

    SELECT EXISTS(SELECT 1 FROM public.documents
       WHERE ref_type='sell' AND ref_id=_id
         AND doc_type IN ('currency_handover_proof','cash_delivery_receipt','bank_transfer_screenshot'))
      INTO has_delivery_proof;
    IF NOT has_delivery_proof THEN
      RAISE EXCEPTION 'Cannot close: upload a delivery proof or admin-override';
    END IF;
  END IF;

  UPDATE public.sell_transactions
     SET deal_status='closed',
         amount_received = GREATEST(paid, amount_received),
         payment_difference_reason = COALESCE(_difference_reason, payment_difference_reason),
         settlement_status='completed',
         closed_at = now(),
         closed_by = auth.uid(),
         updated_at = now()
   WHERE id=_id;

  PERFORM public.freeze_sell_profit(_id, false);
END $function$;

-- ---------- 6. RPC: assign_lot_cost_basis (admin only) ---------------
CREATE OR REPLACE FUNCTION public.assign_lot_cost_basis(
  _lot_id       UUID,
  _cost_rate    NUMERIC,
  _cost_currency TEXT,
  _reason       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required to assign cost basis';
  END IF;
  IF _cost_rate IS NULL OR _cost_rate <= 0 THEN
    RAISE EXCEPTION 'Cost rate must be positive';
  END IF;
  IF _cost_currency IS NULL OR btrim(_cost_currency) = '' THEN
    RAISE EXCEPTION 'Cost currency is required';
  END IF;

  UPDATE public.inventory_lots
     SET cost_basis_rate     = _cost_rate,
         cost_basis_currency = _cost_currency,
         cost_basis_status   = 'known',
         updated_at          = now()
   WHERE id = _lot_id;

  INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, reason, new_value)
  VALUES (auth.uid(), 'inventory_lots', _lot_id, 'cost_basis_assigned', _reason,
          jsonb_build_object('cost_rate', _cost_rate, 'cost_currency', _cost_currency));
END $$;

REVOKE ALL ON FUNCTION public.assign_lot_cost_basis(UUID,NUMERIC,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_lot_cost_basis(UUID,NUMERIC,TEXT,TEXT) TO authenticated;

-- ---------- 7. RPC: mark_lot_capital (admin only) --------------------
CREATE OR REPLACE FUNCTION public.mark_lot_capital(
  _lot_id UUID,
  _reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;
  UPDATE public.inventory_lots
     SET cost_basis_status = 'capital', updated_at = now()
   WHERE id = _lot_id;
  INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, reason)
  VALUES (auth.uid(), 'inventory_lots', _lot_id, 'marked_capital', _reason);
END $$;

REVOKE ALL ON FUNCTION public.mark_lot_capital(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_lot_capital(UUID,TEXT) TO authenticated;

-- ---------- 8. View: v_currency_inventory_summary --------------------
CREATE OR REPLACE VIEW public.v_currency_inventory_summary
WITH (security_invoker = on) AS
WITH aed_rate AS (
  SELECT mid_rate AS rate
    FROM public.market_rates
   WHERE currency='AED' AND source='bonbast' AND status='ok' AND mid_rate IS NOT NULL AND mid_rate > 0
   ORDER BY fetched_at DESC LIMIT 1
),
per_ccy AS (
  SELECT l.currency,
         SUM(l.remaining_amount) FILTER (WHERE l.remaining_amount > 0 AND l.status IN ('available','partial')) AS available_amount,
         SUM(l.remaining_amount) FILTER (WHERE l.cost_basis_status='known' AND l.remaining_amount > 0 AND l.status IN ('available','partial')) AS known_amount,
         SUM(l.remaining_amount) FILTER (WHERE l.cost_basis_status='unknown' AND l.remaining_amount > 0 AND l.status IN ('available','partial')) AS unknown_amount,
         SUM(l.remaining_amount) FILTER (WHERE l.cost_basis_status='capital' AND l.remaining_amount > 0 AND l.status IN ('available','partial')) AS capital_amount,
         SUM(l.remaining_amount * l.cost_basis_rate) FILTER (WHERE l.cost_basis_status='known' AND l.remaining_amount > 0 AND l.status IN ('available','partial') AND l.cost_basis_rate IS NOT NULL AND l.cost_basis_rate > 0) AS known_cost_total,
         MAX(l.cost_basis_currency) FILTER (WHERE l.cost_basis_status='known') AS cost_basis_currency,
         COUNT(*) FILTER (WHERE l.remaining_amount > 0 AND l.status IN ('available','partial')) AS lot_count
    FROM public.inventory_lots l
   GROUP BY l.currency
),
market AS (
  SELECT currency, buy_rate, sell_rate, mid_rate
    FROM (
      SELECT currency, buy_rate, sell_rate, mid_rate, fetched_at,
             ROW_NUMBER() OVER (PARTITION BY currency ORDER BY fetched_at DESC) rn
        FROM public.market_rates
       WHERE source='bonbast' AND status='ok'
    ) t WHERE rn=1
)
SELECT p.currency,
       COALESCE(p.available_amount,0) AS available_amount,
       COALESCE(p.known_amount,0)     AS known_cost_amount,
       COALESCE(p.unknown_amount,0)   AS unknown_cost_amount,
       COALESCE(p.capital_amount,0)   AS capital_amount,
       CASE WHEN COALESCE(p.known_amount,0) > 0
            THEN p.known_cost_total / p.known_amount
            ELSE NULL END AS weighted_avg_cost_rate,
       p.cost_basis_currency,
       COALESCE(p.lot_count,0) AS lot_count,
       m.buy_rate  AS market_buy,
       m.sell_rate AS market_sell,
       m.mid_rate  AS market_mid,
       CASE WHEN m.sell_rate IS NOT NULL AND m.sell_rate > 0
            THEN COALESCE(p.available_amount,0) * m.sell_rate END AS estimated_value_irr,
       CASE WHEN COALESCE(p.known_amount,0) > 0 AND m.sell_rate IS NOT NULL
            THEN p.known_amount * (m.sell_rate - (p.known_cost_total / p.known_amount)) END AS unrealized_profit_irr,
       CASE WHEN COALESCE(p.known_amount,0) > 0 AND m.sell_rate IS NOT NULL AND (SELECT rate FROM aed_rate) > 0
            THEN (p.known_amount * (m.sell_rate - (p.known_cost_total / p.known_amount))) / (SELECT rate FROM aed_rate) END AS unrealized_profit_aed
  FROM per_ccy p
  LEFT JOIN market m ON m.currency = p.currency;

GRANT SELECT ON public.v_currency_inventory_summary TO authenticated;

-- ---------- 9. View: v_lot_detailed ----------------------------------
CREATE OR REPLACE VIEW public.v_lot_detailed
WITH (security_invoker = on) AS
WITH RECURSIVE walk AS (
  SELECT id, name, parent_id, name::text AS acc_path
    FROM public.accounts WHERE parent_id IS NULL
  UNION ALL
  SELECT a.id, a.name, a.parent_id, (w.acc_path || ' → ' || a.name)::text
    FROM public.accounts a
    JOIN walk w ON a.parent_id = w.id
),
market AS (
  SELECT currency, sell_rate, buy_rate, mid_rate
    FROM (
      SELECT currency, sell_rate, buy_rate, mid_rate, fetched_at,
             ROW_NUMBER() OVER (PARTITION BY currency ORDER BY fetched_at DESC) rn
        FROM public.market_rates
       WHERE source='bonbast' AND status='ok'
    ) t WHERE rn=1
),
consumed AS (
  SELECT lot_id, SUM(amount) AS sold_amount
    FROM public.lot_consumptions GROUP BY lot_id
)
SELECT l.id,
       l.lot_code,
       l.currency,
       l.original_amount,
       l.remaining_amount,
       COALESCE(c.sold_amount, 0) AS sold_amount,
       l.cost_basis_rate,
       l.cost_basis_currency,
       l.cost_basis_status,
       l.source_ref_type,
       l.source_ref_id,
       l.source_description,
       l.account_id,
       a.name AS account_name,
       w.acc_path AS account_path,
       l.entry_date,
       EXTRACT(DAY FROM (now() - l.entry_date::timestamp))::int AS age_days,
       l.status::text AS status,
       m.sell_rate AS market_sell_rate,
       m.buy_rate  AS market_buy_rate,
       CASE WHEN l.cost_basis_status='known' AND l.cost_basis_rate > 0 AND m.sell_rate IS NOT NULL
            THEN l.remaining_amount * (m.sell_rate - l.cost_basis_rate) END AS unrealized_pl,
       CASE WHEN l.cost_basis_status='known' AND l.cost_basis_rate > 0 AND m.sell_rate IS NOT NULL
            THEN ((m.sell_rate - l.cost_basis_rate) / l.cost_basis_rate) * 100 END AS unrealized_pl_pct
  FROM public.inventory_lots l
  LEFT JOIN public.accounts a ON a.id = l.account_id
  LEFT JOIN walk w            ON w.id = l.account_id
  LEFT JOIN consumed c        ON c.lot_id = l.id
  LEFT JOIN market m          ON m.currency = l.currency;

GRANT SELECT ON public.v_lot_detailed TO authenticated;

-- ---------- 10. Best-effort backfill of closed sells -----------------
DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN
    SELECT id FROM public.sell_transactions
     WHERE deal_status = 'closed' AND profit_frozen_at IS NULL
  LOOP
    PERFORM public.freeze_sell_profit(s.id, false);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.preview_sell_allocation(TEXT,NUMERIC,UUID,TEXT,JSONB) FROM anon;
