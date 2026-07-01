CREATE OR REPLACE FUNCTION public.enforce_sell_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  avail NUMERIC;
  own_consumed NUMERIC;
BEGIN
  IF NEW.sell_rate IS NULL OR NEW.sell_rate <= 0 THEN
    RAISE EXCEPTION 'Sell rate is required';
  END IF;
  IF NEW.sold_amount IS NULL OR NEW.sold_amount <= 0 THEN
    RAISE EXCEPTION 'Sold amount is required';
  END IF;

  SELECT COALESCE(SUM(remaining_amount),0) INTO avail
    FROM public.inventory_lots
   WHERE currency = NEW.sold_currency
     AND (NEW.sold_from_account_id IS NULL OR account_id = NEW.sold_from_account_id)
     AND status <> 'depleted';

  -- Amount already consumed by THIS sell counts as available (it was consumed in the BEFORE trigger)
  SELECT COALESCE(SUM(amount),0) INTO own_consumed
    FROM public.lot_consumptions
   WHERE sell_ref_type='sell' AND sell_ref_id = NEW.id;

  IF avail + own_consumed + 0.00001 < NEW.sold_amount THEN
    RAISE EXCEPTION 'Not enough % inventory in selected account. Available: %',
      NEW.sold_currency, avail + own_consumed;
  END IF;
  RETURN NEW;
END $function$;