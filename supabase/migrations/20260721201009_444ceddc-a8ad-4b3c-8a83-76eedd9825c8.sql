-- see /tmp/mig.sql
CREATE TABLE IF NOT EXISTS public.admin_alert_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL,
  dismissed_by uuid REFERENCES auth.users(id),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_admin_alert_dismissals_key ON public.admin_alert_dismissals (alert_key) WHERE active;
CREATE INDEX IF NOT EXISTS idx_admin_alert_dismissals_at  ON public.admin_alert_dismissals (dismissed_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.admin_alert_dismissals TO authenticated;
GRANT ALL ON public.admin_alert_dismissals TO service_role;
ALTER TABLE public.admin_alert_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_alert_dismissals_select" ON public.admin_alert_dismissals;
CREATE POLICY "admin_alert_dismissals_select" ON public.admin_alert_dismissals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
DROP POLICY IF EXISTS "admin_alert_dismissals_insert" ON public.admin_alert_dismissals;
CREATE POLICY "admin_alert_dismissals_insert" ON public.admin_alert_dismissals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
DROP POLICY IF EXISTS "admin_alert_dismissals_update" ON public.admin_alert_dismissals;
CREATE POLICY "admin_alert_dismissals_update" ON public.admin_alert_dismissals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public._admin_report_gate()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Insufficient privileges' USING ERRCODE='42501';
  END IF;
END; $fn$;

CREATE OR REPLACE FUNCTION public.report_system_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_now timestamptz := now(); v_flags jsonb; v_dq jsonb; v_recon_last jsonb;
        v_pgss boolean; v_cron boolean; v_bg jsonb := '[]'::jsonb; v_fns jsonb;
BEGIN
  PERFORM public._admin_report_gate();
  SELECT jsonb_agg(jsonb_build_object('key',key,'enabled',enabled,'description',description,'updated_at',updated_at) ORDER BY key)
    INTO v_flags FROM public.app_feature_flags;
  SELECT jsonb_build_object('total',count(*),
      'invalid',count(*) FILTER (WHERE classification='invalid'),
      'suspicious',count(*) FILTER (WHERE classification='suspicious'),
      'valid',count(*) FILTER (WHERE classification='valid'))
    INTO v_dq FROM public.v_data_quality;
  SELECT jsonb_build_object('run_at',max(created_at),'row_count',count(*))
    INTO v_recon_last FROM public.audit_events WHERE entity_type='reconciliation';
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') INTO v_pgss;
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') INTO v_cron;
  IF v_cron THEN
    BEGIN
      EXECUTE 'SELECT COALESCE(jsonb_agg(jsonb_build_object(''jobid'',jobid,''schedule'',schedule,''command'',command,''active'',active,''jobname'',jobname)),''[]''::jsonb) FROM cron.job'
        INTO v_bg;
    EXCEPTION WHEN OTHERS THEN v_bg := '[]'::jsonb; END;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('name',proname,'args',pronargs) ORDER BY proname) INTO v_fns
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND proname LIKE 'report_%';
  RETURN jsonb_build_object(
    'meta',jsonb_build_object('report_key','system_health','report_version','1.0.0','generated_at',v_now,'generated_by_version','phase6.slice7','data_cutoff',v_now),
    'db',jsonb_build_object('server_version',current_setting('server_version'),'server_version_num',current_setting('server_version_num'),'database',current_database(),'size_bytes',pg_database_size(current_database()),'now',v_now,'timezone',current_setting('TimeZone')),
    'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension),
    'feature_flags',COALESCE(v_flags,'[]'::jsonb),
    'data_quality',v_dq,
    'last_reconciliation',v_recon_last,
    'matviews',(SELECT COALESCE(jsonb_agg(jsonb_build_object('schema',schemaname,'name',matviewname)),'[]'::jsonb) FROM pg_matviews WHERE schemaname='public'),
    'report_functions',COALESCE(v_fns,'[]'::jsonb),
    'report_function_count',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname LIKE 'report_%'),
    'table_count',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),
    'view_count',(SELECT count(*) FROM information_schema.views WHERE table_schema='public'),
    'pg_stat_statements_available',v_pgss,
    'pg_cron_available',v_cron,
    'background_jobs',v_bg,
    'auth_users',(SELECT count(*) FROM auth.users),
    'user_roles_count',(SELECT count(*) FROM public.user_roles)
  );
