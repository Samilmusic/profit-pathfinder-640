
-- Treat soft-deleted brought_in rows like a delete for ledger + inventory lot
CREATE OR REPLACE FUNCTION public.trg_brought_in_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'brought_in' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.deposit_account_id, NEW.entry_date, NEW.currency, NEW.amount, 'brought_in', NEW.id,
      'Brought in by ' || NEW.brought_by::text || COALESCE(' - ' || NEW.source_name, ''));

    IF NEW.convert_enabled = true AND NEW.final_deposit_account_id IS NOT NULL
       AND NEW.converted_amount IS NOT NULL AND NEW.converted_currency IS NOT NULL THEN
      INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.deposit_account_id, NEW.entry_date, NEW.currency, -NEW.amount, 'brought_in', NEW.id,
        'Converted ' || NEW.amount || ' ' || NEW.currency || ' @ ' || COALESCE(NEW.conversion_rate::text,'?'));

      INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.final_deposit_account_id, NEW.entry_date, NEW.converted_currency, NEW.converted_amount, 'brought_in', NEW.id,
        'Brought-in conversion result (' || NEW.converted_amount || ' ' || NEW.converted_currency || ')');

      IF NEW.conversion_fee_amount IS NOT NULL AND NEW.conversion_fee_amount > 0 THEN
        INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
        VALUES (NEW.final_deposit_account_id, NEW.entry_date,
          COALESCE(NEW.conversion_fee_currency, NEW.converted_currency),
          -NEW.conversion_fee_amount, 'brought_in', NEW.id,
          'Conversion fee (' || COALESCE(NEW.conversion_fee_kind,'fee') || ')');
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_brought_in_lot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.inventory_lots%ROWTYPE;
  consumed NUMERIC := 0;
  used_deals INT := 0;
  new_currency TEXT;
  new_account UUID;
  new_original NUMERIC;
  new_cost_rate NUMERIC;
  new_cost_ccy TEXT;
  new_desc TEXT;
  new_status public.inventory_lot_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.inventory_lots
      WHERE source_ref_type = 'brought_in' AND source_ref_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Soft-delete / cancellation → remove the lot so it stops counting.
  IF NEW.deleted_at IS NOT NULL THEN
    SELECT * INTO existing
      FROM public.inventory_lots
     WHERE source_ref_type = 'brought_in' AND source_ref_id = NEW.id
     LIMIT 1;
    IF FOUND THEN
      SELECT COALESCE(SUM(amount),0), COUNT(DISTINCT sell_ref_id)
        INTO consumed, used_deals
        FROM public.lot_consumptions WHERE lot_id = existing.id;
      IF consumed > 0 THEN
        RAISE EXCEPTION
          'Cannot cancel brought-in: lot % has been used in % deal(s) (% % consumed). Reverse the deals first or use Accounting Correction.',
          existing.lot_code, used_deals, consumed, existing.currency;
      END IF;
      DELETE FROM public.inventory_lots WHERE id = existing.id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.convert_enabled = true
     AND NEW.final_deposit_account_id IS NOT NULL
     AND NEW.converted_amount IS NOT NULL
     AND NEW.converted_currency IS NOT NULL
     AND NEW.conversion_rate IS NOT NULL THEN
    new_currency := NEW.converted_currency;
    new_account  := NEW.final_deposit_account_id;
    new_original := NEW.converted_amount;
    new_cost_rate := NEW.conversion_rate;
    new_cost_ccy  := NEW.currency;
    new_desc := 'Brought-in by ' || NEW.brought_by::text
      || COALESCE(' - ' || NEW.source_name, '')
      || ' — converted ' || NEW.amount || ' ' || NEW.currency
      || ' @ ' || NEW.conversion_rate;
  ELSE
    new_currency := NEW.currency;
    new_account  := NEW.deposit_account_id;
    new_original := NEW.amount;
    new_cost_rate := 1;
    new_cost_ccy  := NEW.currency;
    new_desc := 'Brought-in by ' || NEW.brought_by::text
      || COALESCE(' - ' || NEW.source_name, '');
  END IF;

  SELECT * INTO existing
    FROM public.inventory_lots
   WHERE source_ref_type = 'brought_in' AND source_ref_id = NEW.id
   LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(SUM(amount), 0), COUNT(DISTINCT sell_ref_id)
      INTO consumed, used_deals
      FROM public.lot_consumptions WHERE lot_id = existing.id;

    IF consumed > 0 THEN
      IF new_currency <> existing.currency
         OR COALESCE(new_account::text,'') <> COALESCE(existing.account_id::text,'')
         OR new_original < consumed
         OR new_cost_rate <> existing.cost_basis_rate
         OR new_cost_ccy  <> existing.cost_basis_currency THEN
        RAISE EXCEPTION
          'Lot % is already used in % deal(s) (% % consumed). Cannot change currency, account, cost basis, or reduce original amount below consumed. Use Accounting Correction to override.',
          existing.lot_code, used_deals, consumed, existing.currency;
      END IF;
    END IF;

    new_status := (CASE
      WHEN GREATEST(0, new_original - consumed) <= 0 THEN 'depleted'
      WHEN consumed > 0 THEN 'partial'
      ELSE 'available'
    END)::inventory_lot_status;

    UPDATE public.inventory_lots
       SET currency            = new_currency,
           account_id          = new_account,
           original_amount     = new_original,
           remaining_amount    = GREATEST(0, new_original - consumed),
           cost_basis_rate     = new_cost_rate,
           cost_basis_currency = new_cost_ccy,
           source_description  = new_desc,
           entry_date          = NEW.entry_date,
           status              = new_status
     WHERE id = existing.id;
  ELSE
    INSERT INTO public.inventory_lots
      (currency, account_id, original_amount, remaining_amount,
       cost_basis_rate, cost_basis_currency,
       source_ref_type, source_ref_id, source_description, entry_date, created_by)
    VALUES (
      new_currency, new_account, new_original, new_original,
      new_cost_rate, new_cost_ccy,
      'brought_in', NEW.id, new_desc, NEW.entry_date, NEW.created_by);
  END IF;

  RETURN NEW;
