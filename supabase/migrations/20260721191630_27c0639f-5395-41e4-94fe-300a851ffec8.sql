
-- Phase 6 Slice 3 — Customer & Supplier Analytics (READ ONLY)

CREATE OR REPLACE VIEW public.v_operator_labels AS
SELECT
  p.id AS actor_id,
  COALESCE(
    NULLIF(btrim(p.display_name), ''),
    NULLIF(btrim(p.email), ''),
    'user ' || substr(p.id::text, 1, 8)
  ) AS label,
  p.display_name, p.email
FROM public.profiles p;

COMMENT ON VIEW public.v_operator_labels IS
  'Reporting only. Actor id → display name → email → short uuid. phase6.slice3';

CREATE OR REPLACE VIEW public.v_remittance_lifecycle AS
WITH t AS (
  SELECT
    r.id AS remittance_id, r.customer_id,
    r.fx_supplier_customer_id AS supplier_id,
    r.workflow_state, r.status, r.created_at,
    (SELECT min(x.created_at) FROM public.remittance_workflow_transitions x
       WHERE x.remittance_id=r.id AND x.to_state IN ('funds_received','settlement_pending')) AS t_settle,
    (SELECT min(x.created_at) FROM public.remittance_workflow_transitions x
       WHERE x.remittance_id=r.id AND x.to_state='allocating') AS t_alloc,
    (SELECT max(x.created_at) FROM public.remittance_workflow_transitions x
       WHERE x.remittance_id=r.id AND x.to_state='closed')     AS t_closed,
    (SELECT max(x.created_at) FROM public.remittance_workflow_transitions x
       WHERE x.remittance_id=r.id AND x.to_state='cancelled')  AS t_cancelled
  FROM public.remittances r
)
SELECT
  t.remittance_id, t.customer_id, t.supplier_id,
  t.workflow_state, t.status, t.created_at,
  t.t_settle, t.t_alloc, t.t_closed, t.t_cancelled,
  CASE WHEN t.t_settle IS NOT NULL THEN EXTRACT(EPOCH FROM (t.t_settle-t.created_at)) END AS settle_seconds,
  CASE WHEN t.t_alloc  IS NOT NULL AND t.t_settle IS NOT NULL
       THEN EXTRACT(EPOCH FROM (t.t_alloc-t.t_settle)) END AS alloc_seconds,
  CASE WHEN t.t_closed IS NOT NULL AND t.t_alloc IS NOT NULL
       THEN EXTRACT(EPOCH FROM (t.t_closed-t.t_alloc)) END AS close_seconds,
  CASE WHEN t.t_closed IS NOT NULL
       THEN EXTRACT(EPOCH FROM (t.t_closed-t.created_at)) END AS total_seconds,
  CASE WHEN t.t_closed IS NOT NULL AND (t.t_closed-t.created_at)>interval '72 hours'
       THEN TRUE ELSE FALSE END AS is_late
FROM t;

COMMENT ON VIEW public.v_remittance_lifecycle IS
  'Reporting only. Durations derived from workflow_transitions. phase6.slice3';

