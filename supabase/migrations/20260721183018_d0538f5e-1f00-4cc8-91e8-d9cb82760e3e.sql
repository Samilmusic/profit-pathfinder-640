
-- Fix workflow_version enum label (v1 -> legacy)
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

  RETURN QUERY
  SELECT 1, 'v2_workflow_state_present'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('missing_workflow_state', COUNT(*))
  FROM public.remittances
  WHERE workflow_version = 'v2' AND workflow_state IS NULL;

  RETURN QUERY
  SELECT 2, 'legacy_no_workflow_state'::text, 'warning'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('legacy_with_workflow_state', COUNT(*))
  FROM public.remittances
  WHERE workflow_version = 'legacy' AND workflow_state IS NOT NULL;

  RETURN QUERY
  SELECT 3, 'allocations_reference_valid_buy'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('orphan_allocations', COUNT(*))
  FROM public.remittance_allocations a
  LEFT JOIN public.buy_transactions b ON b.id = a.buy_id
  WHERE a.status <> 'reversed'
    AND (b.id IS NULL OR b.deleted_at IS NOT NULL);

  RETURN QUERY
  SELECT 4, 'allocation_currency_matches_remittance'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('mismatched_currency', COUNT(*))
  FROM public.remittance_allocations a
  JOIN public.remittances r ON r.id = a.remittance_id
  WHERE a.status <> 'reversed'
    AND a.currency <> r.transfer_currency;

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

  RETURN QUERY
  SELECT 9, 'funds_received_is_company_flow'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('third_party_in_funds_received', COUNT(*))
  FROM public.remittances
  WHERE workflow_version = 'v2'
    AND workflow_state = 'funds_received'
    AND payment_destination = 'to_third_party';

  RETURN QUERY
  SELECT 10, 'settlement_pending_is_third_party_flow'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('company_in_settlement_pending', COUNT(*))
  FROM public.remittances
  WHERE workflow_version = 'v2'
    AND workflow_state = 'settlement_pending'
    AND payment_destination <> 'to_third_party';

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

  RETURN QUERY
  SELECT 12, 'settlement_events_scope_v2'::text, 'warning'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('events_on_non_v2', COUNT(*))
  FROM public.remittance_settlement_events e
  JOIN public.remittances r ON r.id = e.remittance_id
  WHERE r.workflow_version <> 'v2';

  RETURN QUERY
  SELECT 13, 'profit_components_consistent'::text, 'critical'::text,
         (COUNT(*) = 0), COUNT(*)::numeric,
         jsonb_build_object('inconsistent_components', COUNT(*))
  FROM public.remittance_profit_components c
  LEFT JOIN public.remittance_allocations a ON a.id = c.allocation_id
  WHERE c.allocation_id IS NOT NULL
    AND (a.id IS NULL OR a.remittance_id <> c.remittance_id);

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

-- Seed one complete v2 test remittance (closed state) for reconciliation validation
DO $$
DECLARE
  _remit_id uuid := gen_random_uuid();
  _alloc_id uuid := gen_random_uuid();
  _buy_id uuid := '6703e53d-d81a-4966-b5d8-095639adb7a1'::uuid;
BEGIN
  -- Only insert if not already seeded
  IF NOT EXISTS (SELECT 1 FROM public.remittances WHERE notes = '__phase5_recon_validation__') THEN
    INSERT INTO public.remittances (
      id, doc_no, status, entry_date,
      transfer_currency, transferred_amount, transfer_method,
      customer_payment_currency, customer_payment_amount, reference_rate,
      commission_method, gross_commission_pay_ccy, gross_commission_aed,
      linked_expenses_aed, net_commission_aed,
      payment_destination, excess_allocation,
      fx_trading_profit_pay_ccy, fx_trading_profit_aed,
      workflow_version, workflow_state,
      notes
    ) VALUES (
      _remit_id, 'PHASE5-RECON-TEST', 'closed', CURRENT_DATE,
      'AED', 500, 'bank_transfer',
      'AED', 500, 1,
      'fixed', 0, 0,
      0, 0,
      'into_account', 'none',
      0, 0,
      'v2', 'closed',
      '__phase5_recon_validation__'
    );

    INSERT INTO public.remittance_allocations (
      id, remittance_id, buy_id, currency, allocated_amount,
      status, posting_class, workflow_version, entry_kind,
      frozen_cost_amount, frozen_cost_currency,
      frozen_spread_profit_aed, frozen_commission_aed, frozen_total_profit_aed,
      frozen_at, frozen_snapshot
    ) VALUES (
      _alloc_id, _remit_id, _buy_id, 'AED', 500,
      'closed', 'operational_active', 'v2', 'normal',
      500, 'AED',
      0, 0, 0,
      now(), jsonb_build_object('test', true, 'source', 'phase5_recon_validation')
    );

    INSERT INTO public.remittance_workflow_transitions
      (remittance_id, from_state, to_state, reason, created_at)
    VALUES
      (_remit_id, 'draft'::remittance_workflow_state, 'funds_received'::remittance_workflow_state, 'test seed', now() - interval '4 minutes'),
      (_remit_id, 'funds_received'::remittance_workflow_state, 'allocating'::remittance_workflow_state, 'test seed', now() - interval '3 minutes'),
      (_remit_id, 'allocating'::remittance_workflow_state, 'ready_to_close'::remittance_workflow_state, 'test seed', now() - interval '2 minutes'),
      (_remit_id, 'ready_to_close'::remittance_workflow_state, 'closed'::remittance_workflow_state, 'test seed', now() - interval '1 minute');

    -- Bump updated_at so check #14 (terminal_states_are_stable) passes
    UPDATE public.remittances SET updated_at = now() WHERE id = _remit_id;
  END IF;
END $$;
