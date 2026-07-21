
CREATE OR REPLACE FUNCTION public.report_meta(_report_key text, _version text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'report_key', _report_key, 'report_version', '1.0.0',
    'generated_at', now(), 'data_cutoff', now(),
    'generated_by_version', COALESCE(_version, 'phase6.slice2')
  );
$$;

CREATE OR REPLACE VIEW public.v_profit_events_ext
WITH (security_invoker = on) AS
WITH sell_primary_lot AS (
  SELECT DISTINCT ON (lc.sell_ref_id) lc.sell_ref_id AS sell_id, lc.lot_id
  FROM public.lot_consumptions lc
  WHERE lc.sell_ref_type = 'sell'
  ORDER BY lc.sell_ref_id, lc.cost_amount DESC NULLS LAST
),
rem_primary_lot AS (
  SELECT DISTINCT ON (ra.remittance_id) ra.remittance_id AS rem_id, ra.lot_id
  FROM public.remittance_allocations ra
  WHERE ra.lot_id IS NOT NULL
  ORDER BY ra.remittance_id, ra.allocated_amount DESC NULLS LAST
)
SELECT
  'sell'::text AS source, s.id AS ref_id, s.doc_no,
  s.customer_id, s.created_by AS actor_id,
  NULL::uuid AS supplier_id,
  s.received_into_account_id AS destination_account_id,
  spl.lot_id AS primary_lot_id,
  s.sold_currency AS currency,
  COALESCE(s.net_profit_aed, s.gross_profit, 0) AS amount_aed,
  COALESCE(s.net_profit_aed, s.gross_profit, 0) AS gross_profit_aed,
  0::numeric AS commission_aed,
  COALESCE(s.gross_profit, 0) AS spread_aed,
  s.closed_at AS event_at, s.entry_date AS event_date,
  q.classification, q.severity
FROM public.sell_transactions s
LEFT JOIN sell_primary_lot spl ON spl.sell_id = s.id
LEFT JOIN public.v_sell_data_quality q ON q.id = s.id
WHERE s.deleted_at IS NULL AND s.closed_at IS NOT NULL
UNION ALL
SELECT
  'remittance'::text, r.id, r.doc_no,
  r.customer_id, r.created_by,
  r.fx_supplier_customer_id,
  r.source_account_id,
  rpl.lot_id,
  r.transfer_currency,
  COALESCE(r.total_profit_aed, 0),
  COALESCE(r.total_profit_aed, 0),
  COALESCE(r.net_commission_aed, 0),
  COALESCE(r.fx_trading_profit_aed, 0),
  COALESCE(
    (SELECT max(t.created_at) FROM public.remittance_workflow_transitions t
      WHERE t.remittance_id = r.id AND t.to_state = 'closed'::remittance_workflow_state),
    r.updated_at
  ),
  r.entry_date, q.classification, q.severity
FROM public.remittances r
LEFT JOIN rem_primary_lot rpl ON rpl.rem_id = r.id
LEFT JOIN public.v_remittance_data_quality q ON q.id = r.id
WHERE r.status = 'closed'::remittance_status;

COMMENT ON VIEW public.v_profit_events_ext IS
  'Phase 6 Slice 2 — read-only, security_invoker=on. Wide profit events for analytics: supplier, operator, destination account, primary buy lot, split spread/commission. Frozen source columns only.';
GRANT SELECT ON public.v_profit_events_ext TO authenticated;

CREATE INDEX IF NOT EXISTS idx_sell_createdby_closed
  ON public.sell_transactions (created_by, closed_at DESC)
  WHERE deleted_at IS NULL AND closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sell_dest_closed
  ON public.sell_transactions (received_into_account_id, closed_at DESC)
  WHERE deleted_at IS NULL AND closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rem_createdby_status
  ON public.remittances (created_by, entry_date DESC)
  WHERE status = 'closed'::remittance_status;
CREATE INDEX IF NOT EXISTS idx_rem_supplier_status
  ON public.remittances (fx_supplier_customer_id, entry_date DESC)
  WHERE status = 'closed'::remittance_status;
CREATE INDEX IF NOT EXISTS idx_rem_source_account_status
  ON public.remittances (source_account_id, entry_date DESC)
  WHERE status = 'closed'::remittance_status;

