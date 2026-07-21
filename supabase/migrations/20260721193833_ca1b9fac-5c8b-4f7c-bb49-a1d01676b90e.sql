
-- ============================================================================
-- Phase 6 Slice 4 — Inventory Analytics (reporting only)
-- Version 1.0.0 · generated_by_version = phase6.slice4
-- READ-ONLY. No changes to workflow / posting / settlement / allocation /
-- close / reconciliation / feature flags. No financial-logic schema.
-- ============================================================================

-- 1. Enriched inventory view -------------------------------------------------
CREATE OR REPLACE VIEW public.v_inventory_lots_ext AS
SELECT
  l.id                                       AS lot_id,
  l.lot_code,
  l.currency,
  l.account_id,
  a.name                                     AS account_name,
  a.owner                                    AS account_owner,
  a.currency                                 AS account_currency,
  l.source_ref_type,
  l.source_ref_id,
  l.source_description,
  l.entry_date,
  l.created_at,
  l.created_by,
  l.status,
  l.notes,
  l.cost_basis_rate,
  l.cost_basis_currency,
  l.cost_basis_status,
  l.original_amount,
  l.remaining_amount,
  (l.original_amount - l.remaining_amount)   AS consumed_amount,
  (l.original_amount * l.cost_basis_rate)    AS original_cost,
  (l.remaining_amount * l.cost_basis_rate)   AS remaining_cost,
  ((l.original_amount - l.remaining_amount) * l.cost_basis_rate) AS consumed_cost,
  (EXTRACT(EPOCH FROM (now() - l.created_at)) / 86400.0)::numeric AS age_days,
  CASE
    WHEN (now()::date - l.entry_date) <=   7 THEN '0-7'
    WHEN (now()::date - l.entry_date) <=  30 THEN '8-30'
    WHEN (now()::date - l.entry_date) <=  90 THEN '31-90'
    WHEN (now()::date - l.entry_date) <= 180 THEN '91-180'
    WHEN (now()::date - l.entry_date) <= 365 THEN '181-365'
    ELSE '365+'
  END                                        AS age_bucket
FROM public.inventory_lots l
LEFT JOIN public.accounts a ON a.id = l.account_id;

COMMENT ON VIEW public.v_inventory_lots_ext
  IS 'Reporting only (phase6.slice4). Enriched FIFO lot rows for the Inventory dashboard.';

GRANT SELECT ON public.v_inventory_lots_ext TO authenticated;
GRANT SELECT ON public.v_inventory_lots_ext TO service_role;

