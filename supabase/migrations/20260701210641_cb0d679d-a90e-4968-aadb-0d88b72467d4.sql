
-- Fix: never count expected customer payment as inventory or balance.
-- Received-currency inventory lot must only exist AFTER the customer has actually paid.

CREATE OR REPLACE FUNCTION public.sync_sell_received_lot(_sell_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.sell_transactions%ROWTYPE;
  paid numeric := 0;
BEGIN
  SELECT * INTO s FROM public.sell_transactions WHERE id = _sell_id;
  IF NOT FOUND THEN
    DELETE FROM public.inventory_lots WHERE source_ref_type='sell' AND source_ref_id=_sell_id;
    RETURN;
  END IF;

  -- Always wipe existing lot; we recreate only when qualifying
  DELETE FROM public.inventory_lots WHERE source_ref_type='sell' AND source_ref_id=_sell_id;

  IF s.deleted_at IS NOT NULL
     OR s.deal_status = 'cancelled'
     OR s.sold_currency = s.received_currency
     OR s.received_into_account_id IS NULL
     OR s.received_amount IS NULL OR s.received_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.sell_payments
   WHERE sell_id = _sell_id AND deleted_at IS NULL AND currency = s.received_currency;

  -- Only materialise inventory once customer payment has actually been received
  -- (either logged via sell_payments OR the deal is closed).
  IF paid + 0.0001 < s.received_amount AND s.deal_status <> 'closed' THEN
    RETURN;
  END IF;

  INSERT INTO public.inventory_lots
    (currency, account_id, original_amount, remaining_amount,
     cost_basis_rate, cost_basis_currency,
     source_ref_type, source_ref_id, source_description, entry_date, created_by)
  VALUES (
    s.received_currency, s.received_into_account_id,
    s.received_amount, s.received_amount,
    CASE WHEN s.received_amount > 0 THEN s.sold_amount / s.received_amount ELSE 0 END,
    s.sold_currency,
    'sell', s.id,
    'Received from sell of ' || s.sold_amount || ' ' || s.sold_currency || ' @ ' || s.sell_rate,
    COALESCE(s.entry_date, CURRENT_DATE), s.created_by);
END $$;

-- Replace the old sell-received-lot trigger fn so it delegates to the sync fn
CREATE OR REPLACE FUNCTION public.trg_sell_received_lot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.inventory_lots WHERE source_ref_type='sell' AND source_ref_id = OLD.id;
    RETURN OLD;
  END IF;
  PERFORM public.sync_sell_received_lot(NEW.id);
  RETURN NEW;
END $$;

-- When a sell payment is added / updated / deleted, re-evaluate the inventory lot too
CREATE OR REPLACE FUNCTION public.trg_sell_payment_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  _id := COALESCE(NEW.sell_id, OLD.sell_id);
  PERFORM public.recompute_sell_deal_status(_id);
  PERFORM public.sync_sell_received_lot(_id);
  RETURN COALESCE(NEW, OLD);
END $$;

-- Retro-fix existing data: rebuild all sell-received lots under the new rule
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.sell_transactions WHERE deleted_at IS NULL LOOP
    PERFORM public.sync_sell_received_lot(r.id);
  END LOOP;
END $$;
