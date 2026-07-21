
-- Phase 4E: Remittance v2 Settlement Operations
-- Centralized required-delivery calc + idempotent workflow transitions.
-- Feature flags remain OFF; every RPC re-asserts _assert_flag('remittance_v2_enabled').

-- ---------------------------------------------------------------------------
-- Centralized required-delivery calculation.
-- For Phase 4E this equals settlement_amount; future phases (adjustments,
-- fees, FX corrections) will change the body without changing call sites.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._calc_required_delivery_amount(_remittance_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(r.settlement_amount, 0)::numeric
    FROM public.remittances r
   WHERE r.id = _remittance_id
$$;
REVOKE ALL ON FUNCTION public._calc_required_delivery_amount(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._calc_required_delivery_amount(uuid) TO authenticated, service_role;

-- Cumulative delivered so far (supplier_delivery events only).
CREATE OR REPLACE FUNCTION public._remittance_delivered_so_far(_remittance_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM((payload->>'received_amount')::numeric), 0)::numeric
    FROM public.remittance_settlement_events
   WHERE remittance_id = _remittance_id
     AND event_type    = 'supplier_delivery'
$$;
REVOKE ALL ON FUNCTION public._remittance_delivered_so_far(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._remittance_delivered_so_far(uuid) TO authenticated, service_role;

-- Cumulative third-party settled so far.
CREATE OR REPLACE FUNCTION public._remittance_third_party_settled_so_far(_remittance_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM((payload->>'amount')::numeric), 0)::numeric
    FROM public.remittance_settlement_events
   WHERE remittance_id = _remittance_id
     AND event_type    = 'third_party_settlement'
$$;
REVOKE ALL ON FUNCTION public._remittance_third_party_settled_so_far(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._remittance_third_party_settled_so_far(uuid) TO authenticated, service_role;

-- Idempotent workflow-transition writer: only inserts when state actually changes.
CREATE OR REPLACE FUNCTION public._insert_workflow_transition_if_changed(
  _remittance_id uuid,
  _from public.remittance_workflow_state,
  _to   public.remittance_workflow_state,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _from IS DISTINCT FROM _to THEN
    INSERT INTO public.remittance_workflow_transitions(
      remittance_id, from_state, to_state, reason, actor
    ) VALUES (_remittance_id, _from, _to, _reason, auth.uid());
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._insert_workflow_transition_if_changed(uuid, public.remittance_workflow_state, public.remittance_workflow_state, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._insert_workflow_transition_if_changed(uuid, public.remittance_workflow_state, public.remittance_workflow_state, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. mark_funds_received: draft -> funds_received (company-paid flows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_mark_funds_received(
  _id uuid,
  _account_id uuid,
  _amount numeric,
  _note text DEFAULT NULL,
  _client_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  PERFORM public._assert_role('operator');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _client_request_id IS NOT NULL
     AND public._idem_lookup(_client_request_id) IS NOT NULL THEN
    RETURN;
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING ERRCODE = 'invalid_amount';
  END IF;

  -- LOCK ORDER: remittance first.
  SELECT * INTO r FROM public.remittances WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _id USING ERRCODE = 'not_v2';
  END IF;
  IF r.workflow_state <> 'draft' THEN
    RAISE EXCEPTION 'mark_funds_received requires draft state (was %)', r.workflow_state
      USING ERRCODE = 'invalid_state';
  END IF;
  -- Server-authoritative destination check (never trust client).
  IF r.payment_destination = 'to_third_party' THEN
    RAISE EXCEPTION 'mark_funds_received not valid for third-party payment destination'
      USING ERRCODE = 'wrong_payment_destination';
  END IF;

  -- Financial fact first.
  INSERT INTO public.remittance_settlement_events(remittance_id, event_type, payload, actor)
  VALUES (_id, 'funds_received',
          jsonb_build_object('account_id', _account_id, 'amount', _amount, 'note', _note),
          auth.uid());

  -- State update.
  UPDATE public.remittances
     SET workflow_state = 'funds_received',
         payment_received_account_id = _account_id,
         payment_status = 'received',
         updated_at = now()
   WHERE id = _id;

  -- Workflow transition (idempotent — only when from<>to).
  PERFORM public._insert_workflow_transition_if_changed(
    _id, r.workflow_state, 'funds_received', 'mark_funds_received');

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id, 'remittance_v2_mark_funds_received',
      jsonb_build_object('ok', true));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. record_third_party_settlement: draft|settlement_pending -> settlement_pending
--    Supports repeated partial settlements. Over-settlement guarded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_record_third_party_settlement(
  _id uuid,
  _third_party_customer_id uuid,
  _amount numeric,
  _note text DEFAULT NULL,
  _client_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  existing_settled numeric;
  required_total   numeric;
  tolerance constant numeric := 1e-8;
BEGIN
  PERFORM public._assert_role('operator');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _client_request_id IS NOT NULL
     AND public._idem_lookup(_client_request_id) IS NOT NULL THEN
    RETURN;
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING ERRCODE = 'invalid_amount';
  END IF;

  SELECT * INTO r FROM public.remittances WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _id USING ERRCODE = 'not_v2';
  END IF;
  IF r.workflow_state NOT IN ('draft', 'settlement_pending') THEN
    RAISE EXCEPTION 'record_third_party_settlement not valid in state %', r.workflow_state
      USING ERRCODE = 'invalid_state';
  END IF;
  -- Server-authoritative destination.
  IF r.payment_destination <> 'to_third_party' THEN
    RAISE EXCEPTION 'record_third_party_settlement requires payment_destination=to_third_party (was %)',
      r.payment_destination USING ERRCODE = 'wrong_payment_destination';
  END IF;

  -- Over-settlement check (recomputed under lock; no tolerance opens overages).
  existing_settled := public._remittance_third_party_settled_so_far(_id);
  required_total   := COALESCE(r.settlement_amount, 0);
  IF existing_settled + _amount > required_total + tolerance THEN
    RAISE EXCEPTION 'over_settlement: attempted % + existing % exceeds required %',
      _amount, existing_settled, required_total USING ERRCODE = 'over_settlement';
  END IF;

  INSERT INTO public.remittance_settlement_events(remittance_id, event_type, payload, actor)
  VALUES (_id, 'third_party_settlement',
          jsonb_build_object('third_party_customer_id', _third_party_customer_id,
                             'amount', _amount, 'note', _note),
          auth.uid());

  -- Only move to settlement_pending on the first event.
  IF r.workflow_state = 'draft' THEN
    UPDATE public.remittances
       SET workflow_state = 'settlement_pending',
           third_party_customer_id = COALESCE(third_party_customer_id, _third_party_customer_id),
           updated_at = now()
     WHERE id = _id;
    PERFORM public._insert_workflow_transition_if_changed(
      _id, r.workflow_state, 'settlement_pending', 'record_third_party_settlement');
  ELSE
    UPDATE public.remittances SET updated_at = now() WHERE id = _id;
    -- state unchanged -> no transition row.
  END IF;

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,
      'remittance_v2_record_third_party_settlement', jsonb_build_object('ok', true));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. record_supplier_delivery: {funds_received|settlement_pending} -> allocating (auto)
--    Finality derived from data (cumulative delivered >= required - tolerance).
--    Inventory lot creation gated by allocation_layer_posting flag (OFF).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.remittance_v2_record_supplier_delivery(uuid, uuid, numeric, date, text, uuid);
CREATE OR REPLACE FUNCTION public.remittance_v2_record_supplier_delivery(
  _remittance_id uuid,
  _buy_id uuid,
  _delivered_amount numeric,
  _received_into_account_id uuid,
  _delivered_at date DEFAULT CURRENT_DATE,
  _note text DEFAULT NULL,
  _client_request_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  b RECORD;
  prior jsonb;
  existing_delivered numeric;
  required_total     numeric;
  cumulative         numeric;
  event_id           uuid;
  new_lot_id         uuid := NULL;
  posting_enabled    boolean;
  tolerance constant numeric := 1e-8;
BEGIN
  PERFORM public._assert_role('operator');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _client_request_id IS NOT NULL THEN
    prior := public._idem_lookup(_client_request_id);
    IF prior IS NOT NULL THEN
      RETURN NULLIF(prior->>'event_id','')::uuid;
    END IF;
  END IF;

  IF _delivered_amount IS NULL OR _delivered_amount <= 0 THEN
    RAISE EXCEPTION 'delivered_amount must be positive' USING ERRCODE = 'invalid_amount';
  END IF;

  -- LOCK ORDER: remittance first, then buy.
  SELECT * INTO r FROM public.remittances WHERE id = _remittance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _remittance_id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _remittance_id USING ERRCODE = 'not_v2';
  END IF;
  IF r.workflow_state NOT IN ('funds_received', 'settlement_pending') THEN
    RAISE EXCEPTION 'record_supplier_delivery not valid in state %', r.workflow_state
      USING ERRCODE = 'invalid_state';
  END IF;

  SELECT * INTO b FROM public.buy_transactions WHERE id = _buy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'buy % not found', _buy_id; END IF;
  IF r.linked_buy_id IS DISTINCT FROM _buy_id THEN
    RAISE EXCEPTION 'buy % is not linked to remittance %', _buy_id, _remittance_id
      USING ERRCODE = 'buy_not_linked';
  END IF;
  IF COALESCE(b.supplier_delivered, false) THEN
    RAISE EXCEPTION 'buy % already marked delivered', _buy_id
      USING ERRCODE = 'already_delivered';
  END IF;

  -- Required total via centralized calc.
  required_total     := public._calc_required_delivery_amount(_remittance_id);
  existing_delivered := public._remittance_delivered_so_far(_remittance_id);

  -- Over-delivery guard (tolerance only absorbs precision noise at boundary).
  IF existing_delivered + _delivered_amount > required_total + tolerance THEN
    RAISE EXCEPTION 'over_delivery: attempted % + existing % exceeds required %',
      _delivered_amount, existing_delivered, required_total
      USING ERRCODE = 'over_delivery';
  END IF;

  -- Financial fact: event row (source of truth for cumulative delivered).
  INSERT INTO public.remittance_settlement_events(remittance_id, event_type, payload, actor)
  VALUES (_remittance_id, 'supplier_delivery',
          jsonb_build_object('buy_id', _buy_id,
                             'received_amount', _delivered_amount,
                             'account_id', _received_into_account_id,
                             'delivery_date', _delivered_at,
                             'note', _note),
          auth.uid())
  RETURNING id INTO event_id;

  -- Inventory posting: gated by allocation_layer_posting (currently OFF).
  SELECT enabled INTO posting_enabled
    FROM public.app_feature_flags WHERE key = 'allocation_layer_posting';
  IF COALESCE(posting_enabled, false) THEN
    INSERT INTO public.inventory_lots(
      currency, amount, remaining_amount, cost_rate, cost_currency,
      cost_amount, account_id, entry_date, source_type, source_id, created_by,
      cost_basis_status
    ) VALUES (
      b.bought_currency, _delivered_amount, _delivered_amount,
      b.buy_rate, b.paid_currency,
      _delivered_amount * COALESCE(b.buy_rate, 0), _received_into_account_id,
      _delivered_at, 'buy', _buy_id, auth.uid(),
      'known'
    ) RETURNING id INTO new_lot_id;
  END IF;

  -- Cumulative AFTER this insert (from the durable event log).
  cumulative := public._remittance_delivered_so_far(_remittance_id);

  -- Mark buy delivered if this call satisfies the full requirement.
  IF cumulative >= required_total - tolerance THEN
    UPDATE public.buy_transactions
       SET supplier_delivered    = true,
           supplier_delivered_at = now(),
           received_into_account_id = COALESCE(received_into_account_id, _received_into_account_id),
           supplier_delivery_note   = COALESCE(supplier_delivery_note, _note),
           updated_at = now()
     WHERE id = _buy_id;

    UPDATE public.remittances
       SET workflow_state = 'allocating',
           updated_at = now()
     WHERE id = _remittance_id;

    PERFORM public._insert_workflow_transition_if_changed(
      _remittance_id, r.workflow_state, 'allocating', 'record_supplier_delivery');
  ELSE
    -- Partial: state unchanged, no transition row.
    UPDATE public.remittances SET updated_at = now() WHERE id = _remittance_id;
  END IF;

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,
      'remittance_v2_record_supplier_delivery',
      jsonb_build_object('event_id', event_id, 'lot_id', new_lot_id));
  END IF;
  RETURN event_id;
END $$;

REVOKE ALL ON FUNCTION public.remittance_v2_mark_funds_received(uuid, uuid, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remittance_v2_record_third_party_settlement(uuid, uuid, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remittance_v2_record_supplier_delivery(uuid, uuid, numeric, uuid, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remittance_v2_mark_funds_received(uuid, uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remittance_v2_record_third_party_settlement(uuid, uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remittance_v2_record_supplier_delivery(uuid, uuid, numeric, uuid, date, text, uuid) TO authenticated;