-- 2. Overview RPC ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_inventory_overview(
  _quality_mode    text DEFAULT 'exclude_invalid',
  _from            date DEFAULT NULL,
  _to              date DEFAULT NULL,
  _currency        text DEFAULT NULL,
  _account_id      uuid DEFAULT NULL,
  _status          text DEFAULT NULL,
  _source_ref_type text DEFAULT NULL,
  _operator_id     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from date := COALESCE(_from, DATE '1900-01-01');
  v_to   date := COALESCE(_to,   DATE '2999-12-31');
  v_mode text := COALESCE(_quality_mode,'exclude_invalid');
  v_included bigint; v_excluded bigint; v_total_lots bigint;
  v_kpis jsonb; v_aging jsonb; v_currency jsonb; v_account jsonb; v_market jsonb;
BEGIN
  IF v_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN
    v_mode := 'exclude_invalid';
  END IF;

  -- Base filter CTE
  CREATE TEMP TABLE _lots ON COMMIT DROP AS
  SELECT l.*
  FROM public.v_inventory_lots_ext l
  WHERE l.entry_date BETWEEN v_from AND v_to
    AND (_currency        IS NULL OR l.currency        = _currency)
    AND (_account_id      IS NULL OR l.account_id      = _account_id)
    AND (_status          IS NULL OR l.status::text    = _status)
    AND (_source_ref_type IS NULL OR l.source_ref_type = _source_ref_type)
    AND (_operator_id     IS NULL OR l.created_by      = _operator_id);

  SELECT COUNT(*) INTO v_included FROM _lots;
  SELECT COUNT(*) INTO v_total_lots FROM public.v_inventory_lots_ext;
  v_excluded := v_total_lots - v_included;

  -- Latest market snapshot per currency
  WITH mkt AS (
    SELECT currency, market_mid, snapshot_at, snapshot_source
    FROM public.v_market_rate_latest
  ),
  aed AS (SELECT market_mid AS aed_mid FROM mkt WHERE currency='AED'),
  by_ccy AS (
    SELECT
      l.currency,
      SUM(l.original_amount)  AS orig_amt,
      SUM(l.remaining_amount) AS remain_amt,
      SUM(l.consumed_amount)  AS consumed_amt,
      SUM(l.original_cost)    AS orig_cost,
      SUM(l.remaining_cost)   AS remain_cost,
      SUM(l.consumed_cost)    AS consumed_cost,
      SUM(l.original_amount * l.cost_basis_rate) /
        NULLIF(SUM(l.original_amount),0) AS wap_cost_rate,
      MIN(l.entry_date)       AS oldest_entry,
      MAX(l.entry_date)       AS newest_entry,
      COUNT(*)                AS lot_count,
      COUNT(*) FILTER (WHERE l.status='available'::inventory_lot_status) AS available_lots,
      COUNT(*) FILTER (WHERE l.status='partial'::inventory_lot_status)   AS partial_lots,
      COUNT(*) FILTER (WHERE l.status='depleted'::inventory_lot_status)  AS depleted_lots,
      AVG(l.age_days)         AS avg_age_days,
      MIN(l.cost_basis_currency) AS cost_basis_currency
    FROM _lots l
    GROUP BY l.currency
  )
  SELECT
    -- kpis
    jsonb_build_object(
      'total_lots',            COALESCE(SUM(b.lot_count),0),
      'available_lots',        COALESCE(SUM(b.available_lots),0),
      'partial_lots',          COALESCE(SUM(b.partial_lots),0),
      'depleted_lots',         COALESCE(SUM(b.depleted_lots),0),
      'remaining_cost_aed',    COALESCE(SUM(
        CASE
          WHEN b.cost_basis_currency='AED' THEN b.remain_cost
          WHEN b.cost_basis_currency='IRR' AND (SELECT aed_mid FROM aed) IS NOT NULL
            THEN b.remain_cost / (SELECT aed_mid FROM aed)
          ELSE NULL
        END),0),
      'consumed_cost_aed',     COALESCE(SUM(
        CASE
          WHEN b.cost_basis_currency='AED' THEN b.consumed_cost
          WHEN b.cost_basis_currency='IRR' AND (SELECT aed_mid FROM aed) IS NOT NULL
            THEN b.consumed_cost / (SELECT aed_mid FROM aed)
          ELSE NULL
        END),0),
      'original_cost_aed',     COALESCE(SUM(
        CASE
          WHEN b.cost_basis_currency='AED' THEN b.orig_cost
          WHEN b.cost_basis_currency='IRR' AND (SELECT aed_mid FROM aed) IS NOT NULL
            THEN b.orig_cost / (SELECT aed_mid FROM aed)
          ELSE NULL
        END),0),
      'oldest_entry_date',     MIN(b.oldest_entry),
      'newest_entry_date',     MAX(b.newest_entry),
      'avg_age_days',          AVG(b.avg_age_days),
      'utilization_pct',       CASE WHEN SUM(b.orig_amt) IS NULL OR SUM(b.orig_amt)=0
                                    THEN NULL
                                    ELSE ROUND(100.0*SUM(b.consumed_amt)/NULLIF(SUM(b.orig_amt),0),2)
                               END,
      -- turnover = consumed_cost_aed / average_remaining_cost_aed (approx)
      'turnover_ratio',        CASE WHEN SUM(b.remain_cost)+SUM(b.consumed_cost) IS NULL THEN NULL
                                    WHEN (SUM(b.remain_cost)+SUM(b.consumed_cost)) = 0 THEN NULL
                                    ELSE ROUND( SUM(b.consumed_cost)::numeric /
                                                NULLIF( (SUM(b.remain_cost)+SUM(b.consumed_cost))/2 ,0), 4)
                               END
    ),
    -- by_currency
    jsonb_agg(jsonb_build_object(
      'currency',            b.currency,
      'cost_basis_currency', b.cost_basis_currency,
      'original_amount',     b.orig_amt,
      'remaining_amount',    b.remain_amt,
      'consumed_amount',     b.consumed_amt,
      'original_cost',       b.orig_cost,
      'remaining_cost',      b.remain_cost,
      'consumed_cost',       b.consumed_cost,
      'wap_cost_rate',       b.wap_cost_rate,
      'lot_count',           b.lot_count,
      'available_lots',      b.available_lots,
      'partial_lots',        b.partial_lots,
      'depleted_lots',       b.depleted_lots,
      'oldest_entry_date',   b.oldest_entry,
      'newest_entry_date',   b.newest_entry,
      'avg_age_days',        b.avg_age_days,
      'utilization_pct',
        CASE WHEN b.orig_amt IS NULL OR b.orig_amt=0 THEN NULL
             ELSE ROUND(100.0*b.consumed_amt/NULLIF(b.orig_amt,0),2) END
    ) ORDER BY b.currency)
  INTO v_kpis, v_currency
  FROM by_ccy b;

  -- Aging
  SELECT jsonb_agg(jsonb_build_object(
    'bucket',           x.age_bucket,
    'lot_count',        x.n,
    'remaining_amount', x.remain,
    'remaining_cost',   x.rem_cost,
    'original_cost',    x.orig_cost,
    'pct_of_remaining',
      CASE WHEN SUM(x.remain) OVER () = 0 THEN NULL
           ELSE ROUND(100.0*x.remain/NULLIF(SUM(x.remain) OVER (),0),2) END
  ) ORDER BY
      CASE x.age_bucket
        WHEN '0-7' THEN 1 WHEN '8-30' THEN 2 WHEN '31-90' THEN 3
        WHEN '91-180' THEN 4 WHEN '181-365' THEN 5 ELSE 6 END)
  INTO v_aging
  FROM (
    SELECT age_bucket,
      COUNT(*) AS n,
      SUM(remaining_amount) AS remain,
      SUM(remaining_cost) AS rem_cost,
      SUM(original_cost) AS orig_cost
    FROM _lots
    GROUP BY age_bucket
  ) x;

  -- By account
  SELECT jsonb_agg(row_to_json(x) ORDER BY x.remaining_cost DESC NULLS LAST)
  INTO v_account
  FROM (
    SELECT
      l.account_id, l.account_name, l.account_owner,
      COUNT(*)                          AS lot_count,
      SUM(l.original_amount)            AS original_amount,
      SUM(l.remaining_amount)           AS remaining_amount,
      SUM(l.consumed_amount)            AS consumed_amount,
      SUM(l.original_cost)              AS original_cost,
      SUM(l.remaining_cost)             AS remaining_cost,
      SUM(l.consumed_cost)              AS consumed_cost,
      jsonb_agg(DISTINCT l.currency)    AS currencies,
      MAX(l.original_amount)            AS largest_lot_amount,
      MIN(l.entry_date)                 AS oldest_entry,
      MAX(l.entry_date)                 AS newest_entry,
      CASE WHEN SUM(l.original_amount) IS NULL OR SUM(l.original_amount)=0 THEN NULL
           ELSE ROUND(100.0*SUM(l.consumed_amount)/NULLIF(SUM(l.original_amount),0),2)
      END                               AS utilization_pct
    FROM _lots l
    GROUP BY l.account_id, l.account_name, l.account_owner
  ) x;

  -- Market comparison (persisted snapshot only)
  SELECT jsonb_agg(jsonb_build_object(
    'currency',                 b.currency,
    'cost_basis_currency',      b.cost_basis_currency,
    'wap_cost_rate',            b.wap_cost_rate,
    'market_mid',               m.market_mid,
    'market_snapshot_at',       m.snapshot_at,
    'market_snapshot_source',   m.snapshot_source,
    'remaining_amount',         b.remain_amt,
    'remaining_cost',           b.remain_cost,
    'estimated_market_value_aed',
      CASE
        WHEN b.currency='AED' THEN b.remain_amt
        WHEN m.market_mid IS NULL OR (SELECT aed_mid FROM aed) IS NULL THEN NULL
        ELSE b.remain_amt * m.market_mid / (SELECT aed_mid FROM aed)
      END,
    'remaining_cost_aed',
      CASE
        WHEN b.cost_basis_currency='AED' THEN b.remain_cost
        WHEN b.cost_basis_currency='IRR' AND (SELECT aed_mid FROM aed) IS NOT NULL
          THEN b.remain_cost / (SELECT aed_mid FROM aed)
        ELSE NULL
      END,
    'unrealized_pnl_aed',
      CASE
        WHEN b.currency='AED' THEN 0
        WHEN m.market_mid IS NULL OR (SELECT aed_mid FROM aed) IS NULL THEN NULL
        WHEN b.cost_basis_currency='AED' THEN
          (b.remain_amt * m.market_mid / (SELECT aed_mid FROM aed)) - b.remain_cost
        WHEN b.cost_basis_currency='IRR' THEN
          (b.remain_amt * m.market_mid / (SELECT aed_mid FROM aed))
          - (b.remain_cost / (SELECT aed_mid FROM aed))
        ELSE NULL
      END
  ) ORDER BY b.currency)
  INTO v_market
  FROM (
    SELECT currency, cost_basis_currency, wap_cost_rate,
           SUM(remaining_amount) AS remain_amt,
           SUM(remaining_cost)   AS remain_cost
    FROM _lots
    GROUP BY currency, cost_basis_currency, wap_cost_rate
  ) b
  LEFT JOIN public.v_market_rate_latest m ON m.currency = b.currency, aed;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'report_key','inventory_overview','report_version','1.0.0',
      'generated_at', now(), 'data_cutoff', now(),
      'generated_by_version','phase6.slice4'),
    'quality_mode',  v_mode,
    'date_from',     v_from,
    'date_to',       v_to,
    'rows_included', v_included,
    'rows_excluded', v_excluded,
    'kpis',          COALESCE(v_kpis, '{}'::jsonb),
    'aging',         COALESCE(v_aging, '[]'::jsonb),
    'by_currency',   COALESCE(v_currency, '[]'::jsonb),
    'by_account',    COALESCE(v_account, '[]'::jsonb),
    'market',        COALESCE(v_market, '[]'::jsonb)
  );
