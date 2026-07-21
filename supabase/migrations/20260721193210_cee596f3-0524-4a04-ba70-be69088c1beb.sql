CREATE OR REPLACE FUNCTION public.report_supplier_list(_quality_mode text DEFAULT 'exclude_invalid'::text, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _search text DEFAULT NULL::text, _sort text DEFAULT 'volume_desc'::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      SUM(CASE WHEN ra.entry_kind='reversal' THEN 1 ELSE 0 END) AS alloc_reversed,
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
    'meta',          public._report_meta('supplier_list','1.0.1'),
    'quality_mode',  v_mode, 'date_from', v_from, 'date_to', v_to,
    'rows_included', COALESCE(v_included,0),
    'rows_excluded', COALESCE(v_excluded,0),
    'total',         COALESCE(v_total,0),
    'limit',         v_limit, 'offset', v_offset,
    'sort',          _sort, 'search', v_search,
    'rows',          COALESCE(v_rows,'[]'::jsonb)
  );
END
$function$;

COMMENT ON FUNCTION public.report_supplier_list(text,date,date,text,text,integer,integer)
  IS 'Reporting only. Aggregated supplier analytics list. phase6.slice3 v1.0.1 (fix: entry_kind=reversal)';