END; $fn$;
REVOKE ALL ON FUNCTION public.report_system_health() FROM public;
GRANT EXECUTE ON FUNCTION public.report_system_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.report_reporting_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_now timestamptz := now(); v_dq jsonb; v_by_src jsonb; v_pgss jsonb := '[]'::jsonb; v_avail boolean;
BEGIN
  PERFORM public._admin_report_gate();
  SELECT jsonb_build_object(
      'total',count(*),
      'valid',count(*) FILTER (WHERE classification='valid'),
      'suspicious',count(*) FILTER (WHERE classification='suspicious'),
      'invalid',count(*) FILTER (WHERE classification='invalid'),
      'included_in_executive',count(*) FILTER (WHERE classification IN ('valid','suspicious')),
      'excluded_in_executive',count(*) FILTER (WHERE classification='invalid'))
    INTO v_dq FROM public.v_data_quality;
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.source_table) INTO v_by_src FROM (
    SELECT source_table, count(*) AS total,
      count(*) FILTER (WHERE classification='valid') AS valid,
      count(*) FILTER (WHERE classification='suspicious') AS suspicious,
      count(*) FILTER (WHERE classification='invalid') AS invalid
    FROM public.v_data_quality GROUP BY source_table
  ) t;
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') INTO v_avail;
  IF v_avail THEN
    BEGIN
      EXECUTE $q$
        SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total_ms DESC),'[]'::jsonb) FROM (
          SELECT regexp_replace(query,'\s+',' ','g') AS query, calls,
            round(total_exec_time::numeric,2) AS total_ms,
            round(mean_exec_time::numeric,2) AS mean_ms,
            round(max_exec_time::numeric,2)  AS max_ms, rows
          FROM pg_stat_statements
          WHERE query ILIKE '%report\_%' ESCAPE '\'
          ORDER BY total_exec_time DESC LIMIT 20
        ) x $q$ INTO v_pgss;
    EXCEPTION WHEN OTHERS THEN v_pgss := '[]'::jsonb; END;
  END IF;
  RETURN jsonb_build_object(
    'meta',jsonb_build_object('report_key','reporting_health','report_version','1.0.0','generated_at',v_now,'generated_by_version','phase6.slice7','data_cutoff',v_now),
    'summary',v_dq,'by_source',COALESCE(v_by_src,'[]'::jsonb),
    'report_query_stats',v_pgss,'pg_stat_statements_available',v_avail);
END; $fn$;
REVOKE ALL ON FUNCTION public.report_reporting_health() FROM public;
GRANT EXECUTE ON FUNCTION public.report_reporting_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.report_slow_queries(_limit int DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v jsonb := '[]'::jsonb; v_avail boolean;
BEGIN
  PERFORM public._admin_report_gate();
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') INTO v_avail;
  IF v_avail THEN
    BEGIN
      EXECUTE format($q$
        SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total_ms DESC),'[]'::jsonb) FROM (
          SELECT regexp_replace(query,'\s+',' ','g') AS query, calls,
            round(total_exec_time::numeric,2) AS total_ms,
            round(mean_exec_time::numeric,2) AS mean_ms,
            round(max_exec_time::numeric,2)  AS max_ms, rows
          FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT %s
        ) x $q$, GREATEST(1,LEAST(_limit,100))) INTO v;
    EXCEPTION WHEN OTHERS THEN v := '[]'::jsonb; END;
  END IF;
  RETURN jsonb_build_object(
    'meta',jsonb_build_object('report_key','slow_queries','report_version','1.0.0','generated_at',now(),'generated_by_version','phase6.slice7','data_cutoff',now()),
    'available',v_avail,'rows',v);