END $$;

COMMENT ON FUNCTION public.report_inventory_overview(text,date,date,text,uuid,text,text,uuid)
  IS 'Reporting only. Inventory KPIs + aging + by-currency + by-account + market comparison. phase6.slice4 v1.0.0';

REVOKE ALL ON FUNCTION public.report_inventory_overview(text,date,date,text,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_inventory_overview(text,date,date,text,uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_inventory_overview(text,date,date,text,uuid,text,text,uuid) TO service_role;

-- 3. Lot list RPC ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_inventory_lots(
  _quality_mode    text DEFAULT 'exclude_invalid',
  _from            date DEFAULT NULL,
  _to              date DEFAULT NULL,
  _currency        text DEFAULT NULL,
  _account_id      uuid DEFAULT NULL,
  _status          text DEFAULT NULL,
  _age_bucket      text DEFAULT NULL,
  _source_ref_type text DEFAULT NULL,
  _operator_id     uuid DEFAULT NULL,
  _search          text DEFAULT NULL,
  _sort            text DEFAULT 'entry_desc',
  _limit           int  DEFAULT 50,
  _offset          int  DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from date := COALESCE(_from, DATE '1900-01-01');
  v_to   date := COALESCE(_to,   DATE '2999-12-31');
  v_mode text := COALESCE(_quality_mode,'exclude_invalid');
  v_search text := NULLIF(btrim(COALESCE(_search,'')),'');
  v_limit int := LEAST(GREATEST(COALESCE(_limit,50),1),500);
  v_offset int := GREATEST(COALESCE(_offset,0),0);
  v_total int; v_included int; v_excluded int; v_rows jsonb;
BEGIN
  IF v_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN v_mode := 'exclude_invalid'; END IF;

  WITH base AS (
    SELECT l.*,
           op.label AS operator_label,
           op.display_name AS operator_name
    FROM public.v_inventory_lots_ext l
    LEFT JOIN public.v_operator_labels op ON op.actor_id = l.created_by
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND (_currency        IS NULL OR l.currency        = _currency)
      AND (_account_id      IS NULL OR l.account_id      = _account_id)
      AND (_status          IS NULL OR l.status::text    = _status)
      AND (_age_bucket      IS NULL OR l.age_bucket      = _age_bucket)
      AND (_source_ref_type IS NULL OR l.source_ref_type = _source_ref_type)
      AND (_operator_id     IS NULL OR l.created_by      = _operator_id)
      AND (v_search IS NULL
           OR l.lot_code ILIKE '%'||v_search||'%'
           OR COALESCE(l.source_description,'') ILIKE '%'||v_search||'%'
           OR COALESCE(l.account_name,'') ILIKE '%'||v_search||'%')
  )
  SELECT
    COUNT(*),
    COUNT(*),
    0,
    jsonb_agg(row_to_json(x)) FILTER (WHERE x.rn BETWEEN v_offset+1 AND v_offset+v_limit)
  INTO v_total, v_included, v_excluded, v_rows
  FROM (
    SELECT b.*,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN _sort='entry_desc'     THEN b.entry_date END DESC NULLS LAST,
          CASE WHEN _sort='entry_asc'      THEN b.entry_date END ASC  NULLS LAST,
          CASE WHEN _sort='remaining_desc' THEN b.remaining_amount END DESC NULLS LAST,
          CASE WHEN _sort='remaining_asc'  THEN b.remaining_amount END ASC  NULLS LAST,
          CASE WHEN _sort='age_desc'       THEN b.age_days END DESC NULLS LAST,
          CASE WHEN _sort='age_asc'        THEN b.age_days END ASC  NULLS LAST,
          CASE WHEN _sort='cost_desc'      THEN b.remaining_cost END DESC NULLS LAST,
          b.entry_date DESC
      ) AS rn
    FROM base b
  ) x;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'report_key','inventory_lots','report_version','1.0.0',
      'generated_at', now(), 'data_cutoff', now(),
      'generated_by_version','phase6.slice4'),
    'quality_mode', v_mode,
    'date_from', v_from, 'date_to', v_to,
    'total', COALESCE(v_total,0),
    'rows_included', COALESCE(v_included,0),
    'rows_excluded', COALESCE(v_excluded,0),
    'limit', v_limit, 'offset', v_offset,
    'sort', _sort, 'search', v_search,
    'rows', COALESCE(v_rows,'[]'::jsonb)
  );
