
CREATE OR REPLACE FUNCTION public.report_profit_series(
  _quality_mode text DEFAULT 'exclude_invalid',
  _granularity text DEFAULT 'day',
  _from date DEFAULT NULL, _to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q_mode text := lower(COALESCE(_quality_mode,'exclude_invalid'));
  gran text := lower(COALESCE(_granularity,'day'));
  d_from date := COALESCE(_from, (date_trunc('year', now()) - interval '1 year')::date);
  d_to date := COALESCE(_to, (now() AT TIME ZONE 'UTC')::date);
  series jsonb; rows_total bigint; rows_included bigint;
BEGIN
  IF q_mode NOT IN ('all','exclude_invalid','exclude_suspicious') THEN
    RAISE EXCEPTION 'invalid quality_mode %', _quality_mode; END IF;
  IF gran NOT IN ('day','week','month','year') THEN
    RAISE EXCEPTION 'invalid granularity % (day|week|month|year)', _granularity; END IF;

  SELECT COUNT(*) INTO rows_total FROM public.v_profit_events
   WHERE event_date BETWEEN d_from AND d_to;
  SELECT COUNT(*) INTO rows_included FROM public.v_profit_events
   WHERE event_date BETWEEN d_from AND d_to
     AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'));

  WITH agg AS (
    SELECT date_trunc(gran, event_date)::date AS bucket_start,
           SUM(amount_aed) AS profit_aed,
           COUNT(*)::bigint AS events
    FROM public.v_profit_events
    WHERE event_date BETWEEN d_from AND d_to
      AND (q_mode='all' OR (q_mode='exclude_invalid' AND classification<>'invalid') OR (q_mode='exclude_suspicious' AND classification='valid'))
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bucket_start', bucket_start,
    'profit_aed',   profit_aed,
    'events',       events
  ) ORDER BY bucket_start), '[]'::jsonb) INTO series FROM agg;

  RETURN jsonb_build_object(
    'meta', public.report_meta('profit_series','phase6.slice2'),
    'quality_mode', q_mode, 'granularity', gran,
    'date_from', d_from, 'date_to', d_to,
    'rows_included', rows_included,
    'rows_excluded', rows_total - rows_included,
    'series', series);
END $$;
