
-- ============================================================
-- Phase 6 Slice 6 — Audit Explorer (READ-ONLY)
-- Version: 1.0.0
-- No writes. No workflow / settlement / posting changes.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at
  ON public.ledger_entries (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON public.audit_events (actor_id, created_at DESC);

-- ------------------------------------------------------------
-- Unified timeline view
-- Columns: kind, source_table, source_id, event_id, created_at,
--          actor_id, entity_type, entity_id, action, summary,
--          before, after, reason, correlation_id
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_audit_timeline AS
-- Workflow state transitions
SELECT
  'workflow'::text                          AS kind,
  'remittance_workflow_transitions'::text   AS source_table,
  t.id                                      AS source_id,
  ('workflow:' || t.id::text)               AS event_id,
  t.created_at                              AS created_at,
  t.actor                                   AS actor_id,
  'remittance'::text                        AS entity_type,
  t.remittance_id                           AS entity_id,
  ('transition:' || COALESCE(t.from_state::text,'∅') || '→' || t.to_state::text) AS action,
  ('Workflow ' || COALESCE(t.from_state::text,'(start)') || ' → ' || t.to_state::text) AS summary,
  jsonb_build_object('state', t.from_state) AS before,
  jsonb_build_object('state', t.to_state)   AS after,
  t.reason                                  AS reason,
  t.remittance_id                           AS correlation_id
FROM public.remittance_workflow_transitions t
UNION ALL
-- Settlement events
SELECT
  'settlement',
  'remittance_settlement_events',
  s.id,
  ('settlement:' || s.id::text),
  s.created_at,
  s.actor,
  'remittance',
  s.remittance_id,
  s.event_type,
  ('Settlement event: ' || s.event_type),
  NULL::jsonb,
  s.payload,
  NULLIF(s.payload->>'reason',''),
  s.remittance_id
FROM public.remittance_settlement_events s
UNION ALL
-- Audit events (allocation / posting / profit / entity / permission / feature flag)
SELECT
  CASE
    WHEN a.entity_type = 'app_feature_flags'                              THEN 'feature_flag'
    WHEN a.entity_type = 'user_roles'                                     THEN 'permission'
    WHEN a.entity_type = 'remittance_allocations'
         AND (a.new_value->>'entry_kind') = 'reversal'                    THEN 'reversal'
    WHEN a.entity_type = 'remittance_allocations'                         THEN 'allocation'
    WHEN a.entity_type = 'sell_transactions' AND a.action = 'profit_frozen' THEN 'profit'
    ELSE 'entity_change'
  END                                        AS kind,
  'audit_events'::text                       AS source_table,
  a.id                                       AS source_id,
  ('audit:' || a.id::text)                   AS event_id,
  a.created_at,
  a.actor_id,
  a.entity_type,
  a.entity_id,
  a.action,
  (a.entity_type || ' ' || a.action)         AS summary,
  a.old_value,
  a.new_value,
  a.reason,
  a.entity_id
FROM public.audit_events a
UNION ALL
-- Ledger postings
SELECT
  'posting',
  'ledger_entries',
  l.id,
  ('posting:' || l.id::text),
  l.created_at,
  NULL::uuid,
  l.ref_type::text,
  l.ref_id,
  'ledger_post',
  ('Ledger ' || l.ref_type::text || ' ' || l.currency || ' ' || l.amount::text),
  NULL::jsonb,
  jsonb_build_object(
    'account_id', l.account_id,
    'currency',   l.currency,
    'amount',     l.amount,
    'ref_type',   l.ref_type,
    'ref_id',     l.ref_id,
    'entry_date', l.entry_date,
    'description', l.description
  ),
  l.description,
  l.ref_id
FROM public.ledger_entries l;

COMMENT ON VIEW public.v_audit_timeline IS
  'Phase 6 Slice 6 v1.0.0 — read-only unified audit timeline. Union of workflow transitions, settlement events, audit_events, and ledger postings.';

-- ------------------------------------------------------------
-- Timeline RPC — paginated, filterable, admin-only
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_audit_timeline(
  _limit         integer DEFAULT 100,
  _cursor_ts     timestamptz DEFAULT NULL,
  _cursor_id     uuid DEFAULT NULL,
  _kinds         text[] DEFAULT NULL,
  _actor         uuid DEFAULT NULL,
  _entity_type   text DEFAULT NULL,
  _entity_id     uuid DEFAULT NULL,
  _from          timestamptz DEFAULT NULL,
  _to            timestamptz DEFAULT NULL,
  _search        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows        jsonb;
  _lim         integer := LEAST(GREATEST(COALESCE(_limit,100),1), 500);
  _report_meta jsonb;
  _needle      text := NULLIF(trim(COALESCE(_search,'')), '');
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'manager'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH filtered AS (
    SELECT *
    FROM public.v_audit_timeline t
    WHERE (_kinds       IS NULL OR t.kind = ANY(_kinds))
      AND (_actor       IS NULL OR t.actor_id = _actor)
      AND (_entity_type IS NULL OR t.entity_type = _entity_type)
      AND (_entity_id   IS NULL OR t.entity_id = _entity_id)
      AND (_from        IS NULL OR t.created_at >= _from)
      AND (_to          IS NULL OR t.created_at <  _to)
      AND (
        _cursor_ts IS NULL
        OR t.created_at <  _cursor_ts
        OR (t.created_at = _cursor_ts AND t.source_id < COALESCE(_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
      AND (
        _needle IS NULL
        OR t.summary   ILIKE '%'||_needle||'%'
        OR t.action    ILIKE '%'||_needle||'%'
        OR COALESCE(t.reason,'') ILIKE '%'||_needle||'%'
        OR t.after::text  ILIKE '%'||_needle||'%'
        OR t.before::text ILIKE '%'||_needle||'%'
      )
    ORDER BY t.created_at DESC, t.source_id DESC
    LIMIT _lim
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb) INTO _rows FROM filtered f;

  _report_meta := jsonb_build_object(
    'report_key',           'audit_timeline',
    'report_version',       '1.0.0',
    'generated_at',         now(),
    'data_cutoff',          now(),
    'generated_by_version', '1.0.0'
  );

  RETURN jsonb_build_object(
    'meta',       _report_meta,
    'limit',      _lim,
    'rows',       _rows,
    'has_more',   jsonb_array_length(_rows) = _lim,
    'next_cursor',
      CASE WHEN jsonb_array_length(_rows) = _lim THEN
        jsonb_build_object(
          'ts', (_rows -> (jsonb_array_length(_rows)-1) ->> 'created_at'),
          'id', (_rows -> (jsonb_array_length(_rows)-1) ->> 'source_id')
        )
      ELSE NULL END
  );
END;
$$;

COMMENT ON FUNCTION public.report_audit_timeline IS
  'Phase 6 Slice 6 v1.0.0 — admin/manager only, keyset-paginated unified audit timeline.';

-- ------------------------------------------------------------
-- Event detail RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_audit_event_detail(
  _kind text,
  _id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event   jsonb;
  _related jsonb := '[]'::jsonb;
  _rid     uuid;
  _actor_profile jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'manager'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(t) INTO _event
  FROM public.v_audit_timeline t
  WHERE t.kind = _kind AND t.source_id = _id
  LIMIT 1;

  IF _event IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  _rid := (_event->>'correlation_id')::uuid;

  -- Related records within the same correlation_id (window of 20 nearby)
  IF _rid IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
      INTO _related
    FROM (
      SELECT * FROM public.v_audit_timeline
      WHERE correlation_id = _rid
        AND event_id <> (_event->>'event_id')
      ORDER BY created_at DESC
      LIMIT 25
    ) r;
  END IF;

  -- Actor profile
  SELECT to_jsonb(p) INTO _actor_profile
  FROM public.profiles p
  WHERE p.id = (_event->>'actor_id')::uuid;

  RETURN jsonb_build_object(
    'found',   true,
    'event',   _event,
    'actor',   _actor_profile,
    'related', _related,
    'meta', jsonb_build_object(
      'report_key','audit_event_detail',
      'report_version','1.0.0',
      'generated_at', now(),
      'data_cutoff', now(),
      'generated_by_version','1.0.0'
    )
  );
END;
$$;

COMMENT ON FUNCTION public.report_audit_event_detail IS
  'Phase 6 Slice 6 v1.0.0 — drill-down for one audit timeline event with related records and actor profile.';

-- ------------------------------------------------------------
-- Actor picker
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_audit_actors()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'manager'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.display_name NULLS LAST, p.email NULLS LAST), '[]'::jsonb)
    INTO _rows
  FROM public.profiles p
  WHERE p.id IN (
    SELECT DISTINCT actor_id FROM public.v_audit_timeline WHERE actor_id IS NOT NULL
  );

  RETURN _rows;
END;
$$;

COMMENT ON FUNCTION public.report_audit_actors IS
  'Phase 6 Slice 6 v1.0.0 — distinct actors present in the audit timeline.';

GRANT EXECUTE ON FUNCTION public.report_audit_timeline(integer,timestamptz,uuid,text[],uuid,text,uuid,timestamptz,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_audit_event_detail(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_audit_actors() TO authenticated;
GRANT SELECT ON public.v_audit_timeline TO authenticated;