CREATE OR REPLACE VIEW public.v_profit_events_multi AS
WITH sell_lot_weights AS (
  SELECT lc.sell_ref_id AS sell_id, lc.lot_id, lc.cost_amount,
         SUM(lc.cost_amount) OVER (PARTITION BY lc.sell_ref_id) AS sell_total_cost
  FROM public.lot_consumptions lc WHERE lc.sell_ref_type='sell'
),
sell_rows AS (
  SELECT
    'sell'::text AS source, s.id AS ref_id, s.doc_no,
    s.customer_id, s.created_by AS actor_id,
    NULL::uuid AS supplier_id, s.received_into_account_id AS destination_account_id,
    w.lot_id,
    CASE WHEN w.sell_total_cost IS NULL OR w.sell_total_cost=0 THEN 1
         ELSE (w.cost_amount/w.sell_total_cost) END AS lot_weight,
    s.sold_currency AS currency,
    (COALESCE(s.net_profit_aed,s.gross_profit,0) *
       CASE WHEN w.sell_total_cost IS NULL OR w.sell_total_cost=0 THEN 1
            ELSE (w.cost_amount/w.sell_total_cost) END) AS amount_aed,
    (COALESCE(s.gross_profit,0) *
       CASE WHEN w.sell_total_cost IS NULL OR w.sell_total_cost=0 THEN 1
            ELSE (w.cost_amount/w.sell_total_cost) END) AS spread_aed,
    0::numeric AS commission_aed,
    s.closed_at AS event_at, s.entry_date AS event_date,
    q.classification, q.severity
  FROM public.sell_transactions s
  LEFT JOIN sell_lot_weights w ON w.sell_id=s.id
  LEFT JOIN public.v_sell_data_quality q ON q.id=s.id
  WHERE s.deleted_at IS NULL AND s.closed_at IS NOT NULL
),
rem_alloc_weights AS (
  SELECT ra.remittance_id, ra.lot_id, ra.allocated_amount, ra.buy_id,
         SUM(ra.allocated_amount) OVER (PARTITION BY ra.remittance_id) AS rem_total_alloc
  FROM public.remittance_allocations ra
  WHERE ra.status IN ('open','closed') AND ra.entry_kind='normal'
),
rem_rows AS (
  SELECT
    'remittance'::text AS source, r.id AS ref_id, r.doc_no,
    r.customer_id, r.created_by AS actor_id,
    r.fx_supplier_customer_id AS supplier_id, r.source_account_id AS destination_account_id,
    aw.lot_id,
    CASE WHEN aw.rem_total_alloc IS NULL OR aw.rem_total_alloc=0 THEN 1
         ELSE (aw.allocated_amount/aw.rem_total_alloc) END AS lot_weight,
    r.transfer_currency AS currency,
    (COALESCE(r.total_profit_aed,0) *
       CASE WHEN aw.rem_total_alloc IS NULL OR aw.rem_total_alloc=0 THEN 1
            ELSE (aw.allocated_amount/aw.rem_total_alloc) END) AS amount_aed,
    (COALESCE(r.fx_trading_profit_aed,0) *
       CASE WHEN aw.rem_total_alloc IS NULL OR aw.rem_total_alloc=0 THEN 1
            ELSE (aw.allocated_amount/aw.rem_total_alloc) END) AS spread_aed,
    (COALESCE(r.net_commission_aed,0) *
       CASE WHEN aw.rem_total_alloc IS NULL OR aw.rem_total_alloc=0 THEN 1
            ELSE (aw.allocated_amount/aw.rem_total_alloc) END) AS commission_aed,
    COALESCE(
      (SELECT max(x.created_at) FROM public.remittance_workflow_transitions x
        WHERE x.remittance_id=r.id AND x.to_state='closed'),
      r.updated_at) AS event_at,
    r.entry_date AS event_date,
    q.classification, q.severity
  FROM public.remittances r
  LEFT JOIN rem_alloc_weights aw ON aw.remittance_id=r.id
  LEFT JOIN public.v_remittance_data_quality q ON q.id=r.id
  WHERE r.status='closed'
)
SELECT * FROM sell_rows UNION ALL SELECT * FROM rem_rows;

COMMENT ON VIEW public.v_profit_events_multi IS
  'Reporting only. Multi-lot proportional profit expansion. phase6.slice3';

