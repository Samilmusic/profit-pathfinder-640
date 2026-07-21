-- Phase 6 Slice 5 — Treasury & Cash Intelligence (READ-ONLY)
CREATE OR REPLACE VIEW public.v_account_balances AS
SELECT
  a.id AS account_id, a.name AS account_name, a.account_type, a.node_type,
  a.currency, a.owner AS account_owner, a.bank_name, a.holder_type,
  a.holder_customer_id, a.holder_person_name, a.is_active, a.opening_balance,
  COALESCE(SUM(l.amount), 0) AS ledger_sum,
  a.opening_balance + COALESCE(SUM(l.amount), 0) AS balance,
  MAX(l.entry_date) AS last_activity_date,
  MAX(l.created_at) AS last_activity_at,
  COUNT(l.id) AS entries_all_time,
  COUNT(l.id) FILTER (WHERE l.entry_date >= CURRENT_DATE - INTERVAL '30 days') AS entries_30d,
  COUNT(l.id) FILTER (WHERE l.entry_date >= CURRENT_DATE - INTERVAL '7 days')  AS entries_7d
FROM public.accounts a
LEFT JOIN public.ledger_entries l ON l.account_id = a.id
WHERE a.deleted_at IS NULL AND a.node_type = 'currency_account'
GROUP BY a.id;

GRANT SELECT ON public.v_account_balances TO authenticated;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_date ON public.ledger_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_date ON public.ledger_entries (account_id, entry_date);

