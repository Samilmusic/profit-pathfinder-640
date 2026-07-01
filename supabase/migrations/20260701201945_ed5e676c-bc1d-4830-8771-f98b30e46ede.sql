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

  -- EXCHANGE ACCOUNTING RULE:
  -- A cross-currency sell (sold ccy <> received ccy) is an asset conversion.
  -- The received currency becomes inventory. Realized profit is ALWAYS 0 here;
  -- profit is only realized when the trade cycle closes (currency bought back).
  IF NEW.sold_currency = NEW.received_currency AND r.cost_ccy = NEW.received_currency THEN
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

-- Also make received IRR from a sell become an inventory lot so it can be sold back later
CREATE OR REPLACE FUNCTION public.trg_sell_received_lot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.inventory_lots WHERE source_ref_type='sell' AND source_ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE')
     AND NEW.deleted_at IS NULL
     AND NEW.deal_status NOT IN ('cancelled')
     AND NEW.sold_currency <> NEW.received_currency
     AND NEW.received_into_account_id IS NOT NULL THEN
    INSERT INTO public.inventory_lots
      (currency, account_id, original_amount, remaining_amount,
       cost_basis_rate, cost_basis_currency,
       source_ref_type, source_ref_id, source_description, entry_date, created_by)
    VALUES (
      NEW.received_currency, NEW.received_into_account_id,
      NEW.received_amount, NEW.received_amount,
      CASE WHEN NEW.received_amount > 0 THEN NEW.sold_amount / NEW.received_amount ELSE 0 END,
      NEW.sold_currency,
      'sell', NEW.id,
      'Received from sell of ' || NEW.sold_amount || ' ' || NEW.sold_currency || ' @ ' || NEW.sell_rate,
      NEW.entry_date, NEW.created_by);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS sell_received_lot ON public.sell_transactions;
CREATE TRIGGER sell_received_lot
AFTER INSERT OR UPDATE OR DELETE ON public.sell_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_sell_received_lot();