
-- 1) Sequence-based lot code generator (replaces count-based, which collides on edits)
CREATE SEQUENCE IF NOT EXISTS public.inventory_lot_code_seq;

-- Seed sequence past any existing numeric suffix so freshly generated codes never collide.
SELECT setval(
  'public.inventory_lot_code_seq',
  GREATEST(
    1,
    COALESCE((
      SELECT MAX((regexp_replace(lot_code, '^[^-]+-', ''))::int)
      FROM public.inventory_lots
      WHERE lot_code ~ '^[A-Za-z]+-\d+$'
    ), 0)
  )
);

CREATE OR REPLACE FUNCTION public.trg_inventory_lot_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lot_code IS NULL OR NEW.lot_code = '' THEN
    NEW.lot_code := COALESCE(NEW.currency, 'LOT')
      || '-' || lpad(nextval('public.inventory_lot_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END
$$;

-- 2) Brought-in lot: update in place on UPDATE (preserves lot_code and identity).
--    Block quantity/currency/cost changes once the lot has been consumed.
CREATE OR REPLACE FUNCTION public.trg_brought_in_lot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Derive the lot shape from the brought-in row
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
    SELECT COALESCE(SUM(amount), 0),
           COUNT(DISTINCT sell_ref_id)
      INTO consumed, used_deals
      FROM public.lot_consumptions
     WHERE lot_id = existing.id;

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
$$;
