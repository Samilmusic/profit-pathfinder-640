
-- CUSTOMER CREDIT --------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_credit (
  customer_id       UUID PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  credit_limit      NUMERIC(20,4) NOT NULL DEFAULT 0,
  base_currency     TEXT NOT NULL DEFAULT 'AED',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_credit TO authenticated;
GRANT ALL ON public.customer_credit TO service_role;
ALTER TABLE public.customer_credit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read credit" ON public.customer_credit FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers manage credit" ON public.customer_credit FOR ALL TO authenticated
  USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE TRIGGER trg_credit_updated BEFORE UPDATE ON public.customer_credit
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CUSTOMER DEPOSITS ------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_deposits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id           UUID NOT NULL REFERENCES public.customers(id),
  currency              TEXT NOT NULL,
  amount                NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  deposit_account_id    UUID NOT NULL REFERENCES public.accounts(id),
  wallet_account_id     UUID NOT NULL REFERENCES public.accounts(id),
  notes                 TEXT,
  settlement_status     public.settlement_status NOT NULL DEFAULT 'draft',
  completion_note       TEXT,
  created_by            UUID REFERENCES auth.users(id),
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_deposits TO authenticated;
GRANT ALL ON public.customer_deposits TO service_role;
ALTER TABLE public.customer_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read deposits" ON public.customer_deposits FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert deposits" ON public.customer_deposits FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update deposits" ON public.customer_deposits FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "admins delete deposits" ON public.customer_deposits FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_deposits_updated BEFORE UPDATE ON public.customer_deposits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PAYMENT ORDERS ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date               DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id              UUID NOT NULL REFERENCES public.customers(id),
  currency                 TEXT NOT NULL,
  amount                   NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  method                   public.payment_method NOT NULL,
  source_wallet_account_id UUID NOT NULL REFERENCES public.accounts(id),
  paid_from_account_id     UUID REFERENCES public.accounts(id),
  destination_bank         TEXT,
  receiver_name            TEXT,
  receiver_account         TEXT,
  iban_card                TEXT,
  country                  TEXT,
  service_charge_amount    NUMERIC(20,4) NOT NULL DEFAULT 0,
  service_charge_currency  TEXT,
  fee_kind                 public.fee_kind NOT NULL DEFAULT 'fixed',
  fee_input                NUMERIC(20,4),
  notes                    TEXT,
  settlement_status        public.settlement_status NOT NULL DEFAULT 'draft',
  completion_note          TEXT,
  created_by               UUID REFERENCES auth.users(id),
  deleted_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read po" ON public.payment_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert po" ON public.payment_orders FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update po" ON public.payment_orders FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "admins delete po" ON public.payment_orders FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SERVICE CHARGES --------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_charges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  ref_type      TEXT NOT NULL,
  ref_id        UUID,
  customer_id   UUID REFERENCES public.customers(id),
  currency      TEXT NOT NULL,
  amount        NUMERIC(20,4) NOT NULL,
  kind          public.fee_kind NOT NULL DEFAULT 'fixed',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_charges TO authenticated;
GRANT ALL ON public.service_charges TO service_role;
ALTER TABLE public.service_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sc" ON public.service_charges FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers manage sc" ON public.service_charges FOR ALL TO authenticated
  USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));

-- AUTO-CREATE WALLETS ----------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_wallets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ccy TEXT;
BEGIN
  FOREACH ccy IN ARRAY ARRAY['AED','IRR','USD','GBP','EUR','USDT'] LOOP
    INSERT INTO public.accounts (name, account_type, currency, owner, opening_balance, holder_type, holder_customer_id, is_active, notes)
    SELECT 'Wallet - ' || NEW.name || ' (' || ccy || ')', 'customer_wallet', ccy, 'other', 0, 'customer', NEW.id, true, 'Auto-created customer wallet'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE holder_customer_id = NEW.id AND currency = ccy AND account_type = 'customer_wallet' AND deleted_at IS NULL
    );
  END LOOP;
  INSERT INTO public.customer_credit (customer_id) VALUES (NEW.id) ON CONFLICT (customer_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_customer_wallets ON public.customers;
CREATE TRIGGER trg_customer_wallets
AFTER INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.create_customer_wallets();

-- backfill for existing customers
DO $$ DECLARE c RECORD; ccy TEXT;
BEGIN
  FOR c IN SELECT id, name FROM public.customers WHERE deleted_at IS NULL LOOP
    FOREACH ccy IN ARRAY ARRAY['AED','IRR','USD','GBP','EUR','USDT'] LOOP
      INSERT INTO public.accounts (name, account_type, currency, owner, opening_balance, holder_type, holder_customer_id, is_active, notes)
      SELECT 'Wallet - ' || c.name || ' (' || ccy || ')', 'customer_wallet', ccy, 'other', 0, 'customer', c.id, true, 'Auto-created customer wallet'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.accounts
        WHERE holder_customer_id = c.id AND currency = ccy AND account_type = 'customer_wallet' AND deleted_at IS NULL
      );
    END LOOP;
    INSERT INTO public.customer_credit (customer_id) VALUES (c.id) ON CONFLICT (customer_id) DO NOTHING;
  END LOOP;
END $$;

-- LEDGER TRIGGERS --------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_deposit_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'deposit' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.deposit_account_id, NEW.entry_date, NEW.currency, NEW.amount, 'deposit', NEW.id, 'Customer deposit');
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.wallet_account_id, NEW.entry_date, NEW.currency, NEW.amount, 'deposit', NEW.id, 'Wallet credit');
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_deposit_ledger ON public.customer_deposits;
CREATE TRIGGER trg_deposit_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.customer_deposits
FOR EACH ROW EXECUTE FUNCTION public.trg_deposit_ledger();

