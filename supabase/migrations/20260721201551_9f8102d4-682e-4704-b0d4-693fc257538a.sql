CREATE OR REPLACE FUNCTION public.report_business_alerts(_include_dismissed boolean DEFAULT false, _thresholds jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_now timestamptz := now();
  v_alerts jsonb := '[]'::jsonb;
  v_dismissed jsonb;
  v_dorm_inv int := COALESCE((_thresholds->>'dormant_inventory_days')::int,60);
  v_dorm_party int := COALESCE((_thresholds->>'dormant_party_days')::int,90);
  v_sup_hrs int := COALESCE((_thresholds->>'supplier_delay_hours')::int,72);
  v_set_hrs int := COALESCE((_thresholds->>'settlement_delay_hours')::int,48);
  v_lp_mult numeric := COALESCE((_thresholds->>'large_profit_multiplier')::numeric,3.0);
  v_cash_below numeric := COALESCE((_thresholds->>'cash_below_aed')::numeric,0);
BEGIN
  PERFORM public._admin_report_gate();
  SELECT COALESCE(jsonb_object_agg(alert_key, jsonb_build_object('dismissed_at',dismissed_at,'dismissed_by',dismissed_by,'reason',reason)),'{}'::jsonb)
    INTO v_dismissed FROM public.admin_alert_dismissals WHERE active;

  WITH d AS (SELECT count(*) FILTER (WHERE classification='invalid') AS invalid, count(*) FILTER (WHERE classification='suspicious') AS suspicious FROM public.v_data_quality)
  SELECT v_alerts || jsonb_build_array(jsonb_build_object(
    'key','dq.summary','category','data_quality',
    'level', CASE WHEN d.invalid>0 THEN 'critical' WHEN d.suspicious>0 THEN 'warning' ELSE 'info' END,
    'title','Data quality',
    'message', format('%s invalid, %s suspicious rows across financial sources', d.invalid, d.suspicious),
    'metric', jsonb_build_object('invalid',d.invalid,'suspicious',d.suspicious),
    'raised_at', v_now)) INTO v_alerts FROM d;

  WITH d AS (
    SELECT count(*) AS n, COALESCE(sum(remaining_cost),0) AS cost_aed
    FROM public.v_inventory_lots_ext
    WHERE status IN ('available','partial') AND remaining_amount>0 AND age_days > v_dorm_inv
  )
  SELECT v_alerts || (CASE WHEN d.n>0 THEN jsonb_build_array(jsonb_build_object(
    'key','inventory.dormant','category','dormant_inventory',
    'level', CASE WHEN d.n>20 THEN 'critical' WHEN d.n>5 THEN 'warning' ELSE 'info' END,
    'title', format('%s dormant lots (>%s days)', d.n, v_dorm_inv),
    'message', format('Locked capital = AED %s', round(d.cost_aed,2)),
    'metric', jsonb_build_object('lots',d.n,'cost_aed',round(d.cost_aed,2),'days',v_dorm_inv),
    'raised_at', v_now)) ELSE '[]'::jsonb END) INTO v_alerts FROM d;

  WITH d AS (SELECT currency, sum(remaining_amount) AS rem FROM public.v_inventory_lots_ext WHERE status IN ('available','partial') GROUP BY currency HAVING sum(remaining_amount) < 1000)
  SELECT v_alerts || COALESCE(jsonb_agg(jsonb_build_object(
    'key','inventory.low.'||d.currency,'category','low_inventory','level','warning',
    'title', format('Low inventory: %s', d.currency),
    'message', format('Remaining %s = %s', d.currency, round(d.rem,2)),
    'metric', jsonb_build_object('currency',d.currency,'remaining',round(d.rem,2)),
    'raised_at', v_now)),'[]'::jsonb) INTO v_alerts FROM d;

  WITH d AS (
    SELECT id, doc_no, workflow_state, updated_at, EXTRACT(EPOCH FROM (v_now - updated_at))/3600 AS hrs
    FROM public.remittances
    WHERE workflow_version='v2' AND workflow_state='settlement_pending'
      AND EXTRACT(EPOCH FROM (v_now - updated_at))/3600 > v_sup_hrs)
  SELECT v_alerts || COALESCE(jsonb_agg(jsonb_build_object(
    'key','remittance.supplier_delay.'||d.id,'category','supplier_delay','level','warning',
    'title', format('Supplier delay on %s', d.doc_no),
    'message', format('%s in %s for %s h', d.doc_no, d.workflow_state, round(d.hrs::numeric,1)),
    'metric', jsonb_build_object('remittance_id',d.id,'hours',round(d.hrs::numeric,1)),
    'raised_at', v_now)),'[]'::jsonb) INTO v_alerts FROM d;

  WITH d AS (
    SELECT id, doc_no, workflow_state, updated_at, EXTRACT(EPOCH FROM (v_now - updated_at))/3600 AS hrs
    FROM public.remittances
    WHERE workflow_version='v2' AND workflow_state='funds_received'
      AND EXTRACT(EPOCH FROM (v_now - updated_at))/3600 > v_set_hrs)
  SELECT v_alerts || COALESCE(jsonb_agg(jsonb_build_object(
    'key','remittance.settlement_delay.'||d.id,'category','settlement_delay','level','warning',
    'title', format('Settlement delay on %s', d.doc_no),
    'message', format('Funds received, no delivery for %s h', round(d.hrs::numeric,1)),
    'metric', jsonb_build_object('remittance_id',d.id,'hours',round(d.hrs::numeric,1)),
    'raised_at', v_now)),'[]'::jsonb) INTO v_alerts FROM d;

  WITH stats AS (SELECT avg(gross_profit_aed) AS avg_p FROM public.v_profit_events_ext WHERE event_at > v_now - interval '90 days'),
  spikes AS (
    SELECT e.source, e.ref_id, e.doc_no, e.gross_profit_aed, s.avg_p
    FROM public.v_profit_events_ext e, stats s
    WHERE e.event_at > v_now - interval '30 days'
      AND s.avg_p IS NOT NULL AND s.avg_p > 0
      AND e.gross_profit_aed > v_lp_mult * s.avg_p
    ORDER BY e.gross_profit_aed DESC LIMIT 10)
  SELECT v_alerts || COALESCE(jsonb_agg(jsonb_build_object(
    'key','profit.spike.'||spikes.source||'.'||spikes.ref_id,'category','large_profit','level','info',
    'title', format('Large profit event on %s', COALESCE(spikes.doc_no,'(no doc)')),
    'message', format('Profit AED %s (%sx 90d avg)', round(spikes.gross_profit_aed,2), round((spikes.gross_profit_aed/NULLIF(spikes.avg_p,0))::numeric,1)),
    'metric', jsonb_build_object('profit_aed',round(spikes.gross_profit_aed,2),'avg_aed',round(spikes.avg_p,2)),
    'raised_at', v_now)),'[]'::jsonb) INTO v_alerts FROM spikes;

  WITH d AS (SELECT currency, sum(remaining_amount) AS pos FROM public.v_inventory_lots_ext WHERE status IN ('available','partial') GROUP BY currency HAVING sum(remaining_amount) > 1000000)
  SELECT v_alerts || COALESCE(jsonb_agg(jsonb_build_object(
    'key','exposure.high.'||d.currency,'category','high_exposure','level','warning',
    'title', format('High exposure: %s', d.currency),
    'message', format('Net position %s = %s', d.currency, round(d.pos,2)),
    'metric', jsonb_build_object('currency',d.currency,'position',round(d.pos,2)),
    'raised_at', v_now)),'[]'::jsonb) INTO v_alerts FROM d;

  WITH d AS (SELECT account_id, account_name, currency, balance FROM public.v_account_balances WHERE balance < v_cash_below AND is_active)
  SELECT v_alerts || COALESCE(jsonb_agg(jsonb_build_object(
    'key','cash.below.'||d.account_id,'category','cash_below',
    'level', CASE WHEN d.balance<0 THEN 'critical' ELSE 'warning' END,
    'title', format('Low balance: %s', d.account_name),
    'message', format('%s balance %s', d.currency, round(d.balance,2)),
    'metric', jsonb_build_object('account_id',d.account_id,'balance',round(d.balance,2),'currency',d.currency),
    'raised_at', v_now)),'[]'::jsonb) INTO v_alerts FROM d;

  WITH act AS (
    SELECT c.id, c.name,
      GREATEST(
        COALESCE((SELECT max(entry_date) FROM public.remittances r WHERE r.customer_id=c.id),'epoch'::date),
        COALESCE((SELECT max(entry_date) FROM public.sell_transactions s WHERE s.customer_id=c.id),'epoch'::date)
      ) AS last_activity
    FROM public.customers c WHERE c.deleted_at IS NULL),
  dorm AS (SELECT * FROM act WHERE last_activity < (v_now::date - v_dorm_party)),
  agg AS (SELECT count(*) AS n FROM dorm)
  SELECT v_alerts || (CASE WHEN agg.n>0 THEN jsonb_build_array(jsonb_build_object(
    'key','parties.dormant','category','dormant_parties',
    'level', CASE WHEN agg.n>50 THEN 'warning' ELSE 'info' END,
    'title', format('%s dormant counterparties (>%s d)', agg.n, v_dorm_party),
    'message','Consider archive or outreach.',
    'metric', jsonb_build_object('count',agg.n,'days',v_dorm_party),
    'raised_at', v_now)) ELSE '[]'::jsonb END) INTO v_alerts FROM agg;

  WITH raw AS (SELECT jsonb_array_elements(v_alerts) AS a),
  enr AS (SELECT (a || jsonb_build_object(
      'dismissed',(v_dismissed ? (a->>'key')),
      'dismissed_meta',v_dismissed->(a->>'key'))) AS a FROM raw),
  filt AS (SELECT a FROM enr WHERE _include_dismissed OR NOT COALESCE((a->>'dismissed')::boolean,false))
  SELECT COALESCE(jsonb_agg(a ORDER BY
    CASE a->>'level' WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
    a->>'title'),'[]'::jsonb) INTO v_alerts FROM filt;

  RETURN jsonb_build_object(
    'meta',jsonb_build_object('report_key','business_alerts','report_version','1.0.1','generated_at',v_now,'generated_by_version','phase6.slice7','data_cutoff',v_now),
    'thresholds',jsonb_build_object('dormant_inventory_days',v_dorm_inv,'dormant_party_days',v_dorm_party,'supplier_delay_hours',v_sup_hrs,'settlement_delay_hours',v_set_hrs,'large_profit_multiplier',v_lp_mult,'cash_below_aed',v_cash_below),
    'counts',jsonb_build_object(
      'total',jsonb_array_length(v_alerts),
      'critical',(SELECT count(*) FROM jsonb_array_elements(v_alerts) x WHERE x->>'level'='critical'),
      'warning',(SELECT count(*) FROM jsonb_array_elements(v_alerts) x WHERE x->>'level'='warning'),
      'info',(SELECT count(*) FROM jsonb_array_elements(v_alerts) x WHERE x->>'level'='info')),
    'alerts',v_alerts);
END; $fn$;
REVOKE ALL ON FUNCTION public.report_business_alerts(boolean,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.report_business_alerts(boolean,jsonb) TO authenticated;
COMMENT ON FUNCTION public.report_business_alerts(boolean,jsonb) IS 'Phase 6 Slice 7 v1.0.1 - READ-ONLY deterministic alerts. Never mutates. Fix: inventory_lot_status enum.';