CREATE OR REPLACE FUNCTION public.report_executive_kpis(_quality_mode text DEFAULT 'all'::text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  yday date := today - 1;
  month_start date := date_trunc('month', today)::date;
  last_month_start date := (date_trunc('month', today) - interval '1 month')::date;
  last_month_end date := (date_trunc('month', today) - interval '1 day')::date;
  year_start date := date_trunc('year', today)::date;
  q_mode text := lower(COALESCE(_quality_mode, 'all'));
  profit_today numeric; profit_yday numeric; profit_mtd numeric;
  profit_last_month numeric; profit_ytd numeric;
  rows_total bigint; rows_included bigint;
  remittance_states jsonb; inventory jsonb;
BEGIN
  IF q_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN
    RAISE EXCEPTION 'invalid quality_mode %', _quality_mode; END IF;

  SELECT COUNT(*) INTO rows_total FROM public.v_profit_events;
  SELECT COUNT(*) INTO rows_included FROM public.v_profit_events
   WHERE (q_mode='all'
       OR (q_mode='exclude_invalid' AND classification<>'invalid')
       OR (q_mode='exclude_suspicious' AND classification='valid'));

  SELECT COALESCE(SUM(amount_aed),0) INTO profit_today FROM public.v_profit_events
   WHERE event_date=today AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'));
  SELECT COALESCE(SUM(amount_aed),0) INTO profit_yday FROM public.v_profit_events
   WHERE event_date=yday AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'));
  SELECT COALESCE(SUM(amount_aed),0) INTO profit_mtd FROM public.v_profit_events
   WHERE event_date>=month_start AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'));
  SELECT COALESCE(SUM(amount_aed),0) INTO profit_last_month FROM public.v_profit_events
   WHERE event_date BETWEEN last_month_start AND last_month_end AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'));
  SELECT COALESCE(SUM(amount_aed),0) INTO profit_ytd FROM public.v_profit_events
   WHERE event_date>=year_start AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'));

  SELECT COALESCE(jsonb_object_agg(state, n), '{}'::jsonb) INTO remittance_states
    FROM (SELECT state, SUM(n)::bigint AS n FROM public.v_remittance_state_counts GROUP BY state) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'currency', i.currency, 'remaining_amount', i.remaining_amount,
    'wap_cost_rate', i.wap_cost_rate, 'cost_value', i.cost_value_in_cost_ccy,
    'cost_basis_currency', i.cost_basis_currency,
    'market_mid', m.market_mid, 'market_snapshot_at', m.snapshot_at,
    'market_snapshot_source', m.snapshot_source,
    'estimated_market_value_aed',
      CASE WHEN m.market_mid IS NULL THEN NULL
           WHEN i.currency='AED' THEN i.remaining_amount
           ELSE (i.remaining_amount * m.market_mid) END,
    'unrealized_pl_aed',
      CASE WHEN m.market_mid IS NULL OR i.wap_cost_rate IS NULL THEN NULL
           WHEN i.currency='AED' THEN 0
           ELSE (i.remaining_amount * (m.market_mid - i.wap_cost_rate)) END
  ) ORDER BY i.currency), '[]'::jsonb) INTO inventory
  FROM public.v_inventory_by_currency i
  LEFT JOIN public.v_market_rate_latest m ON m.currency = i.currency;

  RETURN jsonb_build_object(
    'meta', public.report_meta('executive_kpis'),
    'quality_mode', q_mode,
    'rows_included', rows_included,
    'rows_excluded', rows_total - rows_included,
    'profit', jsonb_build_object('today', profit_today, 'yesterday', profit_yday,
      'mtd', profit_mtd, 'last_month', profit_last_month, 'ytd', profit_ytd, 'currency', 'AED'),
    'remittances', jsonb_build_object('by_state', remittance_states,
      'open', COALESCE((remittance_states->>'open')::int,0),
      'closed', COALESCE((remittance_states->>'closed')::int,0),
      'waiting_supplier', COALESCE((remittance_states->>'settlement_pending')::int,0),
      'waiting_allocation', COALESCE((remittance_states->>'allocating')::int,0),
      'ready_to_close', COALESCE((remittance_states->>'ready_to_close')::int,0)),
    'inventory', inventory
  );
END $function$;

