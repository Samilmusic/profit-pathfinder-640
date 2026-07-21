-- Phase C fixes: SQL bugs in report RPCs found via authenticated QA sweep.

-- Fix ambiguity between DECLARE variables and subquery aliases (closed_today/cancelled_today).
CREATE OR REPLACE FUNCTION public.report_operational_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  states jsonb;
  workload jsonb;
  v_closed_today bigint;
  v_cancelled_today bigint;
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
      'closed_today', closed_ct,
      'cancelled_today', cancelled_ct
    ) ORDER BY in_flight DESC),
    '[]'::jsonb
  ) INTO workload
  FROM (
    SELECT
      r.created_by AS op,
      COUNT(*) FILTER (WHERE r.status = 'open' AND (r.workflow_state IS NULL OR r.workflow_state::text = 'draft')) AS open_drafts,
      COUNT(*) FILTER (WHERE r.status = 'open') AS in_flight,
      COUNT(*) FILTER (WHERE r.status = 'closed' AND r.updated_at::date = today) AS closed_ct,
      COUNT(*) FILTER (WHERE r.status = 'cancelled' AND r.updated_at::date = today) AS cancelled_ct
    FROM public.remittances r
    WHERE r.created_by IS NOT NULL
    GROUP BY r.created_by
  ) x;

  SELECT COUNT(*) INTO v_closed_today
    FROM public.remittances
    WHERE status = 'closed' AND updated_at::date = today;

  SELECT COUNT(*) INTO v_cancelled_today
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
    'closed_today', v_closed_today,
    'cancelled_today', v_cancelled_today,
    'avg_processing_seconds', avg_proc_seconds
  );
END; $function$;

-- Fix aggregate/group-by error in cashflow forecast: separate v_stats computation
-- from generate_series cross-join aggregation.
CREATE OR REPLACE FUNCTION public.report_treasury_cashflow(
  _granularity text DEFAULT 'day',
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _currency text DEFAULT NULL,
  _account_id uuid DEFAULT NULL,
  _owner text DEFAULT NULL,
  _forecast_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gran text := COALESCE(_granularity,'day');
  v_from date := COALESCE(_from, CURRENT_DATE - INTERVAL '90 days');
  v_to date := COALESCE(_to, CURRENT_DATE);
  v_fdays int := GREATEST(1, LEAST(90, COALESCE(_forecast_days,14)));
  v_series jsonb; v_forecast jsonb; v_stats jsonb;
  v_avg_inflow numeric; v_avg_outflow numeric; v_avg_net numeric; v_active_days bigint;
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

  -- Compute 30-day rolling stats (single row)
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
  )
  SELECT AVG(inflow), AVG(outflow), AVG(net), COUNT(*)
    INTO v_avg_inflow, v_avg_outflow, v_avg_net, v_active_days
  FROM daily;

  v_stats := jsonb_build_object(
    'avg_inflow', COALESCE(v_avg_inflow, 0),
    'avg_outflow', COALESCE(v_avg_outflow, 0),
    'avg_net', COALESCE(v_avg_net, 0),
    'active_days', COALESCE(v_active_days, 0)
  );

  SELECT jsonb_agg(jsonb_build_object(
           'bucket_start', d,
           'inflow_est', COALESCE(v_avg_inflow, 0),
           'outflow_est', COALESCE(v_avg_outflow, 0),
           'net_est', COALESCE(v_avg_net, 0),
           'is_estimate', true) ORDER BY d)
    INTO v_forecast
  FROM generate_series(CURRENT_DATE + 1, CURRENT_DATE + v_fdays, INTERVAL '1 day') AS gs(d);

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('report_key','treasury_cashflow','report_version','1.0.1',
      'generated_at', NOW(), 'data_cutoff', NOW(), 'generated_by_version','phase6-slice5'),
    'granularity', v_gran, 'date_from', v_from, 'date_to', v_to,
    'forecast_days', v_fdays,
    'series', COALESCE(v_series,'[]'::jsonb),
    'forecast', COALESCE(v_forecast,'[]'::jsonb),
    'forecast_stats', v_stats,
    'forecast_note','Rolling 30-day average. Historical data only. Not AI. Labeled Estimate.'
  );
END; $function$;