END $$;

COMMENT ON FUNCTION public.report_inventory_lots(text,date,date,text,uuid,text,text,text,uuid,text,text,int,int)
  IS 'Reporting only. Paginated FIFO lot list. phase6.slice4 v1.0.0';

REVOKE ALL ON FUNCTION public.report_inventory_lots(text,date,date,text,uuid,text,text,text,uuid,text,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_inventory_lots(text,date,date,text,uuid,text,text,text,uuid,text,text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_inventory_lots(text,date,date,text,uuid,text,text,text,uuid,text,text,int,int) TO service_role;

-- 4. Lot detail RPC ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_inventory_lot_detail(_lot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lot jsonb;
  v_consumption jsonb;
  v_allocations jsonb;
  v_related_sells jsonb;
  v_related_rems jsonb;
BEGIN
  SELECT to_jsonb(x) INTO v_lot
  FROM (
    SELECT l.*, op.label AS operator_label, op.display_name AS operator_name
    FROM public.v_inventory_lots_ext l
    LEFT JOIN public.v_operator_labels op ON op.actor_id = l.created_by
    WHERE l.lot_id = _lot_id
  ) x;

  IF v_lot IS NULL THEN
    RETURN jsonb_build_object(
      'meta', jsonb_build_object('report_key','inventory_lot_detail',
        'report_version','1.0.0','generated_at',now(),'data_cutoff',now(),
        'generated_by_version','phase6.slice4'),
      'lot', NULL, 'consumption', '[]'::jsonb,
      'allocations','[]'::jsonb,'related_sells','[]'::jsonb,'related_remittances','[]'::jsonb
    );
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'consumption_id', c.id,
    'sell_ref_type',  c.sell_ref_type,
    'sell_ref_id',    c.sell_ref_id,
    'currency',       c.currency,
    'amount',         c.amount,
    'cost_rate',      c.cost_rate,
    'cost_amount',    c.cost_amount,
    'entry_date',     c.entry_date,
    'created_at',     c.created_at
  ) ORDER BY c.created_at)
  INTO v_consumption
  FROM public.lot_consumptions c
  WHERE c.lot_id = _lot_id;

  SELECT jsonb_agg(jsonb_build_object(
    'allocation_id',   ra.id,
    'remittance_id',   ra.remittance_id,
    'currency',        ra.currency,
    'allocated_amount',ra.allocated_amount,
    'status',          ra.status,
    'entry_kind',      ra.entry_kind,
    'created_at',      ra.created_at
  ) ORDER BY ra.created_at)
  INTO v_allocations
  FROM public.remittance_allocations ra
  WHERE ra.lot_id = _lot_id;

  SELECT jsonb_agg(jsonb_build_object(
    'sell_id', s.id, 'doc_no', s.doc_no, 'entry_date', s.entry_date,
    'currency', s.currency_sold, 'amount', s.amount_sold,
    'net_profit_aed', s.net_profit_aed
  ) ORDER BY s.entry_date DESC)
  INTO v_related_sells
  FROM public.sell_transactions s
  WHERE s.id IN (
    SELECT DISTINCT c.sell_ref_id FROM public.lot_consumptions c
    WHERE c.lot_id = _lot_id AND c.sell_ref_type='sell'
  );

  SELECT jsonb_agg(jsonb_build_object(
    'remittance_id', r.id, 'doc_no', r.doc_no,
    'entry_date', r.entry_date, 'transfer_currency', r.transfer_currency,
    'transferred_amount', r.transferred_amount, 'workflow_state', r.workflow_state
  ) ORDER BY r.entry_date DESC)
  INTO v_related_rems
  FROM public.remittances r
  WHERE r.id IN (
    SELECT DISTINCT remittance_id FROM public.remittance_allocations WHERE lot_id = _lot_id
  );

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('report_key','inventory_lot_detail',
      'report_version','1.0.0','generated_at',now(),'data_cutoff',now(),
      'generated_by_version','phase6.slice4'),
    'lot',                 v_lot,
    'consumption',         COALESCE(v_consumption,'[]'::jsonb),
    'allocations',         COALESCE(v_allocations,'[]'::jsonb),
    'related_sells',       COALESCE(v_related_sells,'[]'::jsonb),
    'related_remittances', COALESCE(v_related_rems,'[]'::jsonb)
  );
