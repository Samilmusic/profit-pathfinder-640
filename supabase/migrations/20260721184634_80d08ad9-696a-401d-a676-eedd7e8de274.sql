
-- =========================================================
-- Phase 6 — Data Quality Assessment (READ ONLY)
-- No historical data is modified.
-- Thresholds (defaults, in AED):
--   business_threshold  = 10,000,000  → suspicious if exceeded
--   extreme_threshold   = 1,000,000,000 → invalid if reached
-- =========================================================

-- Sell profits: classify closed rows
CREATE OR REPLACE VIEW public.v_sell_data_quality AS
WITH s AS (
  SELECT
    id,
    sold_currency,
    sold_amount,
    gross_profit,
    net_profit_aed,
    net_profit_irr,
    deal_status::text        AS deal_status,
    settlement_status::text  AS settlement_status,
    closed_at,
    entry_date,
    created_by,
    customer_id
  FROM public.sell_transactions
  WHERE deleted_at IS NULL
)
SELECT
  s.id,
  'sell_transactions'::text AS source_table,
  s.deal_status,
  s.settlement_status,
  s.entry_date,
  s.closed_at,
  s.sold_currency,
  s.sold_amount,
  s.gross_profit,
  s.net_profit_aed,
  s.net_profit_irr,
  s.customer_id,
  s.created_by,
  CASE
    WHEN s.closed_at IS NULL THEN 'valid'
    WHEN ABS(COALESCE(s.net_profit_aed, 0)) >= 1e9 THEN 'invalid'
    WHEN s.sold_currency = 'IRR' AND ABS(COALESCE(s.net_profit_aed, 0)) > 1e7 THEN 'invalid'
    WHEN s.net_profit_aed IS NULL AND s.gross_profit IS NULL THEN 'suspicious'
    WHEN ABS(COALESCE(s.net_profit_aed, 0)) > 1e7 THEN 'suspicious'
    WHEN s.net_profit_aed IS NULL AND s.gross_profit IS NOT NULL THEN 'suspicious'
    ELSE 'valid'
  END AS classification,
  CASE
    WHEN s.closed_at IS NULL THEN 'info'
    WHEN ABS(COALESCE(s.net_profit_aed, 0)) >= 1e9 THEN 'critical'
    WHEN s.sold_currency = 'IRR' AND ABS(COALESCE(s.net_profit_aed, 0)) > 1e7 THEN 'critical'
    WHEN s.net_profit_aed IS NULL AND s.gross_profit IS NULL THEN 'warning'
    WHEN ABS(COALESCE(s.net_profit_aed, 0)) > 1e7 THEN 'warning'
    WHEN s.net_profit_aed IS NULL AND s.gross_profit IS NOT NULL THEN 'warning'
    ELSE 'info'
  END AS severity,
  CASE
    WHEN s.closed_at IS NULL THEN NULL
    WHEN ABS(COALESCE(s.net_profit_aed, 0)) >= 1e9
      THEN 'net_profit_aed = ' || s.net_profit_aed::text
           || ' exceeds extreme threshold (1B AED)'
    WHEN s.sold_currency = 'IRR' AND ABS(COALESCE(s.net_profit_aed, 0)) > 1e7
      THEN 'IRR sell with net_profit_aed = ' || s.net_profit_aed::text
           || ' — likely IRR-scale value stored in AED column'
    WHEN s.net_profit_aed IS NULL AND s.gross_profit IS NULL
      THEN 'Closed deal with no profit recorded'
    WHEN ABS(COALESCE(s.net_profit_aed, 0)) > 1e7
      THEN 'net_profit_aed = ' || s.net_profit_aed::text
           || ' exceeds business threshold (10M AED)'
    WHEN s.net_profit_aed IS NULL AND s.gross_profit IS NOT NULL
      THEN 'net_profit_aed missing but gross_profit present'
    ELSE NULL
  END AS reason,
  CASE
    WHEN s.closed_at IS NULL THEN NULL
    WHEN ABS(COALESCE(s.net_profit_aed, 0)) >= 1e9
      OR (s.sold_currency = 'IRR' AND ABS(COALESCE(s.net_profit_aed, 0)) > 1e7)
      THEN 'Isolate from executive reports; investigate and restate with correct currency scale.'
    WHEN s.net_profit_aed IS NULL AND s.gross_profit IS NULL
      THEN 'Recompute profit or mark deal as reviewed before including in totals.'
    WHEN ABS(COALESCE(s.net_profit_aed, 0)) > 1e7
      THEN 'Verify against source documents; confirm currency scale of profit.'
    WHEN s.net_profit_aed IS NULL AND s.gross_profit IS NOT NULL
      THEN 'Backfill net_profit_aed from gross_profit + expenses when reviewed.'
    ELSE NULL
  END AS suggested_remediation
