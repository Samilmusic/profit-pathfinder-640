CREATE OR REPLACE FUNCTION public.consume_lots_fifo(_sell_id uuid, _currency text, _account_id uuid, _amount numeric, _entry_date date)
 RETURNS TABLE(total_cost numeric, cost_ccy text, blended_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lot RECORD; need NUMERIC := _amount; take NUMERIC; c_ccy TEXT; t_cost NUMERIC := 0;
BEGIN
  FOR lot IN SELECT lot_id, amount FROM public.lot_consumptions
             WHERE sell_ref_type='sell' AND sell_ref_id=_sell_id LOOP
    UPDATE public.inventory_lots
       SET remaining_amount = remaining_amount + lot.amount,
           status = (CASE WHEN remaining_amount + lot.amount >= original_amount THEN 'available'
                         WHEN remaining_amount + lot.amount > 0 THEN 'partial' ELSE 'depleted' END)::inventory_lot_status
     WHERE id = lot.lot_id;
  END LOOP;
  DELETE FROM public.lot_consumptions WHERE sell_ref_type='sell' AND sell_ref_id=_sell_id;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, _currency, 0::NUMERIC;
    RETURN;
  END IF;

  FOR lot IN
    SELECT * FROM public.inventory_lots
     WHERE currency = _currency
       AND (_account_id IS NULL OR account_id = _account_id)
       AND remaining_amount > 0
       AND status <> 'depleted'
     ORDER BY entry_date ASC, created_at ASC
  LOOP
    EXIT WHEN need <= 0;
    take := LEAST(need, lot.remaining_amount);
    IF c_ccy IS NULL THEN c_ccy := lot.cost_basis_currency; END IF;

    INSERT INTO public.lot_consumptions
      (lot_id, sell_ref_type, sell_ref_id, currency, amount, cost_rate, cost_amount, cost_basis_currency, entry_date)
    VALUES (lot.id, 'sell', _sell_id, _currency, take, lot.cost_basis_rate,
            ROUND(take * lot.cost_basis_rate, 6), lot.cost_basis_currency, _entry_date);

    UPDATE public.inventory_lots
       SET remaining_amount = remaining_amount - take,
           status = (CASE WHEN remaining_amount - take <= 0 THEN 'depleted' ELSE 'partial' END)::inventory_lot_status
     WHERE id = lot.id;

    t_cost := t_cost + (take * lot.cost_basis_rate);
    need := need - take;
  END LOOP;

  RETURN QUERY SELECT ROUND(t_cost,6),
                      COALESCE(c_ccy, _currency),
                      CASE WHEN (_amount - need) > 0 THEN ROUND(t_cost / (_amount - need), 8) ELSE 0 END;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_sell_calc_and_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR r IN SELECT lot_id, amount FROM public.lot_consumptions
             WHERE sell_ref_type='sell' AND sell_ref_id=OLD.id LOOP
      UPDATE public.inventory_lots
         SET remaining_amount = remaining_amount + r.amount,
             status = (CASE WHEN remaining_amount + r.amount >= original_amount THEN 'available'
                           WHEN remaining_amount + r.amount > 0 THEN 'partial' ELSE 'depleted' END)::inventory_lot_status
       WHERE id = r.lot_id;
    END LOOP;
    DELETE FROM public.lot_consumptions WHERE sell_ref_type='sell' AND sell_ref_id=OLD.id;
    DELETE FROM public.ledger_entries WHERE ref_type='sell' AND ref_id=OLD.id;
    RETURN OLD;
  END IF;

  SELECT * INTO r FROM public.consume_lots_fifo(
    NEW.id, NEW.sold_currency, NEW.sold_from_account_id, NEW.sold_amount, NEW.entry_date);

  NEW.cost_basis_rate := r.blended_rate;
  NEW.cost_basis_amount := r.total_cost;

  IF r.cost_ccy = NEW.received_currency THEN
    NEW.gross_profit := NEW.received_amount - r.total_cost;
  ELSE
    NEW.gross_profit := 0;
  END IF;

  IF (NEW.milad_share_pct + NEW.ali_share_pct) <> 100 THEN
    NEW.ali_share_pct := 100 - NEW.milad_share_pct;
  END IF;
  NEW.milad_profit := ROUND(NEW.gross_profit * NEW.milad_share_pct / 100, 4);
  NEW.ali_profit  := ROUND(NEW.gross_profit * NEW.ali_share_pct  / 100, 4);

  IF TG_OP = 'UPDATE' THEN
    DELETE FROM public.ledger_entries WHERE ref_type='sell' AND ref_id=NEW.id;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_sell_deal(_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE r RECORD;
BEGIN
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required to cancel a deal';
  END IF;
  IF NOT public.can_write(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  PERFORM public.set_edit_context(_reason, NULL);

  FOR r IN SELECT lot_id, amount FROM public.lot_consumptions
           WHERE sell_ref_type='sell' AND sell_ref_id=_id LOOP
    UPDATE public.inventory_lots
       SET remaining_amount = remaining_amount + r.amount,
           status = (CASE WHEN remaining_amount + r.amount >= original_amount THEN 'available'
                         WHEN remaining_amount + r.amount > 0 THEN 'partial' ELSE 'depleted' END)::inventory_lot_status
     WHERE id = r.lot_id;
  END LOOP;
  DELETE FROM public.lot_consumptions WHERE sell_ref_type='sell' AND sell_ref_id=_id;

  UPDATE public.sell_transactions
     SET deal_status='cancelled', cancel_reason=_reason, updated_at=now()
   WHERE id=_id;

  DELETE FROM public.ledger_entries WHERE ref_type='sell' AND ref_id=_id;
END $function$;