CREATE OR REPLACE FUNCTION public.report_profit_series(
  _quality_mode text DEFAULT 'exclude_invalid',
  _granularity text DEFAULT 'day',
  _from date DEFAULT NULL, _to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q_mode text := lower(COALESCE(_quality_mode,'exclude_invalid'));
  gran text := lower(COALESCE(_granularity,'day'));
  d_from date := COALESCE(_from, (date_trunc('year', now()) - interval '1 year')::date);
  d_to date := COALESCE(_to, (now() AT TIME ZONE 'UTC')::date);
  series jsonb; rows_total bigint; rows_included bigint;
BEGIN
  IF q_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN
    RAISE EXCEPTION 'invalid quality_mode %', _quality_mode; END IF;
  IF gran NOT IN ('day','week','month','year') THEN
    RAISE EXCEPTION 'invalid granularity % (day|week|month|year)', _granularity; END IF;

  SELECT COUNT(*) INTO rows_total FROM public.v_profit_events
   WHERE event_date BETWEEN d_from AND d_to;
  SELECT COUNT(*) INTO rows_included FROM public.v_profit_events
   WHERE event_date BETWEEN d_from AND d_to
     AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'));

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'bucket_start')::date), '[]'::jsonb) INTO series FROM (
    SELECT jsonb_build_object(
      'bucket_start', date_trunc(gran, event_date)::date,
      'profit_aed', SUM(amount_aed),
      'events', COUNT(*)
    ) AS row
    FROM public.v_profit_events
    WHERE event_date BETWEEN d_from AND d_to
      AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'))
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'meta', public.report_meta('profit_series','phase6.slice2'),
    'quality_mode', q_mode, 'granularity', gran,
    'date_from', d_from, 'date_to', d_to,
    'rows_included', rows_included,
    'rows_excluded', rows_total - rows_included,
    'series', series);
END $$;

CREATE OR REPLACE FUNCTION public.report_profit_breakdown(
  _quality_mode text DEFAULT 'exclude_invalid',
  _dimension text DEFAULT 'customer',
  _from date DEFAULT NULL, _to date DEFAULT NULL, _limit int DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q_mode text := lower(COALESCE(_quality_mode,'exclude_invalid'));
  dim text := lower(COALESCE(_dimension,'customer'));
  d_from date := COALESCE(_from, (date_trunc('year', now()))::date);
  d_to date := COALESCE(_to, (now() AT TIME ZONE 'UTC')::date);
  lim int := GREATEST(1, LEAST(COALESCE(_limit, 25), 500));
  rows_total bigint; rows_included bigint; buckets jsonb;
BEGIN
  IF q_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN
    RAISE EXCEPTION 'invalid quality_mode %', _quality_mode; END IF;
  IF dim NOT IN ('customer','supplier','currency','buy_lot','operator','payment_destination') THEN
    RAISE EXCEPTION 'invalid dimension %', _dimension; END IF;

  SELECT COUNT(*) INTO rows_total FROM public.v_profit_events_ext
   WHERE event_date BETWEEN d_from AND d_to;
  SELECT COUNT(*) INTO rows_included FROM public.v_profit_events_ext
   WHERE event_date BETWEEN d_from AND d_to
     AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'));

  WITH base AS (
    SELECT
      CASE dim
        WHEN 'customer' THEN customer_id::text
        WHEN 'supplier' THEN supplier_id::text
        WHEN 'currency' THEN currency
        WHEN 'buy_lot' THEN primary_lot_id::text
        WHEN 'operator' THEN actor_id::text
        WHEN 'payment_destination' THEN destination_account_id::text
      END AS key,
      amount_aed, gross_profit_aed, commission_aed, spread_aed
    FROM public.v_profit_events_ext
    WHERE event_date BETWEEN d_from AND d_to
      AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'))
  ),
  agg AS (
    SELECT key, COUNT(*)::bigint AS n,
      SUM(amount_aed) AS profit_aed,
      SUM(spread_aed) AS spread_aed,
      SUM(commission_aed) AS commission_aed
    FROM base GROUP BY key
    ORDER BY SUM(amount_aed) DESC NULLS LAST
    LIMIT lim
  ),
  labeled AS (
    SELECT a.key,
      CASE dim
        WHEN 'customer' THEN (SELECT COALESCE(c.name, a.key) FROM public.customers c WHERE c.id::text = a.key)
        WHEN 'supplier' THEN (SELECT COALESCE(c.name, a.key) FROM public.customers c WHERE c.id::text = a.key)
        WHEN 'operator' THEN (SELECT COALESCE(p.display_name, p.email, a.key) FROM public.profiles p WHERE p.id::text = a.key)
        WHEN 'payment_destination' THEN (SELECT COALESCE(ac.name, ac.currency || ' ' || left(a.key,8), a.key) FROM public.accounts ac WHERE ac.id::text = a.key)
        WHEN 'buy_lot' THEN (SELECT COALESCE(il.lot_code, il.currency || ' lot', a.key) FROM public.inventory_lots il WHERE il.id::text = a.key)
        ELSE a.key
      END AS label,
      a.n, a.profit_aed, a.spread_aed, a.commission_aed
    FROM agg a
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', key, 'label', COALESCE(label,'(unassigned)'),
    'events', n, 'profit_aed', profit_aed,
    'spread_aed', spread_aed, 'commission_aed', commission_aed
  ) ORDER BY profit_aed DESC NULLS LAST), '[]'::jsonb) INTO buckets FROM labeled;

  RETURN jsonb_build_object(
    'meta', public.report_meta('profit_breakdown','phase6.slice2'),
    'quality_mode', q_mode, 'dimension', dim,
    'date_from', d_from, 'date_to', d_to, 'limit', lim,
    'rows_included', rows_included,
    'rows_excluded', rows_total - rows_included,
    'buckets', buckets);
