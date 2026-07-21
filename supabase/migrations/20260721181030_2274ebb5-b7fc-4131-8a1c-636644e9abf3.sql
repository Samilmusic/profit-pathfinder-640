
-- =====================================================================
-- Phase 4F — Allocation lifecycle: prepare_close / finalize_close split,
-- reverse hardening, cancel narrowing.
-- All RPCs keep the same lock order (remittance -> buy) and idempotency
-- contract established in Phases 4B–4E. Both feature flags remain OFF.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. allocate_buy: never auto-transition to ready_to_close.
--    prepare_close is now the sole path to ready_to_close.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_allocate_buy(
  _remittance_id uuid, _buy_id uuid, _amount numeric,
  _notes text DEFAULT NULL, _client_request_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD; b RECORD; alloc_id uuid; remaining numeric; already numeric;
  required numeric; prior jsonb;
BEGIN
  PERFORM public._assert_role('operator');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0' USING ERRCODE = 'invalid_amount';
  END IF;

  IF _client_request_id IS NOT NULL THEN
    prior := public._idem_lookup(_client_request_id);
    IF prior IS NOT NULL THEN RETURN (prior->>'allocation_id')::uuid; END IF;
  END IF;

  -- LOCK ORDER: remittance -> buy.
  SELECT * INTO r FROM public.remittances WHERE id=_remittance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _remittance_id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _remittance_id USING ERRCODE = 'not_v2';
  END IF;
  IF r.workflow_state NOT IN ('funds_received','settlement_pending','allocating') THEN
    RAISE EXCEPTION 'allocate_buy not permitted in state %', r.workflow_state
      USING ERRCODE = 'invalid_state';
  END IF;

  SELECT * INTO b FROM public.buy_transactions WHERE id=_buy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'buy % not found', _buy_id; END IF;
  IF b.bought_currency <> r.transfer_currency THEN
    RAISE EXCEPTION 'buy currency % must match remittance transfer currency %',
      b.bought_currency, r.transfer_currency USING ERRCODE = 'currency_mismatch';
  END IF;

  -- Per-buy capacity, recomputed under lock.
  SELECT COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='normal'
                            AND a.reversed_by_id IS NULL
                            AND a.status <> 'void'), 0)
       - COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='reversal'), 0)
    INTO already
    FROM public.remittance_allocations a WHERE a.buy_id=_buy_id;

  remaining := b.bought_amount - already;
  IF _amount > remaining THEN
    RAISE EXCEPTION 'buy_over_allocated: requested % but remaining %',
      _amount, remaining USING ERRCODE='P0001';
  END IF;

  -- Per-remittance ceiling.
  required := COALESCE(r.transferred_amount, 0);
  SELECT COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='normal'
                            AND a.reversed_by_id IS NULL
                            AND a.status <> 'void'), 0)
       - COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='reversal'), 0)
    INTO already
    FROM public.remittance_allocations a WHERE a.remittance_id=_remittance_id;
  IF already + _amount > required THEN
    RAISE EXCEPTION 'remittance_over_allocated: required % already allocated % requested %',
      required, already, _amount USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.remittance_allocations(
    remittance_id, buy_id, currency, allocated_amount,
    status, posting_class, workflow_version, entry_kind, notes, created_by
  ) VALUES (
    _remittance_id, _buy_id, r.transfer_currency, _amount,
    'open','shadow','v2','normal', _notes, auth.uid()
  ) RETURNING id INTO alloc_id;

  -- State: always park in 'allocating'. prepare_close is the ONLY route to ready_to_close.
  IF r.workflow_state <> 'allocating' THEN
    UPDATE public.remittances SET workflow_state='allocating', updated_at=now()
     WHERE id=_remittance_id;
  ELSE
    UPDATE public.remittances SET updated_at=now() WHERE id=_remittance_id;
  END IF;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  VALUES (_remittance_id,'buy_allocated',
          jsonb_build_object('allocation_id',alloc_id,'buy_id',_buy_id,'amount',_amount),
          auth.uid());

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,'remittance_v2_allocate_buy',
                               jsonb_build_object('allocation_id',alloc_id));
  END IF;
  RETURN alloc_id;