CREATE INDEX IF NOT EXISTS idx_rem_supplier_state
  ON public.remittances (fx_supplier_customer_id, workflow_state)
  WHERE fx_supplier_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rem_customer_state
  ON public.remittances (customer_id, workflow_state, created_at DESC)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sell_customer_entry
  ON public.sell_transactions (customer_id, entry_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rem_alloc_lot
  ON public.remittance_allocations (lot_id) WHERE lot_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._report_meta(_key text, _version text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT jsonb_build_object(
    'report_key', _key,
    'report_version', _version,
    'generated_at', now(),
    'data_cutoff', now(),
    'generated_by_version', 'phase6.slice3'
  );
$$;

CREATE OR REPLACE FUNCTION public.report_customer_list(
  _quality_mode text DEFAULT 'exclude_invalid',
  _from date DEFAULT NULL, _to date DEFAULT NULL,
  _search text DEFAULT NULL, _sort text DEFAULT 'profit_desc',
  _limit int DEFAULT 50, _offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE
  v_from date := COALESCE(_from, DATE '1900-01-01');
  v_to   date := COALESCE(_to,   DATE '2999-12-31');
  v_mode text := COALESCE(_quality_mode,'exclude_invalid');
  v_search text := NULLIF(btrim(COALESCE(_search,'')),'');
  v_limit int  := LEAST(GREATEST(COALESCE(_limit,50),1),200);
  v_offset int := GREATEST(COALESCE(_offset,0),0);
  v_total int; v_included int; v_excluded int; v_rows jsonb;
BEGIN
  IF v_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN v_mode := 'exclude_invalid'; END IF;

  WITH base_events AS (
    SELECT ev.* FROM public.v_profit_events_ext ev
    WHERE ev.event_date BETWEEN v_from AND v_to
      AND ( v_mode='all'
         OR (v_mode='exclude_invalid'    AND COALESCE(ev.classification,'valid')<>'invalid')
         OR (v_mode='exclude_suspicious' AND COALESCE(ev.classification,'valid')= 'valid') )
  ),
  per_customer AS (
    SELECT be.customer_id,
      COUNT(*) AS trade_count,
      SUM(amount_aed) AS lifetime_profit_aed,
      AVG(amount_aed) AS avg_profit_aed,
      AVG(spread_aed) AS avg_spread_aed,
      AVG(commission_aed) AS avg_commission_aed,
      SUM(GREATEST(amount_aed,0)) AS lifetime_volume_aed,
      MAX(amount_aed) AS largest_profit_aed,
      MIN(amount_aed) AS largest_loss_aed,
      MAX(event_at) AS last_event_at,
      MIN(event_at) AS first_event_at,
      SUM(CASE WHEN event_at>=now()-interval '30 days' THEN 1 ELSE 0 END) AS events_30d,
      SUM(CASE WHEN event_at>=now()-interval '90 days' THEN 1 ELSE 0 END) AS events_90d,
      SUM(CASE WHEN amount_aed<0 THEN 1 ELSE 0 END) AS loss_count,
      (SELECT currency FROM base_events b2 WHERE b2.customer_id=be.customer_id
        GROUP BY currency ORDER BY COUNT(*) DESC LIMIT 1) AS preferred_currency,
      (SELECT destination_account_id FROM base_events b2
        WHERE b2.customer_id=be.customer_id AND destination_account_id IS NOT NULL
        GROUP BY destination_account_id ORDER BY COUNT(*) DESC LIMIT 1) AS preferred_destination_id,
      (SELECT to_char(date_trunc('month',event_at),'YYYY-MM') FROM base_events b2
        WHERE b2.customer_id=be.customer_id
        GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1) AS most_active_month
    FROM base_events be WHERE be.customer_id IS NOT NULL GROUP BY be.customer_id
  ),
  rem_stats AS (
    SELECT customer_id,
      COUNT(*) AS rem_total,
      SUM(CASE WHEN workflow_state='closed'    THEN 1 ELSE 0 END) AS rem_closed,
      SUM(CASE WHEN workflow_state='cancelled' THEN 1 ELSE 0 END) AS rem_cancelled,
      SUM(CASE WHEN workflow_state NOT IN ('closed','cancelled') THEN 1 ELSE 0 END) AS rem_open,
      AVG(settle_seconds) AS avg_settle_seconds,
      AVG(alloc_seconds)  AS avg_alloc_seconds,
      AVG(close_seconds)  AS avg_close_seconds,
      SUM(CASE WHEN is_late THEN 1 ELSE 0 END) AS late_count
    FROM public.v_remittance_lifecycle
    WHERE customer_id IS NOT NULL AND created_at::date BETWEEN v_from AND v_to
    GROUP BY customer_id
  ),
  joined AS (
    SELECT c.id AS customer_id, c.name, c.phone,
      COALESCE(pc.trade_count,0) AS trade_count,
      COALESCE(pc.lifetime_profit_aed,0) AS lifetime_profit_aed,
      COALESCE(pc.lifetime_volume_aed,0) AS lifetime_volume_aed,
      pc.avg_profit_aed, pc.avg_spread_aed, pc.avg_commission_aed,
      pc.largest_profit_aed, pc.largest_loss_aed,
      pc.preferred_currency, pc.preferred_destination_id, pc.most_active_month,
      COALESCE(pc.events_30d,0) AS events_30d,
      COALESCE(pc.events_90d,0) AS events_90d,
      pc.first_event_at, pc.last_event_at,
      COALESCE(rs.rem_total,0)     AS rem_total,
      COALESCE(rs.rem_open,0)      AS rem_open,
      COALESCE(rs.rem_closed,0)    AS rem_closed,
      COALESCE(rs.rem_cancelled,0) AS rem_cancelled,
      rs.avg_settle_seconds, rs.avg_alloc_seconds, rs.avg_close_seconds,
      CASE WHEN COALESCE(rs.rem_total,0)=0 THEN NULL
           ELSE rs.rem_closed::numeric/rs.rem_total::numeric END AS success_rate,
      CASE WHEN COALESCE(rs.rem_total,0)=0 THEN NULL
           ELSE rs.rem_cancelled::numeric/rs.rem_total::numeric END AS cancel_rate,
      CASE WHEN COALESCE(pc.trade_count,0)=0 THEN NULL
           ELSE COALESCE(pc.loss_count,0)::numeric/pc.trade_count::numeric END AS loss_rate,
      CASE WHEN pc.last_event_at IS NULL THEN NULL
           ELSE EXTRACT(EPOCH FROM (now()-pc.last_event_at))/86400 END AS dormant_days
    FROM public.customers c
    LEFT JOIN per_customer pc ON pc.customer_id=c.id
    LEFT JOIN rem_stats    rs ON rs.customer_id=c.id
    WHERE c.deleted_at IS NULL
      AND (v_search IS NULL OR c.name ILIKE '%'||v_search||'%' OR c.phone ILIKE '%'||v_search||'%')
  ),
  scored AS (
    SELECT j.*,
      (   CASE WHEN j.rem_total>=3 AND COALESCE(j.cancel_rate,0)>=0.30 THEN 3
               WHEN COALESCE(j.cancel_rate,0)>=0.15 THEN 1 ELSE 0 END
        + CASE WHEN j.trade_count>=3 AND COALESCE(j.loss_rate,0)>=0.20 THEN 2 ELSE 0 END
        + CASE WHEN j.rem_total>=3 AND COALESCE(j.success_rate,1)<0.60 THEN 1 ELSE 0 END
        + CASE WHEN COALESCE(j.avg_settle_seconds,0)>72*3600 THEN 1 ELSE 0 END
        + CASE WHEN COALESCE(j.dormant_days,0)>180 AND j.trade_count<5 THEN 1 ELSE 0 END
      ) AS risk_points
    FROM joined j
  ),
  final AS (
    SELECT sc.*,
      CASE WHEN sc.trade_count=0 AND sc.rem_total=0 THEN 'unknown'
           WHEN sc.risk_points<=2 THEN 'low'
           WHEN sc.risk_points<=4 THEN 'medium'
           ELSE 'high' END AS risk_level
    FROM scored sc
  )
  SELECT
    COUNT(*),
    (SELECT COUNT(*) FROM base_events),
    (SELECT COUNT(*) FROM public.v_profit_events_ext ev WHERE ev.event_date BETWEEN v_from AND v_to)
      - (SELECT COUNT(*) FROM base_events),
    jsonb_agg(row_to_json(x)) FILTER (WHERE x.rn BETWEEN v_offset+1 AND v_offset+v_limit)
  INTO v_total, v_included, v_excluded, v_rows
  FROM (
    SELECT f.*,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN _sort='profit_desc' THEN -f.lifetime_profit_aed END NULLS LAST,
          CASE WHEN _sort='profit_asc'  THEN  f.lifetime_profit_aed END NULLS LAST,
          CASE WHEN _sort='volume_desc' THEN -f.lifetime_volume_aed END NULLS LAST,
          CASE WHEN _sort='trades_desc' THEN -f.trade_count::numeric END NULLS LAST,
          CASE WHEN _sort='risk_desc'   THEN -f.risk_points::numeric END NULLS LAST,
          CASE WHEN _sort='recent_desc' THEN -EXTRACT(EPOCH FROM COALESCE(f.last_event_at,'epoch'::timestamptz)) END NULLS LAST,
          f.name ASC
      ) AS rn
    FROM final f
  ) x;

  RETURN jsonb_build_object(
    'meta',          public._report_meta('customer_list','1.0.0'),
    'quality_mode',  v_mode, 'date_from', v_from, 'date_to', v_to,
    'rows_included', COALESCE(v_included,0),
    'rows_excluded', COALESCE(v_excluded,0),
    'total',         COALESCE(v_total,0),
    'limit',         v_limit, 'offset', v_offset,
    'sort',          _sort, 'search', v_search,
    'rows',          COALESCE(v_rows,'[]'::jsonb)
  );
END
$fn$;

COMMENT ON FUNCTION public.report_customer_list(text,date,date,text,text,int,int) IS
  'Reporting only. Aggregated customer analytics list. phase6.slice3';

CREATE OR REPLACE FUNCTION public.report_customer_detail(
  _customer_id uuid, _quality_mode text DEFAULT 'exclude_invalid',
  _from date DEFAULT NULL, _to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE
  v_from date := COALESCE(_from, DATE '1900-01-01');
  v_to   date := COALESCE(_to,   DATE '2999-12-31');
  v_mode text := COALESCE(_quality_mode,'exclude_invalid');
  v_result jsonb;
BEGIN
  IF v_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN v_mode := 'exclude_invalid'; END IF;

  WITH cust AS (
    SELECT c.id, c.name, c.phone, c.notes, c.created_at
    FROM public.customers c WHERE c.id=_customer_id AND c.deleted_at IS NULL
  ),
  events AS (
    SELECT ev.* FROM public.v_profit_events_ext ev
    WHERE ev.customer_id=_customer_id
      AND ev.event_date BETWEEN v_from AND v_to
      AND ( v_mode='all'
         OR (v_mode='exclude_invalid'    AND COALESCE(ev.classification,'valid')<>'invalid')
         OR (v_mode='exclude_suspicious' AND COALESCE(ev.classification,'valid')= 'valid') )
  ),
  monthly AS (
    SELECT to_char(date_trunc('month',event_at),'YYYY-MM') AS bucket,
           SUM(amount_aed) AS profit_aed,
           SUM(GREATEST(amount_aed,0)) AS volume_aed,
           COUNT(*) AS events
    FROM events GROUP BY 1 ORDER BY 1
  ),
  recent AS (
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.event_at DESC) FILTER (WHERE r.rn<=25) AS rows
    FROM (
      SELECT ev.source, ev.ref_id, ev.doc_no, ev.currency, ev.amount_aed, ev.event_at,
             ev.classification, ev.severity,
             (SELECT ol.label FROM public.v_operator_labels ol WHERE ol.actor_id=ev.actor_id) AS operator_label,
             ROW_NUMBER() OVER (ORDER BY ev.event_at DESC) AS rn
      FROM events ev
    ) r
  ),
  settlement_timeline AS (
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC) FILTER (WHERE t.rn<=100) AS rows
    FROM (
      SELECT rt.remittance_id, r.doc_no, rt.from_state, rt.to_state, rt.reason, rt.created_at,
             (SELECT label FROM public.v_operator_labels ol WHERE ol.actor_id=rt.actor) AS actor_label,
             ROW_NUMBER() OVER (ORDER BY rt.created_at DESC) AS rn
      FROM public.remittance_workflow_transitions rt
      JOIN public.remittances r ON r.id=rt.remittance_id
      WHERE r.customer_id=_customer_id
    ) t
  ),
  allocation_history AS (
    SELECT jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC) FILTER (WHERE a.rn<=100) AS rows
    FROM (
      SELECT ra.id, ra.remittance_id, r.doc_no, ra.buy_id, ra.currency,
             ra.allocated_amount, ra.status, ra.entry_kind,
             ra.frozen_total_profit_aed, ra.created_at,
             ROW_NUMBER() OVER (ORDER BY ra.created_at DESC) AS rn
      FROM public.remittance_allocations ra
      JOIN public.remittances r ON r.id=ra.remittance_id
      WHERE r.customer_id=_customer_id
    ) a
  ),
  totals AS (
    SELECT COUNT(*) AS event_count,
           SUM(amount_aed) AS profit_total_aed,
           SUM(GREATEST(amount_aed,0)) AS volume_total_aed,
           MAX(amount_aed) AS largest_profit_aed,
           MIN(amount_aed) AS largest_loss_aed,
           AVG(amount_aed) AS avg_profit_aed,
           AVG(spread_aed) AS avg_spread_aed,
           AVG(commission_aed) AS avg_commission_aed
    FROM events
  ),
  excluded_count AS (
    SELECT (SELECT COUNT(*) FROM public.v_profit_events_ext ev
             WHERE ev.customer_id=_customer_id AND ev.event_date BETWEEN v_from AND v_to)
         - (SELECT COUNT(*) FROM events) AS n
  )
  SELECT jsonb_build_object(
    'meta',          public._report_meta('customer_detail','1.0.0'),
    'quality_mode',  v_mode, 'date_from', v_from, 'date_to', v_to,
    'customer',      (SELECT row_to_json(cust) FROM cust),
    'totals',        (SELECT row_to_json(totals) FROM totals),
    'monthly',       (SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.bucket),'[]'::jsonb) FROM monthly m),
    'recent',        COALESCE((SELECT rows FROM recent),'[]'::jsonb),
    'settlement_timeline', COALESCE((SELECT rows FROM settlement_timeline),'[]'::jsonb),
    'allocation_history',  COALESCE((SELECT rows FROM allocation_history),'[]'::jsonb),
    'rows_included', (SELECT COUNT(*) FROM events),
    'rows_excluded', (SELECT n FROM excluded_count)
  ) INTO v_result;
  RETURN v_result;