END $$;

COMMENT ON FUNCTION public.report_inventory_lot_detail(uuid)
  IS 'Reporting only. Full drill-down for a single FIFO lot. phase6.slice4 v1.0.0';

REVOKE ALL ON FUNCTION public.report_inventory_lot_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_inventory_lot_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_inventory_lot_detail(uuid) TO service_role;

-- 5. Timeline RPC ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_inventory_timeline(
  _granularity text DEFAULT 'day',
  _from        date DEFAULT NULL,
  _to          date DEFAULT NULL,
  _currency    text DEFAULT NULL,
  _account_id  uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from date := COALESCE(_from, (now() AT TIME ZONE 'UTC')::date - 90);
  v_to   date := COALESCE(_to,   (now() AT TIME ZONE 'UTC')::date);
  v_gran text := COALESCE(_granularity,'day');
  v_series jsonb;
BEGIN
  IF v_gran NOT IN ('day','week','month','year') THEN v_gran := 'day'; END IF;

  WITH bounds AS (SELECT v_from::timestamp AS a, v_to::timestamp AS b),
  buckets AS (
    SELECT g::date AS bucket
    FROM bounds, generate_series(date_trunc(v_gran,a), date_trunc(v_gran,b), ('1 '||v_gran)::interval) g
  ),
  buys AS (
    SELECT date_trunc(v_gran, l.entry_date)::date AS bucket,
           SUM(l.original_amount) AS added_amount,
           SUM(l.original_amount * l.cost_basis_rate) AS added_cost,
           COUNT(*) AS lots_added
    FROM public.inventory_lots l
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND (_currency   IS NULL OR l.currency=_currency)
      AND (_account_id IS NULL OR l.account_id=_account_id)
    GROUP BY 1
  ),
  cons AS (
    SELECT date_trunc(v_gran, c.entry_date)::date AS bucket,
           SUM(c.amount) AS consumed_amount,
           SUM(c.cost_amount) AS consumed_cost,
           COUNT(*) AS events
    FROM public.lot_consumptions c
    JOIN public.inventory_lots l ON l.id = c.lot_id
    WHERE c.entry_date BETWEEN v_from AND v_to
      AND (_currency   IS NULL OR c.currency=_currency)
      AND (_account_id IS NULL OR l.account_id=_account_id)
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'bucket_start',   b.bucket,
    'lots_added',     COALESCE(bu.lots_added,0),
    'added_amount',   COALESCE(bu.added_amount,0),
    'added_cost',     COALESCE(bu.added_cost,0),
    'consumption_events', COALESCE(co.events,0),
    'consumed_amount',    COALESCE(co.consumed_amount,0),
    'consumed_cost',      COALESCE(co.consumed_cost,0),
    'net_amount',
      COALESCE(bu.added_amount,0) - COALESCE(co.consumed_amount,0),
    'net_cost',
      COALESCE(bu.added_cost,0)   - COALESCE(co.consumed_cost,0)
  ) ORDER BY b.bucket)
  INTO v_series
  FROM buckets b
  LEFT JOIN buys bu ON bu.bucket=b.bucket
  LEFT JOIN cons co ON co.bucket=b.bucket;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('report_key','inventory_timeline',
      'report_version','1.0.0','generated_at',now(),'data_cutoff',now(),
      'generated_by_version','phase6.slice4'),
    'granularity', v_gran, 'date_from', v_from, 'date_to', v_to,
    'series', COALESCE(v_series,'[]'::jsonb)
  );
