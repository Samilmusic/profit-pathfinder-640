
ALTER TYPE public.ledger_ref_type ADD VALUE IF NOT EXISTS 'remittance';

DO $$ BEGIN
  CREATE TYPE public.remittance_status AS ENUM (
    'open','waiting_customer_payment','payment_received','waiting_transfer',
    'transfer_completed','waiting_transfer_proof','ready_to_close','closed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.remittance_commission_method AS ENUM ('fixed','percentage','included','free');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.remittance_transfer_method AS ENUM ('bank_transfer','cash_delivery','wallet_transfer','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no TEXT UNIQUE,
  status public.remittance_status NOT NULL DEFAULT 'open',
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_phone TEXT,
  customer_reference TEXT,
  transfer_currency TEXT NOT NULL,
  transferred_amount NUMERIC(20,4) NOT NULL CHECK (transferred_amount > 0),
  transfer_date DATE,
  transfer_method public.remittance_transfer_method NOT NULL DEFAULT 'bank_transfer',
  beneficiary_name TEXT,
  beneficiary_bank TEXT,
  beneficiary_account_number TEXT,
  beneficiary_iban TEXT,
  beneficiary_card_number TEXT,
  beneficiary_country TEXT,
  beneficiary_notes TEXT,
  source_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  customer_payment_currency TEXT NOT NULL,
  customer_payment_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  reference_rate NUMERIC(24,10) NOT NULL DEFAULT 0,
  payment_received_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  payment_status TEXT DEFAULT 'pending',
  commission_method public.remittance_commission_method NOT NULL DEFAULT 'included',
  commission_fixed_amount NUMERIC(20,4),
  commission_fixed_currency TEXT,
  commission_percentage NUMERIC(10,4),
  gross_commission_pay_ccy NUMERIC(20,4) NOT NULL DEFAULT 0,
  gross_commission_aed NUMERIC(20,4) NOT NULL DEFAULT 0,
  linked_expenses_aed NUMERIC(20,4) NOT NULL DEFAULT 0,
  net_commission_aed NUMERIC(20,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remittances_status ON public.remittances(status);
CREATE INDEX IF NOT EXISTS idx_remittances_customer ON public.remittances(customer_id);
CREATE INDEX IF NOT EXISTS idx_remittances_entry_date ON public.remittances(entry_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittances TO authenticated;
GRANT ALL ON public.remittances TO service_role;
ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view remittances" ON public.remittances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert remittances" ON public.remittances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update remittances" ON public.remittances FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete remittances" ON public.remittances FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.remittance_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id UUID NOT NULL REFERENCES public.remittances(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount NUMERIC(20,4) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'AED',
  amount_aed NUMERIC(20,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_remittance_expenses_rid ON public.remittance_expenses(remittance_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_expenses TO authenticated;
GRANT ALL ON public.remittance_expenses TO service_role;
ALTER TABLE public.remittance_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage remittance expenses" ON public.remittance_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.trg_remittance_doc_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.doc_no IS NULL OR NEW.doc_no = '' THEN
    NEW.doc_no := public.next_doc_no('REM', EXTRACT(YEAR FROM COALESCE(NEW.entry_date, CURRENT_DATE))::int);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS remittance_doc_code ON public.remittances;
CREATE TRIGGER remittance_doc_code BEFORE INSERT ON public.remittances
  FOR EACH ROW EXECUTE FUNCTION public.trg_remittance_doc_code();

DROP TRIGGER IF EXISTS remittance_touch_updated ON public.remittances;
CREATE TRIGGER remittance_touch_updated BEFORE UPDATE ON public.remittances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_remittance_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.ledger_entries
    WHERE ref_type = 'remittance' AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.status = 'closed' THEN
    IF NEW.source_account_id IS NOT NULL THEN
      INSERT INTO public.ledger_entries (account_id, currency, amount, ref_type, ref_id, entry_date, description)
      VALUES (NEW.source_account_id, NEW.transfer_currency, -NEW.transferred_amount, 'remittance', NEW.id, NEW.entry_date,
        'Remittance out — ' || COALESCE(NEW.doc_no,'') || COALESCE(' → '||NEW.beneficiary_name,''));
    END IF;
    IF NEW.payment_received_account_id IS NOT NULL AND NEW.customer_payment_amount > 0 THEN
      INSERT INTO public.ledger_entries (account_id, currency, amount, ref_type, ref_id, entry_date, description)
      VALUES (NEW.payment_received_account_id, NEW.customer_payment_currency, NEW.customer_payment_amount, 'remittance', NEW.id, NEW.entry_date,
        'Remittance payment in — ' || COALESCE(NEW.doc_no,''));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS remittance_ledger ON public.remittances;
CREATE TRIGGER remittance_ledger AFTER INSERT OR UPDATE OR DELETE ON public.remittances
  FOR EACH ROW EXECUTE FUNCTION public.trg_remittance_ledger();
