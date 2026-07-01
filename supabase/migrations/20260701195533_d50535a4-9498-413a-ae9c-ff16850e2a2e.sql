
CREATE OR REPLACE FUNCTION public.trg_sell_cycle_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_cycle uuid; method text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.trade_cycle_id IS NOT NULL THEN
      PERFORM public.recompute_cycle_profit(OLD.trade_cycle_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.trade_cycle_id IS NULL AND COALESCE(NEW.creates_cycle,false)
     AND NEW.deal_status = 'closed' THEN
    SELECT profit_recognition_method INTO method FROM public.app_settings LIMIT 1;
    IF method = 'cycle' THEN
      INSERT INTO public.trade_cycles (
        title, entry_date, customer_id, base_currency, quote_currency,
        capital_currency, capital_amount, initial_currency, initial_amount,
        initial_account_id, intermediate_currency, intermediate_account_id,
        final_currency, sell_rate, status, cycle_kind, created_by, notes
      ) VALUES (
        'Cycle from sell ' || COALESCE(NEW.sold_currency,'') || '→' || COALESCE(NEW.received_currency,''),
        NEW.entry_date, NEW.customer_id,
        NEW.sold_currency, NEW.received_currency,
        NEW.sold_currency, NEW.sold_amount,
        NEW.sold_currency, NEW.sold_amount, NEW.sold_from_account_id,
        NEW.received_currency, NEW.received_into_account_id,
        NEW.sold_currency, NEW.sell_rate, 'open', 'buyback',
        NEW.created_by, 'Auto-created from sell'
      ) RETURNING id INTO new_cycle;
      NEW.trade_cycle_id := new_cycle;
    END IF;
  END IF;

  IF NEW.trade_cycle_id IS NOT NULL AND NEW.deal_status = 'closed' THEN
    PERFORM public.recompute_cycle_profit(NEW.trade_cycle_id);
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_sell_cycle_sync() FROM PUBLIC, anon, authenticated;
