
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
  v_aed_mid numeric;
BEGIN
  IF v_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN
    v_mode := 'exclude_invalid';
  END IF;

  SELECT market_mid INTO v_aed_mid FROM public.v_market_rate_latest WHERE currency='AED';

  WITH lots AS (
    SELECT
      l.*,
      CASE WHEN l.cost_basis_currency='AED' THEN l.original_cost
           WHEN l.cost_basis_currency='IRR' AND v_aed_mid IS NOT NULL THEN l.original_cost / v_aed_mid
           ELSE NULL END AS original_cost_aed,
      CASE WHEN l.cost_basis_currency='AED' THEN l.remaining_cost
           WHEN l.cost_basis_currency='IRR' AND v_aed_mid IS NOT NULL THEN l.remaining_cost / v_aed_mid
           ELSE NULL END AS remaining_cost_aed,
      CASE WHEN l.cost_basis_currency='AED' THEN l.consumed_cost
           WHEN l.cost_basis_currency='IRR' AND v_aed_mid IS NOT NULL THEN l.consumed_cost / v_aed_mid
           ELSE NULL END AS consumed_cost_aed
    FROM public.v_inventory_lots_ext l
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND (_currency        IS NULL OR l.currency        = _currency)
      AND (_account_id      IS NULL OR l.account_id      = _account_id)
      AND (_status          IS NULL OR l.status::text    = _status)
      AND (_source_ref_type IS NULL OR l.source_ref_type = _source_ref_type)
      AND (_operator_id     IS NULL OR l.created_by      = _operator_id)
  ),
  agg AS (
    SELECT
      COUNT(*) AS total_lots,
      COUNT(*) FILTER (WHERE status='available'::inventory_lot_status) AS available_lots,
      COUNT(*) FILTER (WHERE status='partial'::inventory_lot_status)   AS partial_lots,
      COUNT(*) FILTER (WHERE status='depleted'::inventory_lot_status)  AS depleted_lots,
      SUM(original_cost_aed)  AS orig_cost_aed,
      SUM(remaining_cost_aed) AS remain_cost_aed,
      SUM(consumed_cost_aed)  AS consumed_cost_aed,
      MIN(entry_date) AS oldest_entry,
      MAX(entry_date) AS newest_entry,
      AVG(age_days)   AS avg_age_days
    FROM lots
  ),
  by_ccy AS (
    SELECT
      currency,
      MIN(cost_basis_currency) AS cost_basis_currency,
      SUM(original_amount)  AS orig_amt,
      SUM(remaining_amount) AS remain_amt,
      SUM(consumed_amount)  AS consumed_amt,
      SUM(original_cost)    AS orig_cost,
      SUM(remaining_cost)   AS remain_cost,
      SUM(consumed_cost)    AS consumed_cost,
      SUM(original_amount * cost_basis_rate) / NULLIF(SUM(original_amount),0) AS wap_cost_rate,
      MIN(entry_date) AS oldest_entry,
      MAX(entry_date) AS newest_entry,
      COUNT(*)  AS lot_count,
      COUNT(*) FILTER (WHERE status='available'::inventory_lot_status) AS available_lots,
      COUNT(*) FILTER (WHERE status='partial'::inventory_lot_status)   AS partial_lots,
      COUNT(*) FILTER (WHERE status='depleted'::inventory_lot_status)  AS depleted_lots,
      AVG(age_days) AS avg_age_days
    FROM lots
    GROUP BY currency
  )
  SELECT
    jsonb_build_object(
      'total_lots',        COALESCE(a.total_lots,0),
      'available_lots',    COALESCE(a.available_lots,0),
      'partial_lots',      COALESCE(a.partial_lots,0),
      'depleted_lots',     COALESCE(a.depleted_lots,0),
      'remaining_cost_aed',COALESCE(a.remain_cost_aed,0),
      'consumed_cost_aed', COALESCE(a.consumed_cost_aed,0),
      'original_cost_aed', COALESCE(a.orig_cost_aed,0),
      'oldest_entry_date', a.oldest_entry,
      'newest_entry_date', a.newest_entry,
      'avg_age_days',      a.avg_age_days,
      'utilization_pct',
        CASE WHEN COALESCE(a.orig_cost_aed,0)=0 THEN NULL
             ELSE ROUND(100.0*a.consumed_cost_aed/NULLIF(a.orig_cost_aed,0),2) END,
      'turnover_ratio',
        CASE WHEN COALESCE(a.remain_cost_aed,0)+COALESCE(a.consumed_cost_aed,0) = 0 THEN NULL
             ELSE ROUND( a.consumed_cost_aed::numeric /
                    NULLIF((a.remain_cost_aed+a.consumed_cost_aed)/2 ,0), 4) END,
      'aed_market_snapshot_rate', v_aed_mid
    ),
    (SELECT jsonb_agg(jsonb_build_object(
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
        CASE WHEN COALESCE(b.orig_amt,0)=0 THEN NULL
             ELSE ROUND(100.0*b.consumed_amt/NULLIF(b.orig_amt,0),2) END
    ) ORDER BY b.currency) FROM by_ccy b)
  INTO v_kpis, v_currency
  FROM agg a;

  SELECT COUNT(*) INTO v_included FROM public.v_inventory_lots_ext l
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND (_currency        IS NULL OR l.currency        = _currency)
      AND (_account_id      IS NULL OR l.account_id      = _account_id)
      AND (_status          IS NULL OR l.status::text    = _status)
      AND (_source_ref_type IS NULL OR l.source_ref_type = _source_ref_type)
      AND (_operator_id     IS NULL OR l.created_by      = _operator_id);
  SELECT COUNT(*) INTO v_total_lots FROM public.v_inventory_lots_ext;
  v_excluded := v_total_lots - v_included;

  WITH lots AS (
    SELECT * FROM public.v_inventory_lots_ext l
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND (_currency        IS NULL OR l.currency        = _currency)
      AND (_account_id      IS NULL OR l.account_id      = _account_id)
      AND (_status          IS NULL OR l.status::text    = _status)
      AND (_source_ref_type IS NULL OR l.source_ref_type = _source_ref_type)
      AND (_operator_id     IS NULL OR l.created_by      = _operator_id)
  ),
  bucket_totals AS (
    SELECT age_bucket,
      COUNT(*) AS n,
      SUM(remaining_amount) AS remain,
      SUM(remaining_cost) AS rem_cost,
      SUM(original_cost) AS orig_cost,
      SUM(CASE WHEN cost_basis_currency='AED' THEN remaining_cost
               WHEN cost_basis_currency='IRR' AND v_aed_mid IS NOT NULL THEN remaining_cost/v_aed_mid
               ELSE 0 END) AS rem_cost_aed
    FROM lots GROUP BY age_bucket
  ),
  grand AS (SELECT SUM(rem_cost_aed) AS total_remain_aed FROM bucket_totals)
  SELECT jsonb_agg(jsonb_build_object(
    'bucket',           b.age_bucket,
    'lot_count',        b.n,
    'remaining_amount', b.remain,
    'remaining_cost',   b.rem_cost,
    'remaining_cost_aed', b.rem_cost_aed,
    'original_cost',    b.orig_cost,
    'pct_of_remaining',
      CASE WHEN COALESCE((SELECT total_remain_aed FROM grand),0)=0 THEN NULL
           ELSE ROUND(100.0*b.rem_cost_aed/NULLIF((SELECT total_remain_aed FROM grand),0),2) END
  ) ORDER BY
      CASE b.age_bucket
        WHEN '0-7' THEN 1 WHEN '8-30' THEN 2 WHEN '31-90' THEN 3
        WHEN '91-180' THEN 4 WHEN '181-365' THEN 5 ELSE 6 END)
  INTO v_aging
  FROM bucket_totals b;

  WITH lots AS (
    SELECT * FROM public.v_inventory_lots_ext l
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND (_currency        IS NULL OR l.currency        = _currency)
      AND (_account_id      IS NULL OR l.account_id      = _account_id)
      AND (_status          IS NULL OR l.status::text    = _status)
      AND (_source_ref_type IS NULL OR l.source_ref_type = _source_ref_type)
      AND (_operator_id     IS NULL OR l.created_by      = _operator_id)
  )
  SELECT jsonb_agg(row_to_json(x))
  INTO v_account
  FROM (
    SELECT
      l.account_id, l.account_name, l.account_owner,
      COUNT(*) AS lot_count,
      SUM(l.original_amount)  AS original_amount,
      SUM(l.remaining_amount) AS remaining_amount,
      SUM(l.consumed_amount)  AS consumed_amount,
      SUM(l.original_cost)    AS original_cost,
      SUM(l.remaining_cost)   AS remaining_cost,
      SUM(l.consumed_cost)    AS consumed_cost,
      SUM(CASE WHEN l.cost_basis_currency='AED' THEN l.remaining_cost
               WHEN l.cost_basis_currency='IRR' AND v_aed_mid IS NOT NULL THEN l.remaining_cost/v_aed_mid
               ELSE 0 END) AS remaining_cost_aed,
      jsonb_agg(DISTINCT l.currency) AS currencies,
      MAX(l.original_amount) AS largest_lot_amount,
      MIN(l.entry_date) AS oldest_entry,
      MAX(l.entry_date) AS newest_entry,
      CASE WHEN COALESCE(SUM(l.original_amount),0)=0 THEN NULL
           ELSE ROUND(100.0*SUM(l.consumed_amount)/NULLIF(SUM(l.original_amount),0),2) END AS utilization_pct
    FROM lots l
    GROUP BY l.account_id, l.account_name, l.account_owner
    ORDER BY 12 DESC NULLS LAST
  ) x;

  WITH lots AS (
    SELECT * FROM public.v_inventory_lots_ext l
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND (_currency        IS NULL OR l.currency        = _currency)
      AND (_account_id      IS NULL OR l.account_id      = _account_id)
      AND (_status          IS NULL OR l.status::text    = _status)
      AND (_source_ref_type IS NULL OR l.source_ref_type = _source_ref_type)
      AND (_operator_id     IS NULL OR l.created_by      = _operator_id)
  ),
  by_ccy AS (
    SELECT currency, cost_basis_currency,
      SUM(original_amount * cost_basis_rate) / NULLIF(SUM(original_amount),0) AS wap_cost_rate,
      SUM(remaining_amount) AS remain_amt,
      SUM(remaining_cost)   AS remain_cost
    FROM lots
    GROUP BY currency, cost_basis_currency
  )
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
        WHEN m.market_mid IS NULL OR v_aed_mid IS NULL THEN NULL
        ELSE b.remain_amt * m.market_mid / v_aed_mid
      END,
    'remaining_cost_aed',
      CASE
        WHEN b.cost_basis_currency='AED' THEN b.remain_cost
        WHEN b.cost_basis_currency='IRR' AND v_aed_mid IS NOT NULL
          THEN b.remain_cost / v_aed_mid
        ELSE NULL
      END,
    'unrealized_pnl_aed',
      CASE
        WHEN b.currency='AED' THEN 0
        WHEN m.market_mid IS NULL OR v_aed_mid IS NULL THEN NULL
        WHEN b.cost_basis_currency='AED' THEN
          (b.remain_amt * m.market_mid / v_aed_mid) - b.remain_cost
        WHEN b.cost_basis_currency='IRR' THEN
          (b.remain_amt * m.market_mid / v_aed_mid)
          - (b.remain_cost / v_aed_mid)
        ELSE NULL
      END
  ) ORDER BY b.currency)
  INTO v_market
  FROM by_ccy b
  LEFT JOIN public.v_market_rate_latest m ON m.currency = b.currency;

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
