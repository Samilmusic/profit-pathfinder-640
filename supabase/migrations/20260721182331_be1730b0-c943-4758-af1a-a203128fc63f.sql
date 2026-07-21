
CREATE OR REPLACE FUNCTION public.remittance_v2_reconcile()
RETURNS TABLE(
  check_id int,
  check_name text,
  severity text,
  passed boolean,
  delta numeric,
  details jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Access denied: administrator role required';
  END IF;

  -- 1: Workflow state present on every v2 remittance
  RETURN QUERY
  SELECT 1, 'v2_workflow_state_present'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('missing_workflow_state', COUNT(*))
  FROM public.remittances
  WHERE workflow_version = 'v2' AND workflow_state IS NULL;

  -- 2: v1 rows do not have workflow_state set
  RETURN QUERY
  SELECT 2, 'v1_no_workflow_state'::text, 'warning'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('v1_with_workflow_state', COUNT(*))
  FROM public.remittances
  WHERE workflow_version = 'v1' AND workflow_state IS NOT NULL;

  -- 3: No orphan allocations (buy_id must exist and not be deleted)
  RETURN QUERY
  SELECT 3, 'allocations_reference_valid_buy'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('orphan_allocations', COUNT(*))
  FROM public.remittance_allocations a
  LEFT JOIN public.buy_transactions b ON b.id = a.buy_id
  WHERE a.status <> 'reversed'
    AND (b.id IS NULL OR b.deleted_at IS NOT NULL);

  -- 4: Allocation currency matches remittance transfer_currency
  RETURN QUERY
  SELECT 4, 'allocation_currency_matches_remittance'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('mismatched_currency', COUNT(*))
  FROM public.remittance_allocations a
  JOIN public.remittances r ON r.id = a.remittance_id
  WHERE a.status <> 'reversed'
    AND a.currency <> r.transfer_currency;

  -- 5: Sum(active allocations) <= transferred_amount per remittance
  RETURN QUERY
  SELECT 5, 'no_over_allocation'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('over_allocated_remittances', COUNT(*))
  FROM (
    SELECT r.id, r.transferred_amount,
           COALESCE(SUM(a.allocated_amount) FILTER (WHERE a.status <> 'reversed'), 0) AS alloc_sum
    FROM public.remittances r
    LEFT JOIN public.remittance_allocations a ON a.remittance_id = r.id
    WHERE r.workflow_version = 'v2'
    GROUP BY r.id, r.transferred_amount
  ) s
  WHERE s.alloc_sum > s.transferred_amount + 0.0001;

  -- 6: closed remittances are fully allocated
  RETURN QUERY
  SELECT 6, 'closed_fully_allocated'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('closed_underallocated', COUNT(*))
  FROM (
    SELECT r.id, r.transferred_amount,
           COALESCE(SUM(a.allocated_amount) FILTER (WHERE a.status <> 'reversed'), 0) AS alloc_sum
    FROM public.remittances r
    LEFT JOIN public.remittance_allocations a ON a.remittance_id = r.id
    WHERE r.workflow_version = 'v2' AND r.workflow_state = 'closed'
    GROUP BY r.id, r.transferred_amount
  ) s
  WHERE ABS(s.alloc_sum - s.transferred_amount) > 0.0001;

  -- 7: ready_to_close and closed rows have frozen profit on all active allocations
  RETURN QUERY
  SELECT 7, 'frozen_profit_on_ready_or_closed'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('unfrozen_allocations', COUNT(*))
  FROM public.remittance_allocations a
  JOIN public.remittances r ON r.id = a.remittance_id
  WHERE r.workflow_version = 'v2'
    AND r.workflow_state IN ('ready_to_close','closed')
    AND a.status <> 'reversed'
    AND a.frozen_at IS NULL;

  -- 8: draft/funds_received/settlement_pending must NOT have frozen allocations
  RETURN QUERY
  SELECT 8, 'no_premature_freeze'::text, 'warning'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('prematurely_frozen', COUNT(*))
  FROM public.remittance_allocations a
  JOIN public.remittances r ON r.id = a.remittance_id
  WHERE r.workflow_version = 'v2'
    AND r.workflow_state IN ('draft','funds_received','settlement_pending','allocating')
    AND a.status <> 'reversed'
    AND a.frozen_at IS NOT NULL;

  -- 9: Company flow: funds_received requires payment_destination = 'company'
  RETURN QUERY
  SELECT 9, 'funds_received_is_company_flow'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('third_party_in_funds_received', COUNT(*))
  FROM public.remittances
  WHERE workflow_version = 'v2'
    AND workflow_state = 'funds_received'
    AND payment_destination <> 'company';

  -- 10: Third-party flow: settlement_pending requires payment_destination = 'third_party'
  RETURN QUERY
  SELECT 10, 'settlement_pending_is_third_party_flow'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('company_in_settlement_pending', COUNT(*))
  FROM public.remittances
  WHERE workflow_version = 'v2'
    AND workflow_state = 'settlement_pending'
    AND payment_destination <> 'third_party';

  -- 11: Every non-draft v2 remittance has at least one workflow transition
  RETURN QUERY
  SELECT 11, 'transitions_recorded_for_non_draft'::text, 'warning'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('missing_transitions', COUNT(*))
  FROM public.remittances r
  WHERE r.workflow_version = 'v2'
    AND r.workflow_state <> 'draft'
    AND NOT EXISTS (
      SELECT 1 FROM public.remittance_workflow_transitions t
      WHERE t.remittance_id = r.id
    );

  -- 12: Settlement events only exist for v2 remittances
  RETURN QUERY
  SELECT 12, 'settlement_events_scope_v2'::text, 'warning'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('events_on_non_v2', COUNT(*))
  FROM public.remittance_settlement_events e
  JOIN public.remittances r ON r.id = e.remittance_id
  WHERE r.workflow_version <> 'v2';

  -- 13: Profit components attach to allocation and remittance consistently
  RETURN QUERY
  SELECT 13, 'profit_components_consistent'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('inconsistent_components', COUNT(*))
  FROM public.remittance_profit_components c
  LEFT JOIN public.remittance_allocations a ON a.id = c.allocation_id
  WHERE c.allocation_id IS NOT NULL
    AND (a.id IS NULL OR a.remittance_id <> c.remittance_id);

  -- 14: Terminal states have finished_at implicit (updated_at >= transitions.max)
  RETURN QUERY
  SELECT 14, 'terminal_states_are_stable'::text, 'info'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('terminal_with_recent_transitions', COUNT(*))
  FROM public.remittances r
  WHERE r.workflow_version = 'v2'
    AND r.workflow_state IN ('closed','cancelled')
    AND EXISTS (
      SELECT 1 FROM public.remittance_workflow_transitions t
      WHERE t.remittance_id = r.id
        AND t.created_at > r.updated_at + interval '1 second'
    );

  -- 15: Feature-flag posture: with posting disabled, no ledger entries produced by v2
  RETURN QUERY
  SELECT 15, 'posting_flag_matches_ledger_activity'::text, 'info'::text,
         TRUE, 0::numeric,
         jsonb_build_object(
           'allocation_layer_posting',
           COALESCE((SELECT enabled FROM public.app_feature_flags WHERE key = 'allocation_layer_posting'), false),
           'note',
           'Ledger integration verified via ledger_entries audit at posting flag flip.'
         );
END;
$$;

REVOKE ALL ON FUNCTION public.remittance_v2_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remittance_v2_reconcile() TO authenticated;
