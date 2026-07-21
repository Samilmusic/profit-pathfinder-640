
-- =========================================================
-- Phase 6 Slice 1 — Reporting foundation (READ ONLY)
-- =========================================================

-- --- Indexes (safe, non-blocking additions) ---------------
CREATE INDEX IF NOT EXISTS idx_rem_state_created
  ON public.remittances (workflow_state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rem_entrydate_status
  ON public.remittances (entry_date DESC, status);

CREATE INDEX IF NOT EXISTS idx_sell_closed_at
  ON public.sell_transactions (closed_at DESC)
  WHERE closed_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sell_customer_closed
  ON public.sell_transactions (customer_id, closed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON public.audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_lots_currency_created
  ON public.inventory_lots (currency, created_at);

-- --- Report version helper --------------------------------
-- Bump REPORT_VERSION whenever a report definition changes.
CREATE OR REPLACE FUNCTION public.report_meta(_report_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'report_key', _report_key,
    'report_version', '1.0.0',
    'generated_at', now(),
    'data_cutoff', now(),
    'generated_by_version', 'phase6.slice1'
  );
$$;

GRANT EXECUTE ON FUNCTION public.report_meta(text) TO authenticated;

-- --- Market rate snapshot view (NO live API) --------------
-- Uses the latest persisted market_rates row per currency.
-- If no snapshot exists, market_mid_aed is NULL and the UI
-- shows "Market value unavailable".
CREATE OR REPLACE VIEW public.v_market_rate_latest AS
SELECT DISTINCT ON (currency)
  currency,
  mid_rate      AS market_mid,
  buy_rate      AS market_buy,
  sell_rate     AS market_sell,
  fetched_at    AS snapshot_at,
  source        AS snapshot_source
FROM public.market_rates
WHERE status = 'ok'
ORDER BY currency, fetched_at DESC;

GRANT SELECT ON public.v_market_rate_latest TO authenticated;

-- --- Unified profit events view ---------------------------
-- Combines closed remittance profit and closed sell profit,
-- all already computed by the server. No client math.
CREATE OR REPLACE VIEW public.v_profit_events AS
SELECT
  'remittance'::text                                  AS source,
  r.id                                                AS ref_id,
  r.doc_no                                            AS doc_no,
  r.customer_id                                       AS customer_id,
  r.created_by                                        AS actor_id,
  r.transfer_currency                                 AS currency,
  COALESCE(r.total_profit_aed, 0)::numeric            AS amount_aed,
  COALESCE(
    (SELECT MAX(t.created_at)
       FROM public.remittance_workflow_transitions t
      WHERE t.remittance_id = r.id AND t.to_state = 'closed'),
    r.updated_at
  )                                                   AS event_at,
  r.entry_date                                        AS event_date
FROM public.remittances r
WHERE r.status = 'closed'

UNION ALL

SELECT
  'sell'::text                                        AS source,
  s.id                                                AS ref_id,
  NULL                                                AS doc_no,
  s.customer_id                                       AS customer_id,
  s.created_by                                        AS actor_id,
  s.sold_currency                                     AS currency,
  COALESCE(s.net_profit_aed, s.gross_profit, 0)::numeric AS amount_aed,
  s.closed_at                                         AS event_at,
  s.entry_date                                        AS event_date
FROM public.sell_transactions s
WHERE s.deleted_at IS NULL
  AND s.closed_at IS NOT NULL;

GRANT SELECT ON public.v_profit_events TO authenticated;

-- --- Remittance state count view --------------------------
CREATE OR REPLACE VIEW public.v_remittance_state_counts AS
SELECT
  COALESCE(workflow_state::text, status::text) AS state,
  workflow_version::text                       AS version,
  COUNT(*)::bigint                             AS n
FROM public.remittances
GROUP BY 1, 2;

GRANT SELECT ON public.v_remittance_state_counts TO authenticated;

-- --- Currency inventory summary view ----------------------
-- Cost + remaining amount by currency, all from server data.
CREATE OR REPLACE VIEW public.v_inventory_by_currency AS
SELECT
  il.currency,
  SUM(il.remaining_amount)::numeric                       AS remaining_amount,
  SUM(il.original_amount)::numeric                        AS original_amount,
  SUM(il.remaining_amount * il.cost_basis_rate)::numeric  AS cost_value_in_cost_ccy,
  -- Weighted-average cost basis rate (defensive against zero remaining)
  CASE
    WHEN SUM(il.remaining_amount) > 0
      THEN SUM(il.remaining_amount * il.cost_basis_rate) / SUM(il.remaining_amount)
    ELSE NULL
  END::numeric                                            AS wap_cost_rate,
  MAX(il.cost_basis_currency)                             AS cost_basis_currency
FROM public.inventory_lots il
WHERE il.status <> 'depleted'
  AND il.remaining_amount > 0
GROUP BY il.currency;

GRANT SELECT ON public.v_inventory_by_currency TO authenticated;

-- =========================================================
-- Executive KPIs (cacheable, financial)
-- =========================================================
CREATE OR REPLACE FUNCTION public.report_executive_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today       date := (now() AT TIME ZONE 'UTC')::date;
  yday        date := today - 1;
  month_start date := date_trunc('month', today)::date;
  last_month_start date := (date_trunc('month', today) - interval '1 month')::date;
  last_month_end   date := (date_trunc('month', today) - interval '1 day')::date;
  year_start  date := date_trunc('year', today)::date;

  profit_today       numeric;
  profit_yday        numeric;
  profit_mtd         numeric;
  profit_last_month  numeric;
  profit_ytd         numeric;

  remittance_states  jsonb;
  inventory          jsonb;
BEGIN
  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_today
    FROM public.v_profit_events WHERE event_date = today;

  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_yday
    FROM public.v_profit_events WHERE event_date = yday;

  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_mtd
    FROM public.v_profit_events WHERE event_date >= month_start;

  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_last_month
    FROM public.v_profit_events
    WHERE event_date BETWEEN last_month_start AND last_month_end;

  SELECT COALESCE(SUM(amount_aed), 0) INTO profit_ytd
    FROM public.v_profit_events WHERE event_date >= year_start;

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

GRANT EXECUTE ON FUNCTION public.report_executive_kpis() TO authenticated;

-- =========================================================
-- Operational KPIs (live, refreshed frequently)
-- =========================================================
CREATE OR REPLACE FUNCTION public.report_operational_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  states jsonb;
  workload jsonb;
  closed_today bigint;
  cancelled_today bigint;
  avg_proc_seconds numeric;
BEGIN
  SELECT COALESCE(jsonb_object_agg(state, n), '{}'::jsonb) INTO states
  FROM (
    SELECT COALESCE(workflow_state::text, status::text) AS state, COUNT(*)::bigint AS n
    FROM public.remittances
    GROUP BY 1
  ) s;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'operator_id', op,
      'open_drafts', open_drafts,
      'in_flight',   in_flight,
      'closed_today', closed_today,
      'cancelled_today', cancelled_today
    ) ORDER BY in_flight DESC),
    '[]'::jsonb
  ) INTO workload
  FROM (
    SELECT
      r.created_by AS op,
      COUNT(*) FILTER (WHERE r.status = 'open' AND (r.workflow_state IS NULL OR r.workflow_state::text = 'draft')) AS open_drafts,
      COUNT(*) FILTER (WHERE r.status = 'open') AS in_flight,
      COUNT(*) FILTER (WHERE r.status = 'closed' AND r.updated_at::date = today) AS closed_today,
      COUNT(*) FILTER (WHERE r.status = 'cancelled' AND r.updated_at::date = today) AS cancelled_today
    FROM public.remittances r
    WHERE r.created_by IS NOT NULL
    GROUP BY r.created_by
  ) x;

  SELECT COUNT(*) INTO closed_today
    FROM public.remittances
    WHERE status = 'closed' AND updated_at::date = today;

  SELECT COUNT(*) INTO cancelled_today
    FROM public.remittances
    WHERE status = 'cancelled' AND updated_at::date = today;

  SELECT AVG(EXTRACT(EPOCH FROM (closed.created_at - opened.created_at)))
    INTO avg_proc_seconds
  FROM (
    SELECT remittance_id, MIN(created_at) AS created_at
    FROM public.remittance_workflow_transitions
    WHERE to_state = 'draft' OR from_state IS NULL
    GROUP BY remittance_id
  ) opened
  JOIN (
    SELECT remittance_id, MAX(created_at) AS created_at
    FROM public.remittance_workflow_transitions
    WHERE to_state = 'closed'
    GROUP BY remittance_id
  ) closed USING (remittance_id);

  RETURN jsonb_build_object(
    'meta', public.report_meta('operational_kpis'),
    'states', states,
    'operator_workload', workload,
    'closed_today', closed_today,
    'cancelled_today', cancelled_today,
    'avg_processing_seconds', avg_proc_seconds
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_operational_kpis() TO authenticated;