END $$;

-- ---------------------------------------------------------------------
-- 2. prepare_close: allocating -> ready_to_close. Freezes all profit.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_prepare_close(
  _id uuid, _note text DEFAULT NULL, _client_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD; a RECORD; b RECORD;
  allocated numeric; required numeric;
  cost_native numeric; cost_aed numeric;
  customer_native numeric; customer_aed numeric;
  spread_aed numeric; commission_aed numeric;
  total_aed numeric; alloc_share numeric;
  buy_ids uuid[];
BEGIN
  PERFORM public._assert_role('manager');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _client_request_id IS NOT NULL
     AND public._idem_lookup(_client_request_id) IS NOT NULL THEN RETURN; END IF;

  -- LOCK ORDER: remittance first, then buys in ascending UUID order.
  SELECT * INTO r FROM public.remittances WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _id USING ERRCODE = 'not_v2';
  END IF;
  IF r.workflow_state <> 'allocating' THEN
    RAISE EXCEPTION 'prepare_close requires allocating (was %)', r.workflow_state
      USING ERRCODE = 'invalid_state';
  END IF;

  SELECT array_agg(buy_id ORDER BY buy_id)
    INTO buy_ids
    FROM (
      SELECT DISTINCT buy_id
        FROM public.remittance_allocations
       WHERE remittance_id=_id AND buy_id IS NOT NULL
    ) s;
  IF buy_ids IS NOT NULL THEN
    PERFORM 1 FROM public.buy_transactions
      WHERE id = ANY(buy_ids) ORDER BY id FOR UPDATE;
  END IF;

  required := COALESCE(r.transferred_amount,0);
  SELECT COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='normal'
                            AND a.reversed_by_id IS NULL
                            AND a.status <> 'void'), 0)
       - COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='reversal'), 0)
    INTO allocated
    FROM public.remittance_allocations a WHERE a.remittance_id=_id;
  IF allocated <> required THEN
    RAISE EXCEPTION 'prepare_close blocked: allocated % <> required %', allocated, required
      USING ERRCODE = 'not_fully_allocated';
  END IF;

  -- Freeze each active normal allocation.
  FOR a IN
    SELECT * FROM public.remittance_allocations
     WHERE remittance_id=_id AND entry_kind='normal'
       AND reversed_by_id IS NULL AND status='open'
  LOOP
    SELECT * INTO b FROM public.buy_transactions WHERE id=a.buy_id;

    cost_native  := a.allocated_amount * b.buy_rate;
    cost_aed     := CASE WHEN b.paid_currency='AED' THEN cost_native ELSE NULL END;

    alloc_share  := CASE WHEN required=0 THEN 0
                         ELSE a.allocated_amount / required END;

    customer_native := COALESCE(r.customer_payment_amount,0) * alloc_share;
    customer_aed    := CASE WHEN r.customer_payment_currency='AED' THEN customer_native
                            WHEN r.reference_rate IS NOT NULL
                             AND r.customer_payment_currency='IRR'
                              THEN customer_native / NULLIF(r.reference_rate,0)
                            ELSE NULL END;

    spread_aed     := CASE WHEN customer_aed IS NOT NULL AND cost_aed IS NOT NULL
                             THEN customer_aed - cost_aed
                           ELSE 0 END;

    commission_aed := COALESCE(r.net_commission_aed,0) * alloc_share;

    total_aed := spread_aed + commission_aed + 0 - 0;

    UPDATE public.remittance_allocations
       SET frozen_cost_amount           = cost_native,
           frozen_cost_currency         = b.paid_currency,
           frozen_spread_profit_aed     = spread_aed,
           frozen_commission_aed        = commission_aed,
           frozen_total_profit_aed      = total_aed,
           frozen_at                    = now(),
           frozen_by                    = auth.uid(),
           frozen_snapshot              = jsonb_build_object(
             'buy_rate', b.buy_rate,
             'buy_paid_currency', b.paid_currency,
             'customer_payment_currency', r.customer_payment_currency,
             'reference_rate', r.reference_rate,
             'alloc_share', alloc_share,
             'model','spread+commission+fx-expenses',
             'fx_trading_aed', 0,
             'expenses_aed', 0
           ),
           status='closed',
           updated_at=now()
     WHERE id=a.id;

    INSERT INTO public.remittance_profit_components(
      remittance_id, allocation_id, component_type, currency, amount, amount_aed,
      entry_kind, posting_class, workflow_version, reference_note
    ) VALUES
      (_id,a.id,'cost',        b.paid_currency, cost_native,    COALESCE(cost_aed,0),    'normal',a.posting_class,'v2','Phase 4F prepare_close'),
      (_id,a.id,'spread',      'AED',           spread_aed,     spread_aed,              'normal',a.posting_class,'v2','Phase 4F prepare_close'),
      (_id,a.id,'commission',  'AED',           commission_aed, commission_aed,          'normal',a.posting_class,'v2','Phase 4F prepare_close'),
      (_id,a.id,'fx_trading',  'AED',           0,              0,                        'normal',a.posting_class,'v2','placeholder - later sub-phase'),
      (_id,a.id,'expense',     'AED',           0,              0,                        'normal',a.posting_class,'v2','placeholder - later sub-phase');
  END LOOP;

  UPDATE public.remittances
     SET workflow_state='ready_to_close', updated_at=now()
   WHERE id=_id;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  VALUES (_id,'prepared_close', jsonb_build_object('note',_note), auth.uid());

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,'remittance_v2_prepare_close',
                               jsonb_build_object('ok',true));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. finalize_close: ready_to_close -> closed. Irreversible.