END
$fn$;

COMMENT ON FUNCTION public.report_customer_detail(uuid,text,date,date) IS
  'Reporting only. Full analytics for one customer. phase6.slice3';

CREATE OR REPLACE FUNCTION public.report_supplier_list(
  _quality_mode text DEFAULT 'exclude_invalid',
  _from date DEFAULT NULL, _to date DEFAULT NULL,
  _search text DEFAULT NULL, _sort text DEFAULT 'volume_desc',
  _limit int DEFAULT 50, _offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE
  v_from date := COALESCE(_from, DATE '1900-01-01');
  v_to   date := COALESCE(_to,   DATE '2999-12-31');
  v_mode text := COALESCE(_quality_mode,'exclude_invalid');
  v_search text := NULLIF(btrim(COALESCE(_search,'')),'');
  v_limit int  := LEAST(GREATEST(COALESCE(_limit,50),1),200);
  v_offset int := GREATEST(COALESCE(_offset,0),0);
  v_total int; v_included int; v_excluded int; v_rows jsonb;
BEGIN
  IF v_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN v_mode := 'exclude_invalid'; END IF;

  WITH base_events AS (
    SELECT ev.* FROM public.v_profit_events_ext ev
    WHERE ev.supplier_id IS NOT NULL
      AND ev.event_date BETWEEN v_from AND v_to
      AND ( v_mode='all'
         OR (v_mode='exclude_invalid'    AND COALESCE(ev.classification,'valid')<>'invalid')
         OR (v_mode='exclude_suspicious' AND COALESCE(ev.classification,'valid')= 'valid') )
  ),
  per_supplier AS (
    SELECT supplier_id,
      COUNT(*) AS delivered_count,
      SUM(amount_aed) AS delivered_profit_aed,
      SUM(GREATEST(amount_aed,0)) AS delivered_volume_aed,
      AVG(amount_aed) AS avg_profit_aed
    FROM base_events GROUP BY supplier_id
  ),
  life_source AS (
    SELECT * FROM public.v_remittance_lifecycle
    WHERE supplier_id IS NOT NULL AND created_at::date BETWEEN v_from AND v_to
  ),
  rem_life AS (
    SELECT supplier_id,
      COUNT(*) AS rem_total,
      SUM(CASE WHEN workflow_state='closed'    THEN 1 ELSE 0 END) AS rem_closed,
      SUM(CASE WHEN workflow_state='cancelled' THEN 1 ELSE 0 END) AS rem_cancelled,
      SUM(CASE WHEN workflow_state NOT IN ('closed','cancelled') THEN 1 ELSE 0 END) AS rem_open,
      AVG(CASE WHEN t_settle IS NOT NULL THEN EXTRACT(EPOCH FROM (t_settle-created_at)) END) AS avg_delivery_seconds,
      SUM(CASE WHEN t_settle IS NOT NULL AND (t_settle-created_at)>interval '48 hours' THEN 1 ELSE 0 END) AS late_deliveries
    FROM life_source GROUP BY supplier_id
  ),
  rem_life_median AS (
    SELECT supplier_id,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (t_settle-created_at))) AS median_delivery_seconds
    FROM life_source WHERE t_settle IS NOT NULL GROUP BY supplier_id
  ),
  alloc_stats AS (
    SELECT r.fx_supplier_customer_id AS supplier_id,
      COUNT(*) AS alloc_total,
      SUM(CASE WHEN ra.entry_kind='reverse' THEN 1 ELSE 0 END) AS alloc_reversed,
      AVG(CASE WHEN ra.created_at>=r.created_at THEN EXTRACT(EPOCH FROM (ra.created_at-r.created_at)) END) AS alloc_delay_seconds
    FROM public.remittance_allocations ra
    JOIN public.remittances r ON r.id=ra.remittance_id
    WHERE r.fx_supplier_customer_id IS NOT NULL
    GROUP BY r.fx_supplier_customer_id
  ),
  sup AS (
    SELECT c.id AS supplier_id, c.name AS supplier_name, c.phone,
      COALESCE(ps.delivered_count,0) AS delivered_count,
      COALESCE(ps.delivered_profit_aed,0) AS delivered_profit_aed,
      COALESCE(ps.delivered_volume_aed,0) AS delivered_volume_aed,
      ps.avg_profit_aed,
      COALESCE(rl.rem_total,0) AS rem_total,
      COALESCE(rl.rem_closed,0) AS rem_closed,
      COALESCE(rl.rem_cancelled,0) AS rem_cancelled,
      COALESCE(rl.rem_open,0) AS rem_open,
      rl.avg_delivery_seconds, rlm.median_delivery_seconds,
      COALESCE(rl.late_deliveries,0) AS late_deliveries,
      COALESCE(als.alloc_total,0) AS alloc_total,
      COALESCE(als.alloc_reversed,0) AS alloc_reversed,
      als.alloc_delay_seconds,
      (SELECT AVG(transferred_amount) FROM public.remittances rr WHERE rr.fx_supplier_customer_id=c.id) AS avg_remittance_amount,
      (SELECT jsonb_agg(DISTINCT r2.transfer_currency)
         FROM public.remittances r2 WHERE r2.fx_supplier_customer_id=c.id) AS currencies_served,
      (SELECT jsonb_agg(row_to_json(x)) FROM (
          SELECT r3.customer_id, cc.name AS customer_name, COUNT(*) AS n
          FROM public.remittances r3
          LEFT JOIN public.customers cc ON cc.id=r3.customer_id
          WHERE r3.fx_supplier_customer_id=c.id AND r3.customer_id IS NOT NULL
          GROUP BY r3.customer_id, cc.name ORDER BY COUNT(*) DESC LIMIT 5
        ) x) AS top_customers
    FROM public.customers c
    LEFT JOIN per_supplier ps  ON ps.supplier_id=c.id
    LEFT JOIN rem_life     rl  ON rl.supplier_id=c.id
    LEFT JOIN rem_life_median rlm ON rlm.supplier_id=c.id
    LEFT JOIN alloc_stats  als ON als.supplier_id=c.id
    WHERE c.deleted_at IS NULL
      AND ( ps.supplier_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.remittances rr WHERE rr.fx_supplier_customer_id=c.id) )
      AND (v_search IS NULL OR c.name ILIKE '%'||v_search||'%')
  ),
  scored AS (
    SELECT s.*,
      CASE WHEN s.rem_total=0   THEN NULL ELSE s.rem_cancelled::numeric/s.rem_total::numeric END           AS cancel_rate,
      CASE WHEN s.alloc_total=0 THEN NULL ELSE 1 - (s.alloc_reversed::numeric/s.alloc_total::numeric) END  AS alloc_success_rate,
      CASE WHEN COALESCE(s.rem_closed,0)=0 THEN NULL
           ELSE 1 - (s.late_deliveries::numeric/GREATEST(s.rem_closed,1)::numeric) END                      AS on_time_rate,
      LEAST(1.0, s.rem_total::numeric/5.0) AS sample_ratio
    FROM sup s
  ),
  final AS (
    SELECT sc.*,
      ROUND(
        40 * COALESCE(sc.on_time_rate,0.5)
      + 30 * COALESCE(sc.alloc_success_rate,1)
      + 20 * COALESCE(1 - sc.cancel_rate,1)
      + 10 * sc.sample_ratio
      )::int AS reliability_score
    FROM scored sc
  )
  SELECT
    COUNT(*),
    (SELECT COUNT(*) FROM base_events),
    (SELECT COUNT(*) FROM public.v_profit_events_ext ev
       WHERE ev.supplier_id IS NOT NULL AND ev.event_date BETWEEN v_from AND v_to)
      - (SELECT COUNT(*) FROM base_events),
    jsonb_agg(row_to_json(x)) FILTER (WHERE x.rn BETWEEN v_offset+1 AND v_offset+v_limit)
  INTO v_total, v_included, v_excluded, v_rows
  FROM (
    SELECT f.*,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN _sort='volume_desc'      THEN -f.delivered_volume_aed END NULLS LAST,
          CASE WHEN _sort='profit_desc'      THEN -f.delivered_profit_aed END NULLS LAST,
          CASE WHEN _sort='reliability_desc' THEN -f.reliability_score::numeric END NULLS LAST,
          CASE WHEN _sort='reliability_asc'  THEN  f.reliability_score::numeric END NULLS LAST,
          CASE WHEN _sort='delivery_asc'     THEN  f.avg_delivery_seconds END NULLS LAST,
          f.supplier_name ASC
      ) AS rn
    FROM final f
  ) x;

  RETURN jsonb_build_object(
    'meta',          public._report_meta('supplier_list','1.0.0'),
    'quality_mode',  v_mode, 'date_from', v_from, 'date_to', v_to,
    'rows_included', COALESCE(v_included,0),
    'rows_excluded', COALESCE(v_excluded,0),
    'total',         COALESCE(v_total,0),
    'limit',         v_limit, 'offset', v_offset,
    'sort',          _sort, 'search', v_search,
    'rows',          COALESCE(v_rows,'[]'::jsonb)
  );