END $$;

CREATE OR REPLACE FUNCTION public.report_profit_summary(
  _quality_mode text DEFAULT 'exclude_invalid',
  _from date DEFAULT NULL, _to date DEFAULT NULL, _limit int DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q_mode text := lower(COALESCE(_quality_mode,'exclude_invalid'));
  d_from date := COALESCE(_from, (date_trunc('year', now()))::date);
  d_to date := COALESCE(_to, (now() AT TIME ZONE 'UTC')::date);
  lim int := GREATEST(1, LEAST(COALESCE(_limit, 10), 50));
  rows_total bigint; rows_included bigint;
  avg_spread numeric; avg_commission numeric; total_profit numeric;
  winners jsonb; losers jsonb;
BEGIN
  IF q_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN
    RAISE EXCEPTION 'invalid quality_mode %', _quality_mode; END IF;

  SELECT COUNT(*) INTO rows_total FROM public.v_profit_events_ext
   WHERE event_date BETWEEN d_from AND d_to;

  WITH incl AS (
    SELECT * FROM public.v_profit_events_ext
    WHERE event_date BETWEEN d_from AND d_to
      AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'))
  )
  SELECT COUNT(*), COALESCE(AVG(spread_aed),0), COALESCE(AVG(commission_aed),0), COALESCE(SUM(amount_aed),0)
    INTO rows_included, avg_spread, avg_commission, total_profit FROM incl;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'source', source, 'ref_id', ref_id, 'doc_no', doc_no,
    'customer_id', customer_id, 'currency', currency,
    'profit_aed', amount_aed, 'event_date', event_date
  ) ORDER BY amount_aed DESC), '[]'::jsonb) INTO winners
  FROM (
    SELECT * FROM public.v_profit_events_ext
    WHERE event_date BETWEEN d_from AND d_to
      AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'))
    ORDER BY amount_aed DESC NULLS LAST LIMIT lim
  ) w;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'source', source, 'ref_id', ref_id, 'doc_no', doc_no,
    'customer_id', customer_id, 'currency', currency,
    'profit_aed', amount_aed, 'event_date', event_date
  ) ORDER BY amount_aed ASC), '[]'::jsonb) INTO losers
  FROM (
    SELECT * FROM public.v_profit_events_ext
    WHERE event_date BETWEEN d_from AND d_to
      AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'))
      AND amount_aed < 0
    ORDER BY amount_aed ASC NULLS LAST LIMIT lim
  ) l;

  RETURN jsonb_build_object(
    'meta', public.report_meta('profit_summary','phase6.slice2'),
    'quality_mode', q_mode,
    'date_from', d_from, 'date_to', d_to, 'limit', lim,
    'rows_included', rows_included,
    'rows_excluded', rows_total - rows_included,
    'total_profit_aed', total_profit,
    'avg_spread_aed', avg_spread,
    'avg_commission_aed', avg_commission,
    'top_winners', winners, 'top_losers', losers);
END $$;

REVOKE ALL ON FUNCTION public.report_profit_series(text,text,date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_profit_breakdown(text,text,date,date,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_profit_summary(text,date,date,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_meta(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_profit_series(text,text,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_profit_breakdown(text,text,date,date,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_profit_summary(text,date,date,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_meta(text,text) TO authenticated;

COMMENT ON FUNCTION public.report_profit_series(text,text,date,date) IS
  'Phase 6 Slice 2. Daily/weekly/monthly/yearly profit series. quality_mode: all|exclude_invalid|exclude_suspicious.';
COMMENT ON FUNCTION public.report_profit_breakdown(text,text,date,date,int) IS
  'Phase 6 Slice 2. Profit breakdown by customer|supplier|currency|buy_lot|operator|payment_destination.';
COMMENT ON FUNCTION public.report_profit_summary(text,date,date,int) IS
  'Phase 6 Slice 2. Top winners/losers, avg spread, avg commission. Server-side aggregation only.';