CREATE OR REPLACE FUNCTION public.trg_payment_order_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type IN ('payment_order','service_charge') AND ref_id = COALESCE(NEW.id, OLD.id);
    DELETE FROM public.service_charges WHERE ref_type='payment_order' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.source_wallet_account_id, NEW.entry_date, NEW.currency, -NEW.amount, 'payment_order', NEW.id, 'Payment order out');
    IF NEW.paid_from_account_id IS NOT NULL THEN
      INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.paid_from_account_id, NEW.entry_date, NEW.currency, -NEW.amount, 'payment_order', NEW.id, 'Payment order paid');
    END IF;
    IF NEW.service_charge_amount > 0 THEN
      INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.source_wallet_account_id, NEW.entry_date,
              COALESCE(NEW.service_charge_currency, NEW.currency),
              -NEW.service_charge_amount, 'service_charge', NEW.id, 'Service charge from wallet');
      IF NEW.paid_from_account_id IS NOT NULL THEN
        INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
        VALUES (NEW.paid_from_account_id, NEW.entry_date,
                COALESCE(NEW.service_charge_currency, NEW.currency),
                NEW.service_charge_amount, 'service_charge', NEW.id, 'Service charge income');
      END IF;
      INSERT INTO public.service_charges (entry_date, ref_type, ref_id, customer_id, currency, amount, kind, notes)
      VALUES (NEW.entry_date, 'payment_order', NEW.id, NEW.customer_id,
              COALESCE(NEW.service_charge_currency, NEW.currency), NEW.service_charge_amount, NEW.fee_kind, NEW.notes);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_payment_order_ledger ON public.payment_orders;
CREATE TRIGGER trg_payment_order_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_payment_order_ledger();

-- COMPLETION ENFORCEMENT -------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_deposit_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NEW.settlement_status = 'completed' AND (TG_OP='INSERT' OR OLD.settlement_status IS DISTINCT FROM 'completed') THEN
    IF COALESCE(NEW.completion_note,'') = '' THEN
      RAISE EXCEPTION 'Completion note is required to mark deposit as completed';
    END IF;
    SELECT count(*) INTO n FROM public.documents
      WHERE ref_type='deposit' AND ref_id=NEW.id
        AND doc_type IN ('payment_receipt','bank_transfer_screenshot','cash_delivery_receipt','deposit_receipt','whatsapp_confirmation');
    IF n = 0 THEN RAISE EXCEPTION 'Cannot complete deposit: proof of receipt is required'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deposit_completion ON public.customer_deposits;
CREATE TRIGGER trg_deposit_completion
BEFORE INSERT OR UPDATE ON public.customer_deposits
FOR EACH ROW EXECUTE FUNCTION public.enforce_deposit_completion();

CREATE OR REPLACE FUNCTION public.enforce_payment_order_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NEW.settlement_status = 'completed' AND (TG_OP='INSERT' OR OLD.settlement_status IS DISTINCT FROM 'completed') THEN
    IF COALESCE(NEW.completion_note,'') = '' THEN
      RAISE EXCEPTION 'Completion note is required to mark payment order as completed';
    END IF;
    SELECT count(*) INTO n FROM public.documents
      WHERE ref_type='payment_order' AND ref_id=NEW.id
        AND doc_type IN ('payment_receipt','bank_transfer_screenshot','cash_delivery_receipt','currency_handover_proof','payment_order_proof','whatsapp_confirmation');
    IF n = 0 THEN RAISE EXCEPTION 'Cannot complete payment order: transfer or delivery proof is required'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_po_completion ON public.payment_orders;
CREATE TRIGGER trg_po_completion
BEFORE INSERT OR UPDATE ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_order_completion();

-- VIEWS ------------------------------------------------------
DROP VIEW IF EXISTS public.customer_wallet_balances CASCADE;
CREATE VIEW public.customer_wallet_balances AS
SELECT
  a.holder_customer_id AS customer_id,
  c.name              AS customer_name,
  a.id                AS account_id,
  a.currency,
  a.opening_balance + COALESCE(SUM(l.amount),0) AS balance,
  MAX(l.entry_date)   AS last_activity
FROM public.accounts a
LEFT JOIN public.ledger_entries l ON l.account_id = a.id
LEFT JOIN public.customers c ON c.id = a.holder_customer_id
WHERE a.account_type = 'customer_wallet' AND a.deleted_at IS NULL
GROUP BY a.holder_customer_id, c.name, a.id, a.currency, a.opening_balance;
GRANT SELECT ON public.customer_wallet_balances TO authenticated;

DROP VIEW IF EXISTS public.company_vs_customer_funds CASCADE;
CREATE VIEW public.company_vs_customer_funds AS
SELECT
  CASE WHEN a.account_type = 'customer_wallet' THEN 'customer' ELSE 'company' END AS bucket,
  a.currency,
  SUM(a.opening_balance + COALESCE(l.amount,0)) AS balance
FROM public.accounts a
LEFT JOIN public.ledger_entries l ON l.account_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY 1, a.currency;
GRANT SELECT ON public.company_vs_customer_funds TO authenticated;

DROP VIEW IF EXISTS public.service_charge_daily CASCADE;
CREATE VIEW public.service_charge_daily AS
SELECT entry_date, currency, SUM(amount) AS total
FROM public.service_charges
GROUP BY entry_date, currency;
GRANT SELECT ON public.service_charge_daily TO authenticated;