--    No re-freezing, no re-computation. Verifies invariants only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_finalize_close(
  _id uuid, _note text DEFAULT NULL, _client_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD; unfrozen_count integer; allocated numeric; required numeric;
  posting_active boolean;
BEGIN
  PERFORM public._assert_role('manager');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _client_request_id IS NOT NULL
     AND public._idem_lookup(_client_request_id) IS NOT NULL THEN RETURN; END IF;

  SELECT enabled INTO posting_active FROM public.app_feature_flags
   WHERE key='allocation_layer_posting';
  posting_active := COALESCE(posting_active,false);

  SELECT * INTO r FROM public.remittances WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _id USING ERRCODE = 'not_v2';
  END IF;
  IF r.workflow_state <> 'ready_to_close' THEN
    RAISE EXCEPTION 'finalize_close requires ready_to_close (was %)', r.workflow_state
      USING ERRCODE = 'invalid_state';
  END IF;

  -- Belt & suspenders: every active normal allocation must already be frozen.
  SELECT count(*) INTO unfrozen_count
    FROM public.remittance_allocations
   WHERE remittance_id=_id
     AND entry_kind='normal' AND reversed_by_id IS NULL
     AND (frozen_at IS NULL OR status <> 'closed');
  IF unfrozen_count > 0 THEN
    RAISE EXCEPTION 'finalize_close blocked: % unfrozen allocations remain', unfrozen_count
      USING ERRCODE = 'unfrozen_allocations';
  END IF;

  -- And the amounts must still balance.
  required := COALESCE(r.transferred_amount,0);
  SELECT COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='normal'
                            AND a.reversed_by_id IS NULL
                            AND a.status <> 'void'), 0)
       - COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='reversal'), 0)
    INTO allocated
    FROM public.remittance_allocations a WHERE a.remittance_id=_id;
  IF allocated <> required THEN
    RAISE EXCEPTION 'finalize_close blocked: allocated % <> required %', allocated, required
      USING ERRCODE = 'not_fully_allocated';
  END IF;

  UPDATE public.remittances
     SET workflow_state='closed',
         status='completed',
         updated_at=now()
   WHERE id=_id;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  VALUES (_id,'closed', jsonb_build_object('note',_note,'posting_active',posting_active), auth.uid());

  -- Ledger posting is second-gated. Flag currently OFF, so this remains inert.
  IF posting_active THEN
    NULL; -- ledger emission wired in a later sub-phase; guarded no-op today.
  END IF;

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,'remittance_v2_finalize_close',
                               jsonb_build_object('ok',true));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. Retire the old combined RPC. Any caller must migrate to the split.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.remittance_v2_close(uuid, text, uuid);

