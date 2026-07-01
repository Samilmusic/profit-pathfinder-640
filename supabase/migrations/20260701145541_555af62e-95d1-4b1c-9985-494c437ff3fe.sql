
ALTER TABLE public.brought_in_money
  ADD COLUMN IF NOT EXISTS convert_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS converted_currency TEXT,
  ADD COLUMN IF NOT EXISTS converted_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS final_deposit_account_id UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS conversion_fee_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS conversion_fee_currency TEXT,
  ADD COLUMN IF NOT EXISTS conversion_fee_kind TEXT,
  ADD COLUMN IF NOT EXISTS source_location_label TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

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

  IF TG_OP IN ('INSERT','UPDATE') THEN
    -- Step 1: credit the source (deposit_account_id) with the original currency
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.deposit_account_id, NEW.entry_date, NEW.currency, NEW.amount, 'brought_in', NEW.id,
      'Brought in by ' || NEW.brought_by::text || COALESCE(' - ' || NEW.source_name, ''));

    IF NEW.convert_enabled = true AND NEW.final_deposit_account_id IS NOT NULL
       AND NEW.converted_amount IS NOT NULL AND NEW.converted_currency IS NOT NULL THEN
      -- Step 2: debit original currency out of source (conversion)
      INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.deposit_account_id, NEW.entry_date, NEW.currency, -NEW.amount, 'brought_in', NEW.id,
        'Converted ' || NEW.amount || ' ' || NEW.currency || ' @ ' || COALESCE(NEW.conversion_rate::text,'?'));

      -- Step 3: credit converted amount into final account
      INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.final_deposit_account_id, NEW.entry_date, NEW.converted_currency, NEW.converted_amount, 'brought_in', NEW.id,
        'Brought-in conversion result (' || NEW.converted_amount || ' ' || NEW.converted_currency || ')');

      -- Step 4: optional conversion fee debited from final account
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
END; $function$;