END
$fn$;

COMMENT ON FUNCTION public.report_supplier_list(text,date,date,text,text,int,int) IS
  'Reporting only. Aggregated supplier analytics list. phase6.slice3';

CREATE OR REPLACE FUNCTION public.report_supplier_detail(
  _supplier_id uuid, _quality_mode text DEFAULT 'exclude_invalid',
  _from date DEFAULT NULL, _to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE
  v_from date := COALESCE(_from, DATE '1900-01-01');
  v_to   date := COALESCE(_to,   DATE '2999-12-31');
  v_mode text := COALESCE(_quality_mode,'exclude_invalid');
  v_result jsonb;
BEGIN
  IF v_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN v_mode := 'exclude_invalid'; END IF;

  WITH sup AS (
    SELECT c.id, c.name, c.phone, c.notes, c.created_at
    FROM public.customers c WHERE c.id=_supplier_id
  ),
  events AS (
    SELECT ev.* FROM public.v_profit_events_ext ev
    WHERE ev.supplier_id=_supplier_id
      AND ev.event_date BETWEEN v_from AND v_to
      AND ( v_mode='all'
         OR (v_mode='exclude_invalid'    AND COALESCE(ev.classification,'valid')<>'invalid')
         OR (v_mode='exclude_suspicious' AND COALESCE(ev.classification,'valid')= 'valid') )
  ),
  monthly AS (
    SELECT to_char(date_trunc('month',event_at),'YYYY-MM') AS bucket,
           SUM(amount_aed) AS profit_aed,
           SUM(GREATEST(amount_aed,0)) AS volume_aed,
           COUNT(*) AS events
    FROM events GROUP BY 1 ORDER BY 1
  ),
  outstanding AS (
    SELECT jsonb_agg(row_to_json(x)) AS rows FROM (
      SELECT r.id, r.doc_no, r.entry_date, r.transferred_amount, r.transfer_currency,
             r.workflow_state, r.status
      FROM public.remittances r
      WHERE r.fx_supplier_customer_id=_supplier_id
        AND r.workflow_state NOT IN ('closed','cancelled')
      ORDER BY r.created_at DESC LIMIT 50
    ) x
  ),
  completed AS (
    SELECT jsonb_agg(row_to_json(x)) AS rows FROM (
      SELECT r.id, r.doc_no, r.entry_date, r.transferred_amount, r.transfer_currency,
             r.total_profit_aed, l.settle_seconds, l.close_seconds
      FROM public.remittances r
      LEFT JOIN public.v_remittance_lifecycle l ON l.remittance_id=r.id
      WHERE r.fx_supplier_customer_id=_supplier_id AND r.workflow_state='closed'
      ORDER BY r.created_at DESC LIMIT 50
    ) x
  ),
  totals AS (
    SELECT COUNT(*) AS event_count,
           SUM(amount_aed) AS profit_total_aed,
           SUM(GREATEST(amount_aed,0)) AS volume_total_aed,
           MAX(amount_aed) AS largest_profit_aed,
           MIN(amount_aed) AS largest_loss_aed,
           AVG(amount_aed) AS avg_profit_aed
    FROM events
  )
  SELECT jsonb_build_object(
    'meta',          public._report_meta('supplier_detail','1.0.0'),
    'quality_mode',  v_mode, 'date_from', v_from, 'date_to', v_to,
    'supplier',      (SELECT row_to_json(sup) FROM sup),
    'totals',        (SELECT row_to_json(totals) FROM totals),
    'monthly',       (SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.bucket),'[]'::jsonb) FROM monthly m),
    'outstanding',   COALESCE((SELECT rows FROM outstanding),'[]'::jsonb),
    'completed',     COALESCE((SELECT rows FROM completed),'[]'::jsonb),
    'rows_included', (SELECT COUNT(*) FROM events),
    'rows_excluded',
      (SELECT COUNT(*) FROM public.v_profit_events_ext ev
         WHERE ev.supplier_id=_supplier_id AND ev.event_date BETWEEN v_from AND v_to)
      - (SELECT COUNT(*) FROM events)
  ) INTO v_result;
  RETURN v_result;
END
$fn$;

COMMENT ON FUNCTION public.report_supplier_detail(uuid,text,date,date) IS
  'Reporting only. Full analytics for one supplier. phase6.slice3';