-- ---------------------------------------------------------------------
-- 5. Reverse allocation: hardened.
--    * Blocked when remittance is closed or cancelled (finality).
--    * Frozen allocations at ready_to_close emit negating profit components
--      and the remittance drops back to allocating.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_reverse_allocation(
  _allocation_id uuid, _reason text, _client_request_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent RECORD; r RECORD; rev_id uuid; posting_active boolean; prior jsonb;
BEGIN
  PERFORM public._assert_role('manager');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'reversal reason is required' USING ERRCODE = 'reason_required';
  END IF;

  IF _client_request_id IS NOT NULL THEN
    prior := public._idem_lookup(_client_request_id);
    IF prior IS NOT NULL THEN RETURN (prior->>'reversal_id')::uuid; END IF;
  END IF;

  SELECT enabled INTO posting_active FROM public.app_feature_flags
   WHERE key='allocation_layer_posting';
  posting_active := COALESCE(posting_active,false);

  -- LOCK ORDER: remittance first, then parent allocation.
  SELECT r0.* INTO r
    FROM public.remittance_allocations a0
    JOIN public.remittances r0 ON r0.id=a0.remittance_id
   WHERE a0.id=_allocation_id
   FOR UPDATE OF r0;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation % not found', _allocation_id; END IF;

  IF r.workflow_state IN ('closed','cancelled') THEN
    RAISE EXCEPTION 'reverse_allocation blocked: remittance is % (irreversible)', r.workflow_state
      USING ERRCODE = 'invalid_state';
  END IF;

  SELECT * INTO parent FROM public.remittance_allocations
   WHERE id=_allocation_id FOR UPDATE;
  IF parent.entry_kind <> 'normal' THEN
    RAISE EXCEPTION 'only normal allocations can be reversed'
      USING ERRCODE = 'invalid_target';
  END IF;
  IF parent.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'allocation % already reversed', _allocation_id
      USING ERRCODE = 'already_reversed';
  END IF;

  INSERT INTO public.remittance_allocations(
    remittance_id, buy_id, currency, allocated_amount,
    status, posting_class, workflow_version, entry_kind, parent_allocation_id,
    notes, created_by
  ) VALUES (
    parent.remittance_id, parent.buy_id, parent.currency, parent.allocated_amount,
    'reversed', parent.posting_class, 'v2', 'reversal', parent.id,
    _reason, auth.uid()
  ) RETURNING id INTO rev_id;

  UPDATE public.remittance_allocations
     SET reversed_by_id=rev_id, status='reversed', updated_at=now()
   WHERE id=parent.id;

  -- Negate profit components when the parent had been frozen (only possible at
  -- ready_to_close now, since closed is blocked above).
  IF parent.frozen_at IS NOT NULL THEN
    INSERT INTO public.remittance_profit_components(
      remittance_id, allocation_id, component_type, currency, amount, amount_aed,
      entry_kind, posting_class, workflow_version, reference_note
    ) VALUES
      (r.id,rev_id,'cost',        parent.frozen_cost_currency, -parent.frozen_cost_amount,
                                  -COALESCE(parent.frozen_cost_amount,0),'reversal',parent.posting_class,'v2','reversal of '||parent.id::text),
      (r.id,rev_id,'spread',      'AED', -COALESCE(parent.frozen_spread_profit_aed,0),
                                          -COALESCE(parent.frozen_spread_profit_aed,0),'reversal',parent.posting_class,'v2','reversal'),
      (r.id,rev_id,'commission',  'AED', -COALESCE(parent.frozen_commission_aed,0),
                                          -COALESCE(parent.frozen_commission_aed,0),'reversal',parent.posting_class,'v2','reversal'),
      (r.id,rev_id,'fx_trading',  'AED', 0, 0,'reversal',parent.posting_class,'v2','reversal'),
      (r.id,rev_id,'expense',     'AED', 0, 0,'reversal',parent.posting_class,'v2','reversal');
  END IF;

  IF posting_active AND parent.posting_class='operational_active' THEN
    NULL; -- ledger reversal wired in a later sub-phase; guarded no-op today.
  END IF;

  -- Drop ready_to_close back to allocating; leaves allocating unchanged.
  IF r.workflow_state='ready_to_close' THEN
    UPDATE public.remittances SET workflow_state='allocating', updated_at=now()
     WHERE id=r.id;
  END IF;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  VALUES (r.id,'allocation_reversed',
          jsonb_build_object('parent_allocation_id',parent.id,'reversal_id',rev_id,'reason',_reason),
          auth.uid());

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,'remittance_v2_reverse_allocation',
                               jsonb_build_object('reversal_id',rev_id));
  END IF;
  RETURN rev_id;