FROM s;

ALTER VIEW public.v_sell_data_quality SET (security_invoker = on);
GRANT SELECT ON public.v_sell_data_quality TO authenticated;

-- Remittance profits: classify
CREATE OR REPLACE VIEW public.v_remittance_data_quality AS
SELECT
  r.id,
  'remittances'::text AS source_table,
  r.doc_no,
  r.status::text                   AS status,
  r.workflow_state::text           AS workflow_state,
  r.workflow_version::text         AS workflow_version,
  r.entry_date,
  r.updated_at                     AS closed_at,
  r.transfer_currency,
  r.transferred_amount,
  r.total_profit_aed,
  r.net_commission_aed,
  r.fx_trading_profit_aed,
  r.customer_id,
  r.created_by,
  CASE
    WHEN r.status <> 'closed' THEN 'valid'
    WHEN ABS(COALESCE(r.total_profit_aed, 0)) >= 1e9 THEN 'invalid'
    WHEN r.transfer_currency = 'IRR' AND ABS(COALESCE(r.total_profit_aed, 0)) > 1e7 THEN 'invalid'
    WHEN r.total_profit_aed IS NULL THEN 'suspicious'
    WHEN ABS(COALESCE(r.total_profit_aed, 0)) > 1e7 THEN 'suspicious'
    ELSE 'valid'
  END AS classification,
  CASE
    WHEN r.status <> 'closed' THEN 'info'
    WHEN ABS(COALESCE(r.total_profit_aed, 0)) >= 1e9 THEN 'critical'
    WHEN r.transfer_currency = 'IRR' AND ABS(COALESCE(r.total_profit_aed, 0)) > 1e7 THEN 'critical'
    WHEN r.total_profit_aed IS NULL THEN 'warning'
    WHEN ABS(COALESCE(r.total_profit_aed, 0)) > 1e7 THEN 'warning'
    ELSE 'info'
  END AS severity,
  CASE
    WHEN r.status <> 'closed' THEN NULL
    WHEN ABS(COALESCE(r.total_profit_aed, 0)) >= 1e9
      THEN 'total_profit_aed = ' || r.total_profit_aed::text
           || ' exceeds extreme threshold (1B AED)'
    WHEN r.transfer_currency = 'IRR' AND ABS(COALESCE(r.total_profit_aed, 0)) > 1e7
      THEN 'IRR remittance with total_profit_aed = ' || r.total_profit_aed::text
           || ' — likely scale error'
    WHEN r.total_profit_aed IS NULL
      THEN 'Closed remittance with no total profit'
    WHEN ABS(COALESCE(r.total_profit_aed, 0)) > 1e7
      THEN 'total_profit_aed = ' || r.total_profit_aed::text
           || ' exceeds business threshold (10M AED)'
    ELSE NULL
  END AS reason,
  CASE
    WHEN r.status <> 'closed' THEN NULL
    WHEN ABS(COALESCE(r.total_profit_aed, 0)) >= 1e9
      OR (r.transfer_currency = 'IRR' AND ABS(COALESCE(r.total_profit_aed, 0)) > 1e7)
      THEN 'Isolate from executive reports; investigate currency scale.'
    WHEN r.total_profit_aed IS NULL
      THEN 'Recompute commission and FX profit components.'
    WHEN ABS(COALESCE(r.total_profit_aed, 0)) > 1e7
      THEN 'Verify against source documents.'
    ELSE NULL
  END AS suggested_remediation
FROM public.remittances r;

ALTER VIEW public.v_remittance_data_quality SET (security_invoker = on);
GRANT SELECT ON public.v_remittance_data_quality TO authenticated;

-- Unified view for the report page
CREATE OR REPLACE VIEW public.v_data_quality AS
SELECT
  id,
  source_table,
  entry_date,
  closed_at,
  classification,
  severity,
  reason,
  suggested_remediation,
  jsonb_build_object(
    'sold_currency',   sold_currency,
    'sold_amount',     sold_amount,
    'net_profit_aed',  net_profit_aed,
    'net_profit_irr',  net_profit_irr,
    'gross_profit',    gross_profit,
    'deal_status',     deal_status,
    'settlement_status', settlement_status
  ) AS details,
  customer_id,
  created_by