CREATE OR REPLACE FUNCTION public.report_treasury_overview(
  _quality_mode text DEFAULT 'exclude_invalid', _currency text DEFAULT NULL,
  _account_id uuid DEFAULT NULL, _owner text DEFAULT NULL,
  _from date DEFAULT NULL, _to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_from date := COALESCE(_from, CURRENT_DATE - INTERVAL '30 days');
  v_to date := COALESCE(_to, CURRENT_DATE);
  v_mode text := COALESCE(_quality_mode,'exclude_invalid');
  v_aed_mid numeric;
  v_by_currency jsonb; v_by_account jsonb; v_by_owner jsonb;
  v_largest jsonb; v_dormant jsonb; v_reserved jsonb; v_pending jsonb;
  v_expected_in jsonb; v_expected_out jsonb; v_kpis jsonb; v_largest_move jsonb;
BEGIN
  IF v_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN v_mode := 'exclude_invalid'; END IF;
  SELECT market_mid INTO v_aed_mid FROM public.v_market_rate_latest WHERE currency='AED';

  WITH b AS (
    SELECT v.*, CASE WHEN currency='AED' THEN balance
      WHEN currency='IRR' AND v_aed_mid IS NOT NULL AND v_aed_mid<>0 THEN balance/v_aed_mid
      ELSE NULL END AS balance_aed
    FROM public.v_account_balances v
    WHERE is_active=true
      AND (_currency IS NULL OR currency=_currency)
      AND (_account_id IS NULL OR account_id=_account_id)
      AND (_owner IS NULL OR account_owner::text=_owner)
  )
  SELECT jsonb_agg(row_to_json(t)) INTO v_by_currency FROM (
    SELECT currency, SUM(balance) AS held, SUM(balance_aed) AS held_aed,
           COUNT(*) AS account_count,
           MIN(last_activity_at) AS oldest_activity, MAX(last_activity_at) AS newest_activity
    FROM b GROUP BY currency ORDER BY currency
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_by_owner FROM (
    SELECT account_owner AS owner, COUNT(*) AS account_count,
           SUM(CASE WHEN currency='AED' THEN balance ELSE 0 END) AS aed_balance,
           SUM(CASE WHEN currency='IRR' THEN balance ELSE 0 END) AS irr_balance,
           SUM(CASE WHEN currency NOT IN ('AED','IRR') THEN balance ELSE 0 END) AS other_balance
    FROM public.v_account_balances
    WHERE is_active=true
      AND (_currency IS NULL OR currency=_currency)
      AND (_account_id IS NULL OR account_id=_account_id)
      AND (_owner IS NULL OR account_owner::text=_owner)
    GROUP BY account_owner ORDER BY account_owner
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_by_account FROM (
    SELECT account_id, account_name, currency, account_owner,
           account_type::text AS account_type, bank_name, balance,
           last_activity_at, entries_30d, entries_7d
    FROM public.v_account_balances
    WHERE is_active=true
      AND (_currency IS NULL OR currency=_currency)
      AND (_account_id IS NULL OR account_id=_account_id)
      AND (_owner IS NULL OR account_owner::text=_owner)
    ORDER BY currency, balance DESC
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_largest FROM (
    SELECT v.account_id, v.account_name, v.currency, v.account_owner, v.balance,
      CASE WHEN v.currency='AED' THEN v.balance
        WHEN v.currency='IRR' AND v_aed_mid IS NOT NULL AND v_aed_mid<>0 THEN v.balance/v_aed_mid
        ELSE NULL END AS balance_aed
    FROM public.v_account_balances v
    WHERE v.is_active=true AND v.balance<>0
      AND (_currency IS NULL OR v.currency=_currency)
      AND (_owner IS NULL OR v.account_owner::text=_owner)
    ORDER BY (CASE WHEN v.currency='AED' THEN v.balance
      WHEN v.currency='IRR' AND v_aed_mid IS NOT NULL AND v_aed_mid<>0 THEN v.balance/v_aed_mid
      ELSE 0 END) DESC NULLS LAST, v.balance DESC
    LIMIT 10
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_dormant FROM (
    SELECT account_id, account_name, currency, account_owner, balance, last_activity_at,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(last_activity_at, NOW() - INTERVAL '9999 days')))/86400 AS days_dormant
    FROM public.v_account_balances
    WHERE is_active=true AND balance<>0
      AND (last_activity_at IS NULL OR last_activity_at < NOW() - INTERVAL '60 days')
      AND (_currency IS NULL OR currency=_currency)
      AND (_owner IS NULL OR account_owner::text=_owner)
    ORDER BY days_dormant DESC NULLS LAST LIMIT 25
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_reserved FROM (
    SELECT settlement_currency AS currency, SUM(settlement_amount) AS amount, COUNT(*) AS count
    FROM public.remittances
    WHERE workflow_state IN ('funds_received','settlement_pending','allocating','ready_to_close')
      AND settlement_amount IS NOT NULL AND settlement_currency IS NOT NULL
      AND (_currency IS NULL OR settlement_currency=_currency)
    GROUP BY settlement_currency
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_pending FROM (
    SELECT settlement_currency AS currency, SUM(COALESCE(settlement_amount,0)) AS amount, COUNT(*) AS count
    FROM public.remittances
    WHERE workflow_state='draft' AND settlement_currency IS NOT NULL
      AND (_currency IS NULL OR settlement_currency=_currency)
    GROUP BY settlement_currency
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_expected_in FROM (
    SELECT customer_payment_currency AS currency, SUM(customer_payment_amount) AS amount, COUNT(*) AS count
    FROM public.remittances
    WHERE workflow_state IN ('draft','funds_received')
      AND customer_payment_currency IS NOT NULL AND customer_payment_amount IS NOT NULL
      AND (_currency IS NULL OR customer_payment_currency=_currency)
    GROUP BY customer_payment_currency
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_expected_out FROM (
    SELECT settlement_currency AS currency, SUM(settlement_amount) AS amount, COUNT(*) AS count
    FROM public.remittances
    WHERE workflow_state IN ('funds_received','settlement_pending','allocating','ready_to_close')
      AND settlement_currency IS NOT NULL
      AND (_currency IS NULL OR settlement_currency=_currency)
    GROUP BY settlement_currency
  ) t;

  SELECT to_jsonb(t) INTO v_largest_move FROM (
    SELECT entry_date,
      SUM(ABS(amount)) AS total_abs_move,
      SUM(CASE WHEN amount>0 THEN amount ELSE 0 END) AS inflow,
      SUM(CASE WHEN amount<0 THEN -amount ELSE 0 END) AS outflow
    FROM public.ledger_entries l
    JOIN public.accounts a ON a.id=l.account_id
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND a.node_type='currency_account'
      AND (_currency IS NULL OR l.currency=_currency)
      AND (_account_id IS NULL OR l.account_id=_account_id)
      AND (_owner IS NULL OR a.owner::text=_owner)
    GROUP BY entry_date ORDER BY total_abs_move DESC LIMIT 1
  ) t;

  WITH b AS (
    SELECT v.*, CASE WHEN currency='AED' THEN balance
      WHEN currency='IRR' AND v_aed_mid IS NOT NULL AND v_aed_mid<>0 THEN balance/v_aed_mid
      ELSE NULL END AS balance_aed
    FROM public.v_account_balances v
    WHERE is_active=true
      AND (_currency IS NULL OR currency=_currency)
      AND (_account_id IS NULL OR account_id=_account_id)
      AND (_owner IS NULL OR account_owner::text=_owner)
  )
  SELECT jsonb_build_object(
    'total_accounts', (SELECT COUNT(*) FROM b),
    'accounts_with_balance', (SELECT COUNT(*) FROM b WHERE balance<>0),
    'total_aed_equiv', (SELECT SUM(balance_aed) FROM b),
    'aed_snapshot_rate', v_aed_mid,
    'oldest_activity', (SELECT MIN(last_activity_at) FROM b),
    'newest_activity', (SELECT MAX(last_activity_at) FROM b)
  ) INTO v_kpis;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('report_key','treasury_overview','report_version','1.0.0',
      'generated_at', NOW(), 'data_cutoff', NOW(), 'generated_by_version','phase6-slice5'),
    'quality_mode', v_mode, 'date_from', v_from, 'date_to', v_to,
    'kpis', v_kpis,
    'by_currency', COALESCE(v_by_currency,'[]'::jsonb),
    'by_account',  COALESCE(v_by_account,'[]'::jsonb),
    'by_owner',    COALESCE(v_by_owner,'[]'::jsonb),
    'largest_balances', COALESCE(v_largest,'[]'::jsonb),
    'dormant_accounts', COALESCE(v_dormant,'[]'::jsonb),
    'reserved', COALESCE(v_reserved,'[]'::jsonb),
    'pending',  COALESCE(v_pending,'[]'::jsonb),
    'expected_inflows',  COALESCE(v_expected_in,'[]'::jsonb),
    'expected_outflows', COALESCE(v_expected_out,'[]'::jsonb),
    'largest_daily_movement', v_largest_move
  );
END; $$;

REVOKE ALL ON FUNCTION public.report_treasury_overview(text,text,uuid,text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_treasury_overview(text,text,uuid,text,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_treasury_cashflow(
  _granularity text DEFAULT 'day', _from date DEFAULT NULL, _to date DEFAULT NULL,
  _currency text DEFAULT NULL, _account_id uuid DEFAULT NULL, _owner text DEFAULT NULL,
  _forecast_days int DEFAULT 14
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_gran text := COALESCE(_granularity,'day');
  v_from date := COALESCE(_from, CURRENT_DATE - INTERVAL '90 days');
  v_to date := COALESCE(_to, CURRENT_DATE);
  v_fdays int := GREATEST(1, LEAST(90, COALESCE(_forecast_days,14)));
  v_series jsonb; v_forecast jsonb; v_stats jsonb;
BEGIN
  IF v_gran NOT IN ('day','week','month','year') THEN v_gran := 'day'; END IF;

  WITH raw AS (
    SELECT date_trunc(v_gran, l.entry_date::timestamp)::date AS bucket_start,
           l.currency, l.amount
    FROM public.ledger_entries l
    JOIN public.accounts a ON a.id=l.account_id
    WHERE l.entry_date BETWEEN v_from AND v_to
      AND a.node_type='currency_account'
      AND (_currency IS NULL OR l.currency=_currency)
      AND (_account_id IS NULL OR l.account_id=_account_id)
      AND (_owner IS NULL OR a.owner::text=_owner)
  ),
  agg AS (
    SELECT bucket_start,
      SUM(CASE WHEN amount>0 THEN amount ELSE 0 END) AS inflow,
      SUM(CASE WHEN amount<0 THEN -amount ELSE 0 END) AS outflow,
      SUM(amount) AS net, COUNT(*) AS movements
    FROM raw GROUP BY bucket_start
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.bucket_start) INTO v_series FROM (
    SELECT bucket_start, inflow, outflow, net, movements,
      SUM(net) OVER (ORDER BY bucket_start) AS running_net
    FROM agg
  ) t;

  WITH daily AS (
    SELECT l.entry_date,
      SUM(CASE WHEN l.amount>0 THEN l.amount ELSE 0 END) AS inflow,
      SUM(CASE WHEN l.amount<0 THEN -l.amount ELSE 0 END) AS outflow,
      SUM(l.amount) AS net
    FROM public.ledger_entries l
    JOIN public.accounts a ON a.id=l.account_id
    WHERE l.entry_date BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE
      AND a.node_type='currency_account'
      AND (_currency IS NULL OR l.currency=_currency)
      AND (_account_id IS NULL OR l.account_id=_account_id)
      AND (_owner IS NULL OR a.owner::text=_owner)
    GROUP BY l.entry_date
  ),
  stats AS (
    SELECT AVG(net) AS avg_net, AVG(inflow) AS avg_inflow,
           AVG(outflow) AS avg_outflow, COUNT(*) AS active_days
    FROM daily
  ),
  gs AS (
    SELECT generate_series(CURRENT_DATE + 1, CURRENT_DATE + v_fdays, INTERVAL '1 day')::date AS d
  )
  SELECT jsonb_agg(jsonb_build_object(
           'bucket_start', gs.d, 'inflow_est', stats.avg_inflow,
           'outflow_est', stats.avg_outflow, 'net_est', stats.avg_net,
           'is_estimate', true) ORDER BY gs.d),
         to_jsonb(stats)
  INTO v_forecast, v_stats FROM gs, stats;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('report_key','treasury_cashflow','report_version','1.0.0',
      'generated_at', NOW(), 'data_cutoff', NOW(), 'generated_by_version','phase6-slice5'),
    'granularity', v_gran, 'date_from', v_from, 'date_to', v_to,
    'forecast_days', v_fdays,
    'series', COALESCE(v_series,'[]'::jsonb),
    'forecast', COALESCE(v_forecast,'[]'::jsonb),
    'forecast_stats', COALESCE(v_stats,'{}'::jsonb),
    'forecast_note','Rolling 30-day average. Historical data only. Not AI. Labeled Estimate.'
  );
END; $$;

REVOKE ALL ON FUNCTION public.report_treasury_cashflow(text,date,date,text,uuid,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_treasury_cashflow(text,date,date,text,uuid,text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_currency_exposure(
  _from date DEFAULT NULL, _to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_from date := COALESCE(_from, CURRENT_DATE - INTERVAL '30 days');
  v_to date := COALESCE(_to, CURRENT_DATE);
  v_rows jsonb; v_trend jsonb;
BEGIN
  WITH held AS (
    SELECT currency, SUM(balance) AS held FROM public.v_account_balances
    WHERE is_active=true GROUP BY currency
  ),
  reserved AS (
    SELECT settlement_currency AS currency, SUM(settlement_amount) AS amt
    FROM public.remittances
    WHERE workflow_state IN ('funds_received','settlement_pending','allocating','ready_to_close')
      AND settlement_currency IS NOT NULL
    GROUP BY settlement_currency
  ),
  pending AS (
    SELECT settlement_currency AS currency, SUM(COALESCE(settlement_amount,0)) AS amt
    FROM public.remittances
    WHERE workflow_state='draft' AND settlement_currency IS NOT NULL
    GROUP BY settlement_currency
  ),
  mkt AS (SELECT currency, market_mid, snapshot_at, snapshot_source FROM public.v_market_rate_latest)
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.currency) INTO v_rows FROM (
    SELECT h.currency, h.held,
      COALESCE(r.amt,0) AS reserved, COALESCE(p.amt,0) AS pending,
      h.held - COALESCE(r.amt,0) - COALESCE(p.amt,0) AS net_position,
      m.market_mid, m.snapshot_at AS market_snapshot_at,
      m.snapshot_source AS market_snapshot_source,
      CASE WHEN m.market_mid IS NOT NULL THEN h.held * m.market_mid ELSE NULL END AS market_value
    FROM held h LEFT JOIN reserved r ON r.currency=h.currency
    LEFT JOIN pending p ON p.currency=h.currency
    LEFT JOIN mkt m ON m.currency=h.currency
  ) t;

  WITH daily AS (
    SELECT l.entry_date, l.currency, SUM(l.amount) AS net_change
    FROM public.ledger_entries l
    JOIN public.accounts a ON a.id=l.account_id
    WHERE l.entry_date BETWEEN v_from AND v_to AND a.node_type='currency_account'
    GROUP BY l.entry_date, l.currency
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.entry_date, t.currency) INTO v_trend FROM (
    SELECT entry_date, currency, net_change,
      SUM(net_change) OVER (PARTITION BY currency ORDER BY entry_date) AS running_change
    FROM daily
  ) t;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('report_key','currency_exposure','report_version','1.0.0',
      'generated_at', NOW(), 'data_cutoff', NOW(), 'generated_by_version','phase6-slice5'),
    'date_from', v_from, 'date_to', v_to,
    'rows', COALESCE(v_rows,'[]'::jsonb),
    'trend', COALESCE(v_trend,'[]'::jsonb)
  );
END; $$;

REVOKE ALL ON FUNCTION public.report_currency_exposure(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_currency_exposure(date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_bank_account_analytics(
  _from date DEFAULT NULL, _to date DEFAULT NULL,
  _currency text DEFAULT NULL, _owner text DEFAULT NULL,
  _limit int DEFAULT 100, _offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_from date := COALESCE(_from, CURRENT_DATE - INTERVAL '90 days');
  v_to date := COALESCE(_to, CURRENT_DATE);
  v_rows jsonb; v_total bigint;
BEGIN
  WITH ranges AS (
    SELECT a.id AS account_id, a.name AS account_name, a.currency,
           a.owner AS account_owner, a.bank_name, a.account_type::text AS account_type,
           v.balance, v.last_activity_at,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(v.last_activity_at, NOW() - INTERVAL '9999 days')))/86400 AS days_dormant
    FROM public.accounts a
    JOIN public.v_account_balances v ON v.account_id=a.id
    WHERE a.deleted_at IS NULL AND a.node_type='currency_account' AND a.is_active=true
      AND (_currency IS NULL OR a.currency=_currency)
      AND (_owner IS NULL OR a.owner::text=_owner)
  ),
  activity AS (
    SELECT l.account_id, COUNT(*) AS movements,
      SUM(CASE WHEN l.amount>0 THEN l.amount ELSE 0 END) AS inflow,
      SUM(CASE WHEN l.amount<0 THEN -l.amount ELSE 0 END) AS outflow,
      SUM(l.amount) AS net, AVG(ABS(l.amount)) AS avg_tx, MAX(ABS(l.amount)) AS largest_tx,
      (SELECT to_char(l2.entry_date,'YYYY-MM') FROM public.ledger_entries l2
       WHERE l2.account_id=l.account_id AND l2.entry_date BETWEEN v_from AND v_to
       GROUP BY to_char(l2.entry_date,'YYYY-MM')
       ORDER BY COUNT(*) DESC NULLS LAST LIMIT 1) AS most_active_period
    FROM public.ledger_entries l
    WHERE l.entry_date BETWEEN v_from AND v_to
    GROUP BY l.account_id
  ),
  avg_bal AS (
    SELECT a.id AS account_id,
      a.opening_balance + COALESCE((
        SELECT SUM(l3.amount) FROM public.ledger_entries l3
        WHERE l3.account_id=a.id AND l3.entry_date < v_from), 0) AS start_balance,
      (SELECT AVG(x.bal) FROM (
        SELECT SUM(l4.amount) OVER (ORDER BY l4.entry_date) AS bal
        FROM public.ledger_entries l4
        WHERE l4.account_id=a.id AND l4.entry_date BETWEEN v_from AND v_to) x) AS avg_delta
    FROM public.accounts a
    WHERE a.deleted_at IS NULL AND a.node_type='currency_account'
  ),
  full_rows AS (
    SELECT r.*, COALESCE(ac.movements,0) AS movements,
      COALESCE(ac.inflow,0) AS inflow, COALESCE(ac.outflow,0) AS outflow,
      COALESCE(ac.net,0) AS net_flow, ac.avg_tx, ac.largest_tx, ac.most_active_period,
      COALESCE(ab.start_balance,0) + COALESCE(ab.avg_delta,0) AS avg_daily_balance,
      CASE WHEN r.days_dormant > 60 THEN 'dormant'
           WHEN r.days_dormant > 14 THEN 'quiet' ELSE 'active' END AS activity_status
    FROM ranges r
    LEFT JOIN activity ac ON ac.account_id=r.account_id
    LEFT JOIN avg_bal ab ON ab.account_id=r.account_id
    ORDER BY r.balance DESC NULLS LAST
  )
  SELECT COUNT(*), jsonb_agg(row_to_json(t)) INTO v_total, v_rows
  FROM (SELECT * FROM full_rows LIMIT COALESCE(_limit,100) OFFSET COALESCE(_offset,0)) t;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('report_key','bank_account_analytics','report_version','1.0.0',
      'generated_at', NOW(), 'data_cutoff', NOW(), 'generated_by_version','phase6-slice5'),
    'date_from', v_from, 'date_to', v_to,
    'total', COALESCE(v_total,0),
    'limit', COALESCE(_limit,100), 'offset', COALESCE(_offset,0),
    'rows', COALESCE(v_rows,'[]'::jsonb)
  );
END; $$;

REVOKE ALL ON FUNCTION public.report_bank_account_analytics(date,date,text,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_bank_account_analytics(date,date,text,text,int,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_treasury_account_detail(
  _account_id uuid, _from date DEFAULT NULL, _to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_from date := COALESCE(_from, CURRENT_DATE - INTERVAL '90 days');
  v_to date := COALESCE(_to, CURRENT_DATE);
  v_acc jsonb; v_series jsonb; v_txs jsonb;
BEGIN
  SELECT row_to_json(t) INTO v_acc FROM (
    SELECT v.*, a.iban, a.account_number, a.bank_name, a.holder_person_name
    FROM public.v_account_balances v
    JOIN public.accounts a ON a.id=v.account_id
    WHERE v.account_id=_account_id
  ) t;

  WITH daily AS (
    SELECT l.entry_date,
      SUM(CASE WHEN l.amount>0 THEN l.amount ELSE 0 END) AS inflow,
      SUM(CASE WHEN l.amount<0 THEN -l.amount ELSE 0 END) AS outflow,
      SUM(l.amount) AS net
    FROM public.ledger_entries l
    WHERE l.account_id=_account_id AND l.entry_date BETWEEN v_from AND v_to
    GROUP BY l.entry_date
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.entry_date) INTO v_series FROM (
    SELECT entry_date, inflow, outflow, net,
      SUM(net) OVER (ORDER BY entry_date) AS running_net
    FROM daily
  ) t;

  SELECT jsonb_agg(row_to_json(t) ORDER BY t.entry_date DESC, t.created_at DESC)
  INTO v_txs FROM (
    SELECT l.id, l.entry_date, l.amount, l.currency, l.ref_type::text AS ref_type,
           l.ref_id, l.description, l.created_at
    FROM public.ledger_entries l
    WHERE l.account_id=_account_id AND l.entry_date BETWEEN v_from AND v_to
    ORDER BY l.entry_date DESC, l.created_at DESC LIMIT 500
  ) t;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('report_key','treasury_account_detail','report_version','1.0.0',
      'generated_at', NOW(), 'data_cutoff', NOW(), 'generated_by_version','phase6-slice5'),
    'date_from', v_from, 'date_to', v_to,
    'account', v_acc, 'series', COALESCE(v_series,'[]'::jsonb),
    'transactions', COALESCE(v_txs,'[]'::jsonb)
  );
END; $$;

REVOKE ALL ON FUNCTION public.report_treasury_account_detail(uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_treasury_account_detail(uuid,date,date) TO authenticated;

COMMENT ON FUNCTION public.report_treasury_overview(text,text,uuid,text,date,date) IS 'Phase 6 Slice 5 treasury overview. v1.0.0. READ-ONLY.';
COMMENT ON FUNCTION public.report_treasury_cashflow(text,date,date,text,uuid,text,int) IS 'Phase 6 Slice 5 cashflow + rolling-average forecast. v1.0.0.';
COMMENT ON FUNCTION public.report_currency_exposure(date,date) IS 'Phase 6 Slice 5 currency exposure with market snapshot. v1.0.0.';
COMMENT ON FUNCTION public.report_bank_account_analytics(date,date,text,text,int,int) IS 'Phase 6 Slice 5 per-account analytics. v1.0.0.';
COMMENT ON FUNCTION public.report_treasury_account_detail(uuid,date,date) IS 'Phase 6 Slice 5 account drill-down. v1.0.0.';