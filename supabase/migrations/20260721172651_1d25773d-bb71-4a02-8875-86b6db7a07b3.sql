
-- =========================================================================
-- Phase 4B — Remittance v2 RPC surface. Backend-only. Feature flags OFF.
--
-- LOCK ORDER RULE (mandatory for every current and future v2 routine):
--   1. SELECT FROM public.remittances       ... FOR UPDATE   (remittance row first)
--   2. SELECT FROM public.buy_transactions  ... FOR UPDATE   (then buy row)
-- For any future multi-buy operation, buy rows MUST be locked in ascending
-- UUID order BEFORE the capacity calculation runs. Reversing this order in
-- any RPC is a bug.
-- =========================================================================

-- 1) Idempotency helper table --------------------------------------------
CREATE TABLE IF NOT EXISTS public.rpc_idempotency (
  request_id uuid PRIMARY KEY,
  rpc_name   text NOT NULL,
  result     jsonb,
  actor      uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpc_idempotency_created_at
  ON public.rpc_idempotency(created_at);

GRANT SELECT ON public.rpc_idempotency TO authenticated;
GRANT ALL    ON public.rpc_idempotency TO service_role;

ALTER TABLE public.rpc_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rpc_idem_read   ON public.rpc_idempotency;
DROP POLICY IF EXISTS rpc_idem_insert ON public.rpc_idempotency;
CREATE POLICY rpc_idem_read ON public.rpc_idempotency FOR SELECT TO authenticated
  USING (actor = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY rpc_idem_insert ON public.rpc_idempotency FOR INSERT TO authenticated
  WITH CHECK (false);  -- writes only via SECURITY DEFINER RPCs below

-- Admin-only cleanup. Scheduling deferred to activation/ops phase because
-- pg_cron is not installed and this phase must not add a new extension.
CREATE OR REPLACE FUNCTION public.rpc_idempotency_gc(_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE removed integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.rpc_idempotency
   WHERE created_at < now() - make_interval(days => GREATEST(_days,1));
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.rpc_idempotency_gc(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_idempotency_gc(integer) TO authenticated;

-- 2) Helper assertions ---------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_flag(_key text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE ok boolean;
BEGIN
  SELECT enabled INTO ok FROM public.app_feature_flags WHERE key=_key;
  IF NOT COALESCE(ok,false) THEN
    RAISE EXCEPTION 'feature flag % is not enabled', _key USING ERRCODE='P0001';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._assert_flag(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_flag(text) TO authenticated;

CREATE OR REPLACE FUNCTION public._assert_role(_role app_role)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),_role) THEN
    RAISE EXCEPTION 'role % required', _role USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._assert_role(app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_role(app_role) TO authenticated;

-- Idempotency wrapper helper
CREATE OR REPLACE FUNCTION public._idem_lookup(_req uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT result FROM public.rpc_idempotency WHERE request_id = _req;
$$;
REVOKE ALL ON FUNCTION public._idem_lookup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._idem_lookup(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._idem_store(_req uuid, _rpc text, _result jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO public.rpc_idempotency(request_id, rpc_name, result, actor)
  VALUES (_req, _rpc, _result, auth.uid())
  ON CONFLICT (request_id) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public._idem_store(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._idem_store(uuid,text,jsonb) TO authenticated;

-- =========================================================================
-- 3) RPC surface (9 routines)
-- =========================================================================

-- ---- (1) remittance_v2_create -----------------------------------------------
-- SECURITY INVOKER: only inserts into remittances (RLS already permits).
CREATE OR REPLACE FUNCTION public.remittance_v2_create(
  _payload jsonb,
  _client_request_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE new_id uuid; prior jsonb;
BEGIN
  PERFORM public._assert_role('operator');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _client_request_id IS NOT NULL THEN
    prior := public._idem_lookup(_client_request_id);
    IF prior IS NOT NULL THEN RETURN (prior->>'id')::uuid; END IF;
  END IF;

  INSERT INTO public.remittances(
    workflow_version, workflow_state, status, entry_date,
    customer_id, customer_phone, customer_reference,
    transfer_currency, transferred_amount, transfer_method,
    beneficiary_name, beneficiary_country,
    customer_payment_currency, customer_payment_amount, reference_rate,
    payment_destination, third_party_customer_id, third_party_name,
    settlement_amount, settlement_currency,
    commission_method, commission_fixed_amount, commission_fixed_currency,
    commission_percentage,
    notes, created_by
  ) VALUES (
    'v2','draft','draft',
    COALESCE((_payload->>'entry_date')::date, CURRENT_DATE),
    NULLIF(_payload->>'customer_id','')::uuid,
    _payload->>'customer_phone',
    _payload->>'customer_reference',
    _payload->>'transfer_currency',
    (_payload->>'transferred_amount')::numeric,
    _payload->>'transfer_method',
    _payload->>'beneficiary_name',
    _payload->>'beneficiary_country',
    _payload->>'customer_payment_currency',
    NULLIF(_payload->>'customer_payment_amount','')::numeric,
    NULLIF(_payload->>'reference_rate','')::numeric,
    COALESCE(_payload->>'payment_destination','company_account'),
    NULLIF(_payload->>'third_party_customer_id','')::uuid,
    _payload->>'third_party_name',
    NULLIF(_payload->>'settlement_amount','')::numeric,
    _payload->>'settlement_currency',
    _payload->>'commission_method',
    NULLIF(_payload->>'commission_fixed_amount','')::numeric,
    _payload->>'commission_fixed_currency',
    NULLIF(_payload->>'commission_percentage','')::numeric,
    _payload->>'notes',
    auth.uid()
  ) RETURNING id INTO new_id;

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,'remittance_v2_create',
                               jsonb_build_object('id', new_id));
  END IF;
  RETURN new_id;
END $$;
COMMENT ON FUNCTION public.remittance_v2_create(jsonb,uuid) IS
'Phase 4B. INVOKER. Creates a v2 remittance in draft. Requires operator + remittance_v2_enabled.';
REVOKE ALL ON FUNCTION public.remittance_v2_create(jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remittance_v2_create(jsonb,uuid) TO authenticated;

-- ---- (2) remittance_v2_mark_funds_received ---------------------------------
-- SECURITY DEFINER: writes to remittance_settlement_events (WITH CHECK false).
CREATE OR REPLACE FUNCTION public.remittance_v2_mark_funds_received(
  _id uuid, _account_id uuid, _amount numeric, _note text DEFAULT NULL,
  _client_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD;
BEGIN
  PERFORM public._assert_role('operator');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _client_request_id IS NOT NULL
     AND public._idem_lookup(_client_request_id) IS NOT NULL THEN RETURN; END IF;

  -- LOCK ORDER: remittance first.
  SELECT * INTO r FROM public.remittances WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _id;
  END IF;
  IF r.workflow_state <> 'draft' THEN
    RAISE EXCEPTION 'mark_funds_received requires draft state (was %)', r.workflow_state;
  END IF;

  UPDATE public.remittances
     SET workflow_state='funds_received',
         payment_received_account_id=_account_id,
         payment_status='received',
         updated_at=now()
   WHERE id=_id;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  VALUES (_id,'funds_received',
          jsonb_build_object('account_id',_account_id,'amount',_amount,'note',_note),
          auth.uid());

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,'remittance_v2_mark_funds_received',
                               jsonb_build_object('ok',true));
  END IF;
END $$;
COMMENT ON FUNCTION public.remittance_v2_mark_funds_received(uuid,uuid,numeric,text,uuid) IS
'Phase 4B. DEFINER. draft -> funds_received. Lock order: remittances only.';
REVOKE ALL ON FUNCTION public.remittance_v2_mark_funds_received(uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remittance_v2_mark_funds_received(uuid,uuid,numeric,text,uuid) TO authenticated;

-- ---- (3) remittance_v2_record_third_party_settlement -----------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_record_third_party_settlement(
  _id uuid, _third_party_customer_id uuid, _amount numeric,
  _note text DEFAULT NULL, _client_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD;
BEGIN
  PERFORM public._assert_role('operator');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _client_request_id IS NOT NULL
     AND public._idem_lookup(_client_request_id) IS NOT NULL THEN RETURN; END IF;

  SELECT * INTO r FROM public.remittances WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN RAISE EXCEPTION 'remittance % is not v2', _id; END IF;
  IF r.workflow_state <> 'draft' THEN
    RAISE EXCEPTION 'record_third_party_settlement requires draft state (was %)', r.workflow_state;
  END IF;

  UPDATE public.remittances
     SET workflow_state='settlement_pending',
         payment_destination='third_party_direct',
         third_party_customer_id=_third_party_customer_id,
         settlement_amount=_amount,
         updated_at=now()
   WHERE id=_id;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  VALUES (_id,'third_party_settlement',
          jsonb_build_object('third_party_customer_id',_third_party_customer_id,
                             'amount',_amount,'note',_note),
          auth.uid());

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,
      'remittance_v2_record_third_party_settlement', jsonb_build_object('ok',true));
  END IF;
END $$;
COMMENT ON FUNCTION public.remittance_v2_record_third_party_settlement(uuid,uuid,numeric,text,uuid) IS
'Phase 4B. DEFINER. draft -> settlement_pending. Lock order: remittances only.';
REVOKE ALL ON FUNCTION public.remittance_v2_record_third_party_settlement(uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remittance_v2_record_third_party_settlement(uuid,uuid,numeric,text,uuid) TO authenticated;

-- ---- (4) remittance_v2_record_supplier_delivery ---------------------------
-- Materialises the linked buy's inventory lot on physical delivery.
CREATE OR REPLACE FUNCTION public.remittance_v2_record_supplier_delivery(
  _buy_id uuid, _received_into_account_id uuid, _received_amount numeric,
  _delivery_date date DEFAULT CURRENT_DATE, _note text DEFAULT NULL,
  _client_request_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b RECORD; new_lot uuid; prior jsonb;
BEGIN
  PERFORM public._assert_role('operator');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _client_request_id IS NOT NULL THEN
    prior := public._idem_lookup(_client_request_id);
    IF prior IS NOT NULL THEN RETURN NULLIF(prior->>'lot_id','')::uuid; END IF;
  END IF;

  -- No remittance row involved in this specific call; only the buy is locked.
  SELECT * INTO b FROM public.buy_transactions WHERE id=_buy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'buy % not found', _buy_id; END IF;
  IF COALESCE(b.supplier_delivered,false) THEN
    RAISE EXCEPTION 'buy % already marked delivered', _buy_id;
  END IF;

  UPDATE public.buy_transactions
     SET supplier_delivered=true,
         supplier_delivered_at=now(),
         received_into_account_id=COALESCE(received_into_account_id,_received_into_account_id),
         supplier_delivery_note=COALESCE(supplier_delivery_note,_note),
         updated_at=now()
   WHERE id=_buy_id;

  INSERT INTO public.inventory_lots(
    currency, amount, remaining_amount, cost_rate, cost_currency,
    cost_amount, account_id, entry_date, source_type, source_id, created_by,
    cost_basis_status
  ) VALUES (
    b.bought_currency, _received_amount, _received_amount,
    b.buy_rate, b.paid_currency,
    _received_amount * b.buy_rate, _received_into_account_id,
    _delivery_date, 'buy', _buy_id, auth.uid(),
    'known'
  ) RETURNING id INTO new_lot;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  SELECT r.id,'supplier_delivery',
         jsonb_build_object('buy_id',_buy_id,'lot_id',new_lot,
                            'received_amount',_received_amount,
                            'account_id',_received_into_account_id,
                            'delivery_date',_delivery_date,'note',_note),
         auth.uid()
    FROM public.remittances r
   WHERE r.linked_buy_id=_buy_id;

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,
      'remittance_v2_record_supplier_delivery',
      jsonb_build_object('lot_id',new_lot));
  END IF;
  RETURN new_lot;
END $$;
COMMENT ON FUNCTION public.remittance_v2_record_supplier_delivery(uuid,uuid,numeric,date,text,uuid) IS
'Phase 4B. DEFINER. Locks buy_transactions row and creates the delivered inventory_lot. No remittance lock needed in this call.';
REVOKE ALL ON FUNCTION public.remittance_v2_record_supplier_delivery(uuid,uuid,numeric,date,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remittance_v2_record_supplier_delivery(uuid,uuid,numeric,date,text,uuid) TO authenticated;

-- ---- (5) remittance_v2_allocate_buy ---------------------------------------
-- CANONICAL LOCK ORDER: remittance FIRST, buy SECOND. Never reverse.
CREATE OR REPLACE FUNCTION public.remittance_v2_allocate_buy(
  _remittance_id uuid, _buy_id uuid, _amount numeric, _notes text DEFAULT NULL,
  _client_request_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r RECORD; b RECORD; alloc_id uuid; remaining numeric; already numeric;
  required numeric; prior jsonb;
BEGIN
  PERFORM public._assert_role('operator');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  IF _client_request_id IS NOT NULL THEN
    prior := public._idem_lookup(_client_request_id);
    IF prior IS NOT NULL THEN RETURN (prior->>'allocation_id')::uuid; END IF;
  END IF;

  -- ---- LOCK ORDER: 1) remittance row ------------------------------------
  SELECT * INTO r FROM public.remittances WHERE id=_remittance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _remittance_id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _remittance_id;
  END IF;
  IF r.workflow_state NOT IN ('funds_received','settlement_pending','allocating') THEN
    RAISE EXCEPTION 'allocate_buy not permitted in state %', r.workflow_state;
  END IF;

  -- ---- LOCK ORDER: 2) buy row -------------------------------------------
  SELECT * INTO b FROM public.buy_transactions WHERE id=_buy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'buy % not found', _buy_id; END IF;
  IF b.bought_currency <> r.transfer_currency THEN
    RAISE EXCEPTION 'buy currency % must match remittance transfer currency %',
      b.bought_currency, r.transfer_currency;
  END IF;

  -- Recompute capacity INSIDE the buy lock. Any prior committed allocation
  -- by another transaction is now visible.
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

  -- Check remittance-side ceiling too.
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
    'open','shadow','v2','normal',_notes, auth.uid()
  ) RETURNING id INTO alloc_id;

  -- Update remittance state
  IF already + _amount >= required THEN
    UPDATE public.remittances SET workflow_state='ready_to_close', updated_at=now()
     WHERE id=_remittance_id;
  ELSE
    UPDATE public.remittances SET workflow_state='allocating', updated_at=now()
     WHERE id=_remittance_id;
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
COMMENT ON FUNCTION public.remittance_v2_allocate_buy(uuid,uuid,numeric,text,uuid) IS
'Phase 4B. DEFINER. LOCK ORDER: (1) remittance FOR UPDATE, then (2) buy FOR UPDATE. Recomputes capacity inside the buy lock. Never reverse this order.';
REVOKE ALL ON FUNCTION public.remittance_v2_allocate_buy(uuid,uuid,numeric,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remittance_v2_allocate_buy(uuid,uuid,numeric,text,uuid) TO authenticated;

-- ---- (6) remittance_v2_validate_close (read-only) --------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_validate_close(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public STABLE AS $$
DECLARE r RECORD; allocated numeric; required numeric; checks jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._assert_role('operator');
  SELECT * INTO r FROM public.remittances WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'remittance % is not v2', _id;
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
    jsonb_build_object('key','state_ready',
                       'ok',(r.workflow_state='ready_to_close'),
                       'detail',r.workflow_state),
    jsonb_build_object('key','fully_allocated',
                       'ok',(allocated=required),
                       'detail',jsonb_build_object('allocated',allocated,'required',required)),
    jsonb_build_object('key','not_terminal',
                       'ok',(r.workflow_state NOT IN ('closed','cancelled')),
                       'detail',r.workflow_state)
  );

  RETURN jsonb_build_object(
    'ok',(r.workflow_state='ready_to_close' AND allocated=required),
    'checks',checks
  );
END $$;
COMMENT ON FUNCTION public.remittance_v2_validate_close(uuid) IS
'Phase 4B. INVOKER. Read-only close checklist.';
REVOKE ALL ON FUNCTION public.remittance_v2_validate_close(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remittance_v2_validate_close(uuid) TO authenticated;

-- ---- (7) remittance_v2_close ----------------------------------------------
-- Freezes each allocation's profit snapshot and fans out profit components.
-- Ledger posting is gated by allocation_layer_posting. Until that flag is on,
-- allocations stay posting_class='shadow' and no ledger rows are written.
CREATE OR REPLACE FUNCTION public.remittance_v2_close(
  _id uuid, _note text DEFAULT NULL, _client_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r RECORD; a RECORD; b RECORD;
  allocated numeric; required numeric; posting_active boolean;
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

  SELECT enabled INTO posting_active FROM public.app_feature_flags
   WHERE key='allocation_layer_posting';
  posting_active := COALESCE(posting_active,false);

  -- LOCK ORDER: remittance row first.
  SELECT * INTO r FROM public.remittances WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN RAISE EXCEPTION 'remittance % is not v2', _id; END IF;
  IF r.workflow_state <> 'ready_to_close' THEN
    RAISE EXCEPTION 'close requires ready_to_close (was %)', r.workflow_state;
  END IF;

  -- Then lock every referenced buy row in ascending UUID order.
  SELECT array_agg(buy_id ORDER BY buy_id)
    INTO buy_ids
    FROM (
      SELECT DISTINCT buy_id
        FROM public.remittance_allocations
       WHERE remittance_id=_id AND buy_id IS NOT NULL
    ) s;
  IF buy_ids IS NOT NULL THEN
    PERFORM 1 FROM public.buy_transactions
      WHERE id = ANY(buy_ids)
      ORDER BY id
      FOR UPDATE;
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
    RAISE EXCEPTION 'close blocked: allocated % <> required %', allocated, required;
  END IF;

  -- Freeze each open normal allocation
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

    -- customer amount in payment currency
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

    -- Full profit model preserved: spread + commission + fx_trading - expenses.
    -- fx_trading and expense components are inserted as 0 rows for now.
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
             'buy_rate',b.buy_rate,
             'buy_paid_currency',b.paid_currency,
             'customer_payment_currency',r.customer_payment_currency,
             'reference_rate',r.reference_rate,
             'alloc_share',alloc_share,
             'model','spread+commission+fx-expenses',
             'fx_trading_aed',0,
             'expenses_aed',0
           ),
           status='closed',
           updated_at=now()
     WHERE id=a.id;

    INSERT INTO public.remittance_profit_components(
      remittance_id, allocation_id, component_type, currency, amount, amount_aed,
      entry_kind, posting_class, workflow_version, reference_note
    ) VALUES
      (_id,a.id,'cost',        b.paid_currency, cost_native,   COALESCE(cost_aed,0),   'normal',a.posting_class,'v2','Phase 4B'),
      (_id,a.id,'spread',      'AED',           spread_aed,    spread_aed,             'normal',a.posting_class,'v2','Phase 4B'),
      (_id,a.id,'commission',  'AED',           commission_aed,commission_aed,         'normal',a.posting_class,'v2','Phase 4B'),
      (_id,a.id,'fx_trading',  'AED',           0,             0,                      'normal',a.posting_class,'v2','placeholder - later sub-phase'),
      (_id,a.id,'expense',     'AED',           0,             0,                      'normal',a.posting_class,'v2','placeholder - later sub-phase');

    -- Ledger posting is second-gated. Flag currently OFF so this branch is inert.
    IF posting_active AND a.posting_class='operational_active' THEN
      PERFORM public.assert_posting_active(a.posting_class);
      -- Actual ledger emission wired in a later sub-phase; guarded no-op today.
      NULL;
    END IF;
  END LOOP;

  UPDATE public.remittances
     SET workflow_state='closed',
         status='completed',
         updated_at=now()
   WHERE id=_id;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  VALUES (_id,'closed', jsonb_build_object('note',_note,'posting_active',posting_active), auth.uid());

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,'remittance_v2_close',
                               jsonb_build_object('ok',true));
  END IF;
END $$;
COMMENT ON FUNCTION public.remittance_v2_close(uuid,text,uuid) IS
'Phase 4B. DEFINER. LOCK ORDER: remittance FOR UPDATE first, then buy rows in ascending UUID order. Freezes allocations and profit components. Ledger posting gated by allocation_layer_posting (currently OFF).';
REVOKE ALL ON FUNCTION public.remittance_v2_close(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remittance_v2_close(uuid,text,uuid) TO authenticated;

-- ---- (8) remittance_v2_cancel ---------------------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_cancel(
  _id uuid, _reason text, _client_request_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD; alloc_count integer;
BEGIN
  PERFORM public._assert_role('manager');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _reason IS NULL OR btrim(_reason)='' THEN
    RAISE EXCEPTION 'cancellation reason is required';
  END IF;
  IF _client_request_id IS NOT NULL
     AND public._idem_lookup(_client_request_id) IS NOT NULL THEN RETURN; END IF;

  SELECT * INTO r FROM public.remittances WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'remittance % not found', _id; END IF;
  IF r.workflow_version <> 'v2' THEN RAISE EXCEPTION 'remittance % is not v2', _id; END IF;
  IF r.workflow_state IN ('closed','cancelled') THEN
    RAISE EXCEPTION 'cannot cancel from terminal state %', r.workflow_state;
  END IF;

  SELECT count(*) INTO alloc_count
    FROM public.remittance_allocations
   WHERE remittance_id=_id AND entry_kind='normal'
     AND reversed_by_id IS NULL AND status <> 'void';
  IF alloc_count > 0 THEN
    RAISE EXCEPTION 'cancel blocked: % active allocations exist (reverse them first)', alloc_count;
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
COMMENT ON FUNCTION public.remittance_v2_cancel(uuid,text,uuid) IS
'Phase 4B. DEFINER. Cancels a v2 remittance; blocked if active allocations exist.';
REVOKE ALL ON FUNCTION public.remittance_v2_cancel(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remittance_v2_cancel(uuid,text,uuid) TO authenticated;

-- ---- (9) remittance_v2_reverse_allocation ---------------------------------
CREATE OR REPLACE FUNCTION public.remittance_v2_reverse_allocation(
  _allocation_id uuid, _reason text, _client_request_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent RECORD; r RECORD; rev_id uuid; posting_active boolean; prior jsonb;
BEGIN
  PERFORM public._assert_role('manager');
  PERFORM public._assert_flag('remittance_v2_enabled');

  IF _reason IS NULL OR btrim(_reason)='' THEN
    RAISE EXCEPTION 'reversal reason is required';
  END IF;

  IF _client_request_id IS NOT NULL THEN
    prior := public._idem_lookup(_client_request_id);
    IF prior IS NOT NULL THEN RETURN (prior->>'reversal_id')::uuid; END IF;
  END IF;

  SELECT enabled INTO posting_active FROM public.app_feature_flags
   WHERE key='allocation_layer_posting';
  posting_active := COALESCE(posting_active,false);

  -- LOCK ORDER: remittance first.
  SELECT r0.* INTO r
    FROM public.remittance_allocations a0
    JOIN public.remittances r0 ON r0.id=a0.remittance_id
   WHERE a0.id=_allocation_id
   FOR UPDATE OF r0;
  IF NOT FOUND THEN RAISE EXCEPTION 'allocation % not found', _allocation_id; END IF;

  -- Then lock the parent allocation.
  SELECT * INTO parent FROM public.remittance_allocations
   WHERE id=_allocation_id FOR UPDATE;
  IF parent.entry_kind <> 'normal' THEN
    RAISE EXCEPTION 'only normal allocations can be reversed';
  END IF;
  IF parent.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'allocation % already reversed', _allocation_id;
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

  -- If remittance was closed and had frozen profit, insert negating components.
  IF r.workflow_state='closed' AND parent.frozen_at IS NOT NULL THEN
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

  -- Ledger reversal is second-gated; flag OFF today means no ledger writes.
  IF posting_active AND parent.posting_class='operational_active' THEN
    NULL; -- guarded no-op until later sub-phase wires ledger emission.
  END IF;

  -- If remittance was ready_to_close, it drops back to allocating.
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
COMMENT ON FUNCTION public.remittance_v2_reverse_allocation(uuid,text,uuid) IS
'Phase 4B. DEFINER. LOCK ORDER: remittance FOR UPDATE, then parent allocation. Inserts a reversal sibling row and negates profit components when the remittance was already closed.';
REVOKE ALL ON FUNCTION public.remittance_v2_reverse_allocation(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remittance_v2_reverse_allocation(uuid,text,uuid) TO authenticated;