FROM public.v_sell_data_quality
UNION ALL
SELECT
  id,
  source_table,
  entry_date,
  closed_at,
  classification,
  severity,
  reason,
  suggested_remediation,
  jsonb_build_object(
    'doc_no',              doc_no,
    'transfer_currency',   transfer_currency,
    'transferred_amount',  transferred_amount,
    'total_profit_aed',    total_profit_aed,
    'net_commission_aed',  net_commission_aed,
    'fx_trading_profit_aed', fx_trading_profit_aed,
    'status',              status,
    'workflow_state',      workflow_state,
    'workflow_version',    workflow_version
  ) AS details,
  customer_id,
  created_by
FROM public.v_remittance_data_quality;

ALTER VIEW public.v_data_quality SET (security_invoker = on);
GRANT SELECT ON public.v_data_quality TO authenticated;

-- Rebuild v_profit_events to carry classification
CREATE OR REPLACE VIEW public.v_profit_events AS
SELECT
  'remittance'::text                                     AS source,
  r.id                                                   AS ref_id,
  r.doc_no                                               AS doc_no,
  r.customer_id                                          AS customer_id,
  r.created_by                                           AS actor_id,
  r.transfer_currency                                    AS currency,
  COALESCE(r.total_profit_aed, 0)::numeric               AS amount_aed,
  COALESCE(
    (SELECT MAX(t.created_at)
       FROM public.remittance_workflow_transitions t
      WHERE t.remittance_id = r.id AND t.to_state = 'closed'),
    r.updated_at
  )                                                      AS event_at,
  r.entry_date                                           AS event_date,
  q.classification                                       AS classification,
  q.severity                                             AS severity
FROM public.remittances r
LEFT JOIN public.v_remittance_data_quality q ON q.id = r.id
WHERE r.status = 'closed'
UNION ALL
SELECT
  'sell'::text                                           AS source,
  s.id                                                   AS ref_id,
  NULL                                                   AS doc_no,
  s.customer_id                                          AS customer_id,
  s.created_by                                           AS actor_id,
  s.sold_currency                                        AS currency,
  COALESCE(s.net_profit_aed, s.gross_profit, 0)::numeric AS amount_aed,
  s.closed_at                                            AS event_at,
  s.entry_date                                           AS event_date,
  q.classification                                       AS classification,
  q.severity                                             AS severity
FROM public.sell_transactions s
LEFT JOIN public.v_sell_data_quality q ON q.id = s.id
WHERE s.deleted_at IS NULL AND s.closed_at IS NOT NULL;

ALTER VIEW public.v_profit_events SET (security_invoker = on);
GRANT SELECT ON public.v_profit_events TO authenticated;