END; $fn$;
REVOKE ALL ON FUNCTION public.report_slow_queries(int) FROM public;
GRANT EXECUTE ON FUNCTION public.report_slow_queries(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_bi_inventory()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v jsonb;
BEGIN
  PERFORM public._admin_report_gate();
  v := jsonb_build_array(
    jsonb_build_object('key','executive','route','/reports/executive','rpc','report_executive_kpis','version','1.0.0','slice',1,'read_only',true),
    jsonb_build_object('key','operational','route','/reports/operations','rpc','report_operational_kpis','version','1.0.0','slice',1,'read_only',true),
    jsonb_build_object('key','data_quality','route','/reports/data-quality','rpc','report_data_quality_summary','version','1.0.0','slice',2,'read_only',true),
    jsonb_build_object('key','profits','route','/reports/profits','rpc','report_profit_summary/series/breakdown','version','1.0.0','slice',2,'read_only',true),
    jsonb_build_object('key','counterparties','route','/reports/counterparties','rpc','report_customer_list/supplier_list','version','1.0.1','slice',3,'read_only',true),
    jsonb_build_object('key','customer_detail','route','/reports/customers/$id','rpc','report_customer_detail','version','1.0.0','slice',3,'read_only',true),
    jsonb_build_object('key','supplier_detail','route','/reports/suppliers/$id','rpc','report_supplier_detail','version','1.0.0','slice',3,'read_only',true),
    jsonb_build_object('key','inventory','route','/reports/inventory','rpc','report_inventory_overview/lots/timeline/consumption','version','1.0.0','slice',4,'read_only',true),
    jsonb_build_object('key','inventory_lot','route','/reports/inventory/$id','rpc','report_inventory_lot_detail','version','1.0.0','slice',4,'read_only',true),
    jsonb_build_object('key','treasury','route','/reports/treasury','rpc','report_treasury_overview/cashflow/currency_exposure/bank_account_analytics','version','1.0.0','slice',5,'read_only',true),
    jsonb_build_object('key','audit_explorer','route','/reports/audit-explorer','rpc','report_audit_timeline/event_detail/actors','version','1.0.0','slice',6,'read_only',true),
    jsonb_build_object('key','admin','route','/reports/admin','rpc','report_system_health/reporting_health/slow_queries/business_alerts','version','1.0.0','slice',7,'read_only',true)
  );
  RETURN jsonb_build_object(
    'meta',jsonb_build_object('report_key','bi_inventory','report_version','1.0.0','generated_at',now(),'generated_by_version','phase6.slice7','data_cutoff',now()),
    'reports',v,
    'export_formats',jsonb_build_array('csv','excel','pdf','print'),
    'metadata_fields',jsonb_build_array('report_version','generated_at','generated_by_version','quality_mode','rows_included','rows_excluded','data_cutoff'));
END; $fn$;
REVOKE ALL ON FUNCTION public.report_bi_inventory() FROM public;
GRANT EXECUTE ON FUNCTION public.report_bi_inventory() TO authenticated;

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

  WITH d AS (SELECT count(*) AS n, COALESCE(sum(remaining_cost),0) AS cost_aed FROM public.v_inventory_lots_ext WHERE status='active' AND remaining_amount>0 AND age_days > v_dorm_inv)
  SELECT v_alerts || (CASE WHEN d.n>0 THEN jsonb_build_array(jsonb_build_object(
    'key','inventory.dormant','category','dormant_inventory',
    'level', CASE WHEN d.n>20 THEN 'critical' WHEN d.n>5 THEN 'warning' ELSE 'info' END,
    'title', format('%s dormant lots (>%s days)', d.n, v_dorm_inv),
    'message', format('Locked capital = AED %s', round(d.cost_aed,2)),
    'metric', jsonb_build_object('lots',d.n,'cost_aed',round(d.cost_aed,2),'days',v_dorm_inv),
    'raised_at', v_now)) ELSE '[]'::jsonb END) INTO v_alerts FROM d;

  WITH d AS (SELECT currency, sum(remaining_amount) AS rem FROM public.v_inventory_lots_ext WHERE status='active' GROUP BY currency HAVING sum(remaining_amount) < 1000)
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

  WITH d AS (SELECT currency, sum(remaining_amount) AS pos FROM public.v_inventory_lots_ext WHERE status='active' GROUP BY currency HAVING sum(remaining_amount) > 1000000)
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
    'meta',jsonb_build_object('report_key','business_alerts','report_version','1.0.0','generated_at',v_now,'generated_by_version','phase6.slice7','data_cutoff',v_now),
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

CREATE OR REPLACE FUNCTION public.admin_alert_dismiss(_key text, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_id uuid;
BEGIN
  PERFORM public._admin_report_gate();
  UPDATE public.admin_alert_dismissals SET active=false WHERE alert_key=_key AND active;
  INSERT INTO public.admin_alert_dismissals(alert_key,dismissed_by,reason) VALUES (_key,auth.uid(),_reason) RETURNING id INTO v_id;
  RETURN v_id;
END; $fn$;
REVOKE ALL ON FUNCTION public.admin_alert_dismiss(text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_alert_dismiss(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_alert_undismiss(_key text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_n int;
BEGIN
  PERFORM public._admin_report_gate();
  UPDATE public.admin_alert_dismissals SET active=false WHERE alert_key=_key AND active;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END; $fn$;
REVOKE ALL ON FUNCTION public.admin_alert_undismiss(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_alert_undismiss(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_alert_dismiss_history(_limit int DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v jsonb;
BEGIN
  PERFORM public._admin_report_gate();
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.dismissed_at DESC),'[]'::jsonb) INTO v FROM (
    SELECT id, alert_key, dismissed_by, dismissed_at, reason, active
    FROM public.admin_alert_dismissals ORDER BY dismissed_at DESC LIMIT GREATEST(1,LEAST(_limit,1000))) x;
  RETURN jsonb_build_object(
    'meta',jsonb_build_object('report_key','alert_history','report_version','1.0.0','generated_at',now(),'generated_by_version','phase6.slice7','data_cutoff',now()),
    'rows',v);
END; $fn$;
REVOKE ALL ON FUNCTION public.admin_alert_dismiss_history(int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_alert_dismiss_history(int) TO authenticated;

COMMENT ON FUNCTION public.report_system_health()      IS 'Phase 6 Slice 7 v1.0.0 - READ-ONLY system health snapshot.';
COMMENT ON FUNCTION public.report_reporting_health()   IS 'Phase 6 Slice 7 v1.0.0 - READ-ONLY reporting-layer health.';
COMMENT ON FUNCTION public.report_slow_queries(int)    IS 'Phase 6 Slice 7 v1.0.0 - READ-ONLY pg_stat_statements top offenders.';
COMMENT ON FUNCTION public.report_bi_inventory()       IS 'Phase 6 Slice 7 v1.0.0 - READ-ONLY registry of BI reports.';
COMMENT ON FUNCTION public.report_business_alerts(boolean,jsonb) IS 'Phase 6 Slice 7 v1.0.0 - READ-ONLY deterministic alerts. Never mutates.';
COMMENT ON TABLE public.admin_alert_dismissals IS 'Slice 7 alert metadata only - never affects financial data.';