END $$;

COMMENT ON FUNCTION public.report_inventory_timeline(text,date,date,text,uuid)
  IS 'Reporting only. Inventory buys / consumption timeline. phase6.slice4 v1.0.0';

REVOKE ALL ON FUNCTION public.report_inventory_timeline(text,date,date,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_inventory_timeline(text,date,date,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_inventory_timeline(text,date,date,text,uuid) TO service_role;

-- 6. Consumption analytics RPC -----------------------------------------------
CREATE OR REPLACE FUNCTION public.report_inventory_consumption(
  _quality_mode text DEFAULT 'exclude_invalid',
  _from         date DEFAULT NULL,
  _to           date DEFAULT NULL,
  _currency     text DEFAULT NULL,
  _account_id   uuid DEFAULT NULL,
  _limit        int  DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from date := COALESCE(_from, DATE '1900-01-01');
  v_to   date := COALESCE(_to,   DATE '2999-12-31');
  v_mode text := COALESCE(_quality_mode,'exclude_invalid');
  v_limit int := LEAST(GREATEST(COALESCE(_limit,10),1),100);
  v_most jsonb; v_least jsonb; v_fastest jsonb; v_slowest jsonb;
  v_avg_delay numeric; v_velocity numeric; v_remaining_life numeric;
  v_total_consumed numeric; v_total_remaining numeric;
BEGIN
  IF v_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN v_mode := 'exclude_invalid'; END IF;

  WITH lot_stats AS (
    SELECT
      l.id AS lot_id, l.lot_code, l.currency, l.account_id,
      l.original_amount, l.remaining_amount,
      (l.original_amount - l.remaining_amount) AS consumed_amount,
      CASE WHEN l.original_amount=0 THEN NULL
           ELSE (l.original_amount - l.remaining_amount)/l.original_amount END AS consumed_pct,
      l.entry_date,
      MIN(c.created_at) AS first_consumption,
      MAX(c.created_at) AS last_consumption,
      EXTRACT(EPOCH FROM (MIN(c.created_at) - l.created_at)) AS delay_seconds,
      EXTRACT(EPOCH FROM (MAX(c.created_at) - MIN(c.created_at))) AS span_seconds,
      COUNT(c.id) AS consumption_events
    FROM public.inventory_lots l
    LEFT JOIN public.lot_consumptions c ON c.lot_id = l.id
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND (_currency   IS NULL OR l.currency=_currency)
      AND (_account_id IS NULL OR l.account_id=_account_id)
    GROUP BY l.id
  )
  SELECT
    (SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT * FROM lot_stats WHERE consumed_amount>0
      ORDER BY consumed_amount DESC LIMIT v_limit) x),
    (SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT * FROM lot_stats WHERE consumed_amount>0
      ORDER BY consumed_pct ASC LIMIT v_limit) x),
    (SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT * FROM lot_stats
      WHERE consumed_amount>0 AND delay_seconds IS NOT NULL
      ORDER BY delay_seconds ASC LIMIT v_limit) x),
    (SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT * FROM lot_stats
      WHERE consumed_amount>0 AND delay_seconds IS NOT NULL
      ORDER BY delay_seconds DESC LIMIT v_limit) x),
    AVG(delay_seconds) FILTER (WHERE consumed_amount>0),
    -- velocity: consumed_amount per day since first entry
    CASE WHEN MIN(entry_date) IS NULL THEN NULL
         WHEN GREATEST((now()::date - MIN(entry_date))::numeric, 1) = 0 THEN NULL
         ELSE SUM(consumed_amount)::numeric /
              NULLIF(GREATEST((now()::date - MIN(entry_date))::numeric, 1), 0)
    END,
    NULL::numeric,
    SUM(consumed_amount), SUM(remaining_amount)
  INTO v_most, v_least, v_fastest, v_slowest, v_avg_delay, v_velocity, v_remaining_life,
       v_total_consumed, v_total_remaining
  FROM lot_stats;

  IF v_velocity IS NOT NULL AND v_velocity > 0 THEN
    v_remaining_life := COALESCE(v_total_remaining,0) / v_velocity;
  END IF;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('report_key','inventory_consumption',
      'report_version','1.0.0','generated_at',now(),'data_cutoff',now(),
      'generated_by_version','phase6.slice4'),
    'quality_mode', v_mode, 'date_from', v_from, 'date_to', v_to,
    'total_consumed_amount',  COALESCE(v_total_consumed,0),
    'total_remaining_amount', COALESCE(v_total_remaining,0),
    'avg_consumption_delay_seconds', v_avg_delay,
    'consumption_velocity_per_day',  v_velocity,
    'remaining_lifetime_days',       v_remaining_life,
    'most_consumed_lots',   COALESCE(v_most,'[]'::jsonb),
    'least_consumed_lots',  COALESCE(v_least,'[]'::jsonb),
    'fastest_consumed_lots',COALESCE(v_fastest,'[]'::jsonb),
    'slowest_consumed_lots',COALESCE(v_slowest,'[]'::jsonb)
  );
END $$;

COMMENT ON FUNCTION public.report_inventory_consumption(text,date,date,text,uuid,int)
  IS 'Reporting only. Inventory consumption analytics (velocity, delay, rankings). phase6.slice4 v1.0.0';

REVOKE ALL ON FUNCTION public.report_inventory_consumption(text,date,date,text,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_inventory_consumption(text,date,date,text,uuid,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_inventory_consumption(text,date,date,text,uuid,int) TO service_role;