-- Summary function for the DQ dashboard
CREATE OR REPLACE FUNCTION public.report_data_quality_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  by_source jsonb;
  by_class  jsonb;
  by_sev    jsonb;
  impact    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY source_table, classification), '[]'::jsonb) INTO by_source
  FROM (
    SELECT source_table, classification, COUNT(*)::bigint AS n
    FROM public.v_data_quality
    GROUP BY source_table, classification
  ) x;

  SELECT COALESCE(jsonb_object_agg(classification, n), '{}'::jsonb) INTO by_class
  FROM (
    SELECT classification, COUNT(*)::bigint AS n FROM public.v_data_quality GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_object_agg(severity, n), '{}'::jsonb) INTO by_sev
  FROM (
    SELECT severity, COUNT(*)::bigint AS n FROM public.v_data_quality GROUP BY 1
  ) x;

  -- Executive impact: how much AED is "hidden" if we exclude invalid / suspicious
  SELECT jsonb_build_object(
    'total_amount_aed_all',
      COALESCE((SELECT SUM(amount_aed) FROM public.v_profit_events), 0),
    'total_amount_aed_exclude_invalid',
      COALESCE((SELECT SUM(amount_aed) FROM public.v_profit_events WHERE classification <> 'invalid'), 0),
    'total_amount_aed_exclude_suspicious',
      COALESCE((SELECT SUM(amount_aed) FROM public.v_profit_events WHERE classification = 'valid'), 0)
  ) INTO impact;

  RETURN jsonb_build_object(
    'meta',      public.report_meta('data_quality_summary'),
    'by_source', by_source,
    'by_class',  by_class,
    'by_severity', by_sev,
    'executive_impact', impact
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_data_quality_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_data_quality_summary() TO authenticated;

-- Executive KPIs now honour a quality_mode filter
DROP FUNCTION IF EXISTS public.report_executive_kpis();
CREATE OR REPLACE FUNCTION public.report_executive_kpis(_quality_mode text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today            date := (now() AT TIME ZONE 'UTC')::date;
  yday             date := today - 1;
  month_start      date := date_trunc('month', today)::date;
  last_month_start date := (date_trunc('month', today) - interval '1 month')::date;
  last_month_end   date := (date_trunc('month', today) - interval '1 day')::date;
  year_start       date := date_trunc('year', today)::date;

  q_mode text := lower(COALESCE(_quality_mode, 'all'));

  profit_today       numeric;
  profit_yday        numeric;
  profit_mtd         numeric;
  profit_last_month  numeric;
  profit_ytd         numeric;

  remittance_states  jsonb;
  inventory          jsonb;
BEGIN
  IF q_mode NOT IN ('all', 'exclude_invalid', 'exclude_suspicious') THEN
    RAISE EXCEPTION 'invalid quality_mode %', _quality_mode
      USING HINT = 'expected one of all | exclude_invalid | exclude_suspicious';
  END IF;

  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_today FROM public.v_profit_events
    WHERE event_date = today
      AND ( q_mode = 'all'
         OR (q_mode = 'exclude_invalid'    AND classification <> 'invalid')
         OR (q_mode = 'exclude_suspicious' AND classification = 'valid') );

  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_yday FROM public.v_profit_events
    WHERE event_date = yday
      AND ( q_mode = 'all'
         OR (q_mode = 'exclude_invalid'    AND classification <> 'invalid')
         OR (q_mode = 'exclude_suspicious' AND classification = 'valid') );

  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_mtd FROM public.v_profit_events
    WHERE event_date >= month_start
      AND ( q_mode = 'all'
         OR (q_mode = 'exclude_invalid'    AND classification <> 'invalid')
         OR (q_mode = 'exclude_suspicious' AND classification = 'valid') );

  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_last_month FROM public.v_profit_events
    WHERE event_date BETWEEN last_month_start AND last_month_end
      AND ( q_mode = 'all'
         OR (q_mode = 'exclude_invalid'    AND classification <> 'invalid')
         OR (q_mode = 'exclude_suspicious' AND classification = 'valid') );

  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_ytd FROM public.v_profit_events
    WHERE event_date >= year_start
      AND ( q_mode = 'all'
         OR (q_mode = 'exclude_invalid'    AND classification <> 'invalid')
         OR (q_mode = 'exclude_suspicious' AND classification = 'valid') );

  SELECT COALESCE(jsonb_object_agg(state, n), '{}'::jsonb) INTO remittance_states
    FROM (
      SELECT state, SUM(n)::bigint AS n
      FROM public.v_remittance_state_counts
      GROUP BY state
    ) s;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'currency',            i.currency,
      'remaining_amount',    i.remaining_amount,
      'wap_cost_rate',       i.wap_cost_rate,
      'cost_value',          i.cost_value_in_cost_ccy,
      'cost_basis_currency', i.cost_basis_currency,
      'market_mid',          m.market_mid,
      'market_snapshot_at',  m.snapshot_at,
      'market_snapshot_source', m.snapshot_source,
      'estimated_market_value_aed',
        CASE
          WHEN m.market_mid IS NULL THEN NULL
          WHEN i.currency = 'AED' THEN i.remaining_amount
          ELSE (i.remaining_amount * m.market_mid)
        END,
      'unrealized_pl_aed',
        CASE
          WHEN m.market_mid IS NULL OR i.wap_cost_rate IS NULL THEN NULL
          WHEN i.currency = 'AED' THEN 0
          ELSE (i.remaining_amount * (m.market_mid - i.wap_cost_rate))
        END
    ) ORDER BY i.currency),
    '[]'::jsonb
  ) INTO inventory
  FROM public.v_inventory_by_currency i
  LEFT JOIN public.v_market_rate_latest m ON m.currency = i.currency;

  RETURN jsonb_build_object(
    'meta', public.report_meta('executive_kpis'),
    'quality_mode', q_mode,
    'profit', jsonb_build_object(
      'today',       profit_today,
      'yesterday',   profit_yday,
      'mtd',         profit_mtd,
      'last_month',  profit_last_month,
      'ytd',         profit_ytd,
      'currency',    'AED'
    ),
    'remittances', jsonb_build_object(
      'by_state', remittance_states,
      'open',     COALESCE((remittance_states->>'open')::bigint, 0),
      'closed',   COALESCE((remittance_states->>'closed')::bigint, 0),
      'waiting_supplier',   COALESCE((remittance_states->>'settlement_pending')::bigint, 0),
      'waiting_allocation', COALESCE((remittance_states->>'allocating')::bigint, 0),
      'ready_to_close',     COALESCE((remittance_states->>'ready_to_close')::bigint, 0)
    ),
    'inventory', inventory
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_executive_kpis(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_executive_kpis(text) TO authenticated;