END $$;

-- ---------------------------------------------------------------------
-- 6. Cancel: draft only.
--    No new settlement events, no funds-return flow — those are deferred
--    to a future, dedicated phase.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_cancel(
  _id uuid, _reason text, _client_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; alloc_count integer;
BEGIN
  PERFORM public._assert_role('manager');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'cancellation reason is required' USING ERRCODE = 'reason_required';
  END IF;
  IF _client_request_id IS NOT NULL
     AND public._idem_lookup(_client_request_id) IS NOT NULL THEN RETURN; END IF;

  SELECT * INTO r FROM public.remittances WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _id USING ERRCODE = 'not_v2';
  END IF;
  IF r.workflow_state <> 'draft' THEN
    RAISE EXCEPTION 'cancel blocked: only draft remittances may be cancelled in this phase (was %)',
      r.workflow_state USING ERRCODE = 'invalid_state';
  END IF;

  -- Safety net: no allocations may exist for a draft.
  SELECT count(*) INTO alloc_count
    FROM public.remittance_allocations
   WHERE remittance_id=_id AND entry_kind='normal'
     AND reversed_by_id IS NULL AND status <> 'void';
  IF alloc_count > 0 THEN
    RAISE EXCEPTION 'cancel blocked: % active allocations exist', alloc_count
      USING ERRCODE = 'has_allocations';
  END IF;

  UPDATE public.remittances SET workflow_state='cancelled', status='cancelled', updated_at=now()
   WHERE id=_id;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  VALUES (_id,'cancelled', jsonb_build_object('reason',_reason), auth.uid());

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,'remittance_v2_cancel',
                               jsonb_build_object('ok',true));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7. validate_close: reoriented to "ready to prepare close".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_validate_close(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE r RECORD; allocated numeric; required numeric; checks jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._assert_role('operator');
  SELECT * INTO r FROM public.remittances WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _id USING ERRCODE = 'not_v2';
  END IF;

  SELECT COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='normal'
                            AND a.reversed_by_id IS NULL
                            AND a.status <> 'void'), 0)
       - COALESCE(SUM(a.allocated_amount)
                    FILTER (WHERE a.entry_kind='reversal'), 0)
    INTO allocated
    FROM public.remittance_allocations a WHERE a.remittance_id=_id;

  required := COALESCE(r.transferred_amount,0);

  checks := checks || jsonb_build_array(
    jsonb_build_object('key','state_allocating',
                       'ok',(r.workflow_state='allocating'),
                       'detail',r.workflow_state),
    jsonb_build_object('key','fully_allocated',
                       'ok',(allocated=required),
                       'detail',jsonb_build_object('allocated',allocated,'required',required)),
    jsonb_build_object('key','not_terminal',
                       'ok',(r.workflow_state NOT IN ('closed','cancelled')),
                       'detail',r.workflow_state)
  );

  RETURN jsonb_build_object(
    'ok',(r.workflow_state='allocating' AND allocated=required),
    'checks',checks
  );
END $$;

-- ---------------------------------------------------------------------
-- 8. Grants: authenticated only. Nothing new is exposed to anon.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.remittance_v2_allocate_buy(uuid, uuid, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remittance_v2_prepare_close(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remittance_v2_finalize_close(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remittance_v2_reverse_allocation(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remittance_v2_cancel(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remittance_v2_validate_close(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.remittance_v2_allocate_buy(uuid, uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remittance_v2_prepare_close(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remittance_v2_finalize_close(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remittance_v2_reverse_allocation(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remittance_v2_cancel(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remittance_v2_validate_close(uuid) TO authenticated;