END
$function$;

-- Admin repair: purge lots + ledger entries left behind by cancelled/soft-deleted records
CREATE OR REPLACE FUNCTION public.admin_recalculate_balances()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lots_removed INT := 0;
  ledger_removed INT := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  -- Brought-in: cancelled rows should not produce inventory or ledger
  WITH del AS (
    DELETE FROM public.inventory_lots l
     USING public.brought_in_money b
     WHERE l.source_ref_type = 'brought_in'
       AND l.source_ref_id = b.id
       AND b.deleted_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.lot_consumptions c WHERE c.lot_id = l.id)
    RETURNING 1)
  SELECT count(*) INTO lots_removed FROM del;

  WITH del AS (
    DELETE FROM public.ledger_entries le
     USING public.brought_in_money b
     WHERE le.ref_type = 'brought_in'
       AND le.ref_id = b.id
       AND b.deleted_at IS NOT NULL
    RETURNING 1)
  SELECT count(*) INTO ledger_removed FROM del;

  -- Also purge lots for buy/sell rows that were soft-deleted but left a lot behind
  DELETE FROM public.inventory_lots l
   USING public.buy_transactions b
   WHERE l.source_ref_type = 'buy'
     AND l.source_ref_id = b.id
     AND b.deleted_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.lot_consumptions c WHERE c.lot_id = l.id);

  DELETE FROM public.ledger_entries le
   USING public.buy_transactions b
   WHERE le.ref_type = 'buy' AND le.ref_id = b.id AND b.deleted_at IS NOT NULL;

  RETURN jsonb_build_object(
    'lots_removed', lots_removed,
    'ledger_entries_removed', ledger_removed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_recalculate_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recalculate_balances() TO authenticated;

-- One-off cleanup for existing cancelled brought-in rows
DELETE FROM public.inventory_lots l
 USING public.brought_in_money b
 WHERE l.source_ref_type = 'brought_in'
   AND l.source_ref_id = b.id
   AND b.deleted_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.lot_consumptions c WHERE c.lot_id = l.id);

DELETE FROM public.ledger_entries le
 USING public.brought_in_money b
 WHERE le.ref_type = 'brought_in'
   AND le.ref_id = b.id
   AND b.deleted_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
