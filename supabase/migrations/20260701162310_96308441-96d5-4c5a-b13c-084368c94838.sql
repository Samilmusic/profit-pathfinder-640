
CREATE TABLE public.customer_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  nickname TEXT,
  bank_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  country TEXT,
  holder_name TEXT,
  iban TEXT,
  account_number TEXT,
  card_number TEXT,
  swift_bic TEXT,
  sort_code TEXT,
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  cancel_reason TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_bank_accounts TO authenticated;
GRANT ALL ON public.customer_bank_accounts TO service_role;

ALTER TABLE public.customer_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cba read" ON public.customer_bank_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "cba insert" ON public.customer_bank_accounts FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "cba update" ON public.customer_bank_accounts FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "cba delete" ON public.customer_bank_accounts FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX idx_cba_customer ON public.customer_bank_accounts(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cba_currency ON public.customer_bank_accounts(currency) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_cba_updated_at BEFORE UPDATE ON public.customer_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_cba_audit AFTER INSERT OR UPDATE OR DELETE ON public.customer_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();

-- Ensure only one default per customer/currency
CREATE OR REPLACE FUNCTION public.trg_cba_single_default() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.customer_bank_accounts
       SET is_default = false
     WHERE customer_id = NEW.customer_id
       AND currency = NEW.currency
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_cba_default BEFORE INSERT OR UPDATE OF is_default ON public.customer_bank_accounts
  FOR EACH ROW WHEN (NEW.is_default = true) EXECUTE FUNCTION public.trg_cba_single_default();

-- Add table to cancel_record allowlist
CREATE OR REPLACE FUNCTION public.cancel_record(_table text, _id uuid, _reason text, _device text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required to cancel a record';
  END IF;
  IF NOT public.can_write(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _table NOT IN ('customer_deposits','buy_transactions','sell_transactions','transfers','expenses','brought_in_money','trade_cycles','payment_orders','customers','accounts','customer_bank_accounts') THEN
    RAISE EXCEPTION 'Table % not cancellable', _table;
  END IF;
  PERFORM public.set_edit_context(_reason, _device);
  EXECUTE format('UPDATE public.%I SET deleted_at = now(), cancel_reason = $1 WHERE id = $2 AND deleted_at IS NULL', _table)
    USING _reason, _id;
END $function$;
