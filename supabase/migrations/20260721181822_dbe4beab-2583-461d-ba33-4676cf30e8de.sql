-- Phase 4F correction: allocate_buy must only operate within 'allocating'.
-- Settlement RPCs (record_supplier_delivery / record_third_party_settlement)
-- remain the single authoritative path INTO 'allocating'.
CREATE OR REPLACE FUNCTION public.remittance_v2_allocate_buy(
  _remittance_id uuid, _buy_id uuid, _amount numeric,
  _notes text DEFAULT NULL::text, _client_request_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Single authoritative path into 'allocating' is via settlement RPCs.
  -- allocate_buy strictly operates WITHIN 'allocating' and never transitions state.
  IF r.workflow_state <> 'allocating' THEN
    RAISE EXCEPTION 'allocate_buy requires workflow_state=allocating (got %)', r.workflow_state
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

  -- No state transition here: stays in 'allocating'. Bump updated_at only.
  UPDATE public.remittances SET updated_at=now() WHERE id=_remittance_id;

  INSERT INTO public.remittance_settlement_events(remittance_id,event_type,payload,actor)
  VALUES (_remittance_id,'buy_allocated',
          jsonb_build_object('allocation_id',alloc_id,'buy_id',_buy_id,'amount',_amount),
          auth.uid());

  IF _client_request_id IS NOT NULL THEN
    PERFORM public._idem_store(_client_request_id,'remittance_v2_allocate_buy',
                               jsonb_build_object('allocation_id',alloc_id));
  END IF;
  RETURN alloc_id;
END $function$;