
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'milad', 'ali', 'viewer');
CREATE TYPE public.account_type AS ENUM ('cash', 'toman_bank', 'aed_bank', 'foreign_currency', 'wallet');
CREATE TYPE public.account_owner AS ENUM ('milad', 'ali', 'shared', 'other');
CREATE TYPE public.brought_in_reason AS ENUM ('capital', 'for_exchange', 'customer_payment', 'temporary_deposit', 'other');
CREATE TYPE public.brought_in_by AS ENUM ('milad', 'ali', 'customer', 'other');
CREATE TYPE public.txn_owner AS ENUM ('milad', 'ali', 'shared');
CREATE TYPE public.paid_by AS ENUM ('milad', 'ali');
CREATE TYPE public.ledger_ref_type AS ENUM ('brought_in','buy','sell','expense','transfer','opening_balance','adjustment');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin'); $$;

CREATE OR REPLACE FUNCTION public.can_write(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','milad','ali'));
$$;

CREATE POLICY "authenticated can read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ AUTO-CREATE PROFILE + FIRST ADMIN ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ UPDATED_AT HELPER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ ACCOUNTS ============
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  account_type public.account_type NOT NULL,
  currency TEXT NOT NULL,
  bank_name TEXT,
  holder_name TEXT,
  account_number TEXT,
  iban TEXT,
  card_number TEXT,
  owner public.account_owner NOT NULL DEFAULT 'shared',
  opening_balance NUMERIC(20,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  low_balance_threshold NUMERIC(20,4),
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read accounts" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert accounts" ON public.accounts FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update accounts" ON public.accounts FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "admin delete accounts" ON public.accounts FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  account_details TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update customers" ON public.customers FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "admin delete customers" ON public.customers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ LEDGER ENTRIES (double-entry) ============
CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currency TEXT NOT NULL,
  amount NUMERIC(20,4) NOT NULL, -- positive in, negative out
  ref_type public.ledger_ref_type NOT NULL,
  ref_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_account_idx ON public.ledger_entries(account_id);
CREATE INDEX ledger_ref_idx ON public.ledger_entries(ref_type, ref_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read ledger" ON public.ledger_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers write ledger" ON public.ledger_entries FOR ALL TO authenticated
  USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));

-- ============ BROUGHT IN MONEY ============
CREATE TABLE public.brought_in_money (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  brought_by public.brought_in_by NOT NULL,
  source_name TEXT,
  currency TEXT NOT NULL,
  amount NUMERIC(20,4) NOT NULL,
  deposit_account_id UUID NOT NULL REFERENCES public.accounts(id),
  sender_bank_name TEXT,
  sender_account_name TEXT,
  sender_account_number TEXT,
  reason public.brought_in_reason NOT NULL DEFAULT 'for_exchange',
  notes TEXT,
  attachment_url TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brought_in_money TO authenticated;
GRANT ALL ON public.brought_in_money TO service_role;
ALTER TABLE public.brought_in_money ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read brought_in" ON public.brought_in_money FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert brought_in" ON public.brought_in_money FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update brought_in" ON public.brought_in_money FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "admin delete brought_in" ON public.brought_in_money FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER brought_in_updated_at BEFORE UPDATE ON public.brought_in_money FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger to create ledger entries
CREATE OR REPLACE FUNCTION public.trg_brought_in_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.deposit_account_id, NEW.entry_date, NEW.currency, NEW.amount, 'brought_in', NEW.id,
      'Brought in by ' || NEW.brought_by::text || COALESCE(' - ' || NEW.source_name, ''));
  ELSIF TG_OP = 'UPDATE' THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'brought_in' AND ref_id = NEW.id;
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.deposit_account_id, NEW.entry_date, NEW.currency, NEW.amount, 'brought_in', NEW.id,
      'Brought in by ' || NEW.brought_by::text || COALESCE(' - ' || NEW.source_name, ''));
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'brought_in' AND ref_id = OLD.id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_brought_in_ledger AFTER INSERT OR UPDATE OR DELETE ON public.brought_in_money
FOR EACH ROW EXECUTE FUNCTION public.trg_brought_in_ledger();

-- ============ BUY TRANSACTIONS ============
CREATE TABLE public.buy_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  bought_currency TEXT NOT NULL,
  bought_amount NUMERIC(20,4) NOT NULL,
  buy_rate NUMERIC(20,8) NOT NULL, -- how much paid_currency per 1 bought_currency
  paid_currency TEXT NOT NULL,
  paid_amount NUMERIC(20,4) NOT NULL,
  paid_from_account_id UUID NOT NULL REFERENCES public.accounts(id),
  received_into_account_id UUID NOT NULL REFERENCES public.accounts(id),
  counterparty TEXT,
  customer_id UUID REFERENCES public.customers(id),
  txn_owner public.txn_owner NOT NULL DEFAULT 'shared',
  notes TEXT,
  attachment_url TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buy_transactions TO authenticated;
GRANT ALL ON public.buy_transactions TO service_role;
ALTER TABLE public.buy_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read buy" ON public.buy_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert buy" ON public.buy_transactions FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update buy" ON public.buy_transactions FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "admin delete buy" ON public.buy_transactions FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER buy_updated_at BEFORE UPDATE ON public.buy_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_buy_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'buy' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.paid_from_account_id, NEW.entry_date, NEW.paid_currency, -NEW.paid_amount, 'buy', NEW.id,
      'Bought ' || NEW.bought_amount || ' ' || NEW.bought_currency || ' @ ' || NEW.buy_rate);
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.received_into_account_id, NEW.entry_date, NEW.bought_currency, NEW.bought_amount, 'buy', NEW.id,
      'Bought ' || NEW.bought_amount || ' ' || NEW.bought_currency || ' @ ' || NEW.buy_rate);
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_buy_ledger AFTER INSERT OR UPDATE OR DELETE ON public.buy_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_buy_ledger();

-- ============ SELL TRANSACTIONS ============
CREATE TABLE public.sell_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sold_currency TEXT NOT NULL,
  sold_amount NUMERIC(20,4) NOT NULL,
  sell_rate NUMERIC(20,8) NOT NULL,
  received_currency TEXT NOT NULL,
  received_amount NUMERIC(20,4) NOT NULL,
  sold_from_account_id UUID NOT NULL REFERENCES public.accounts(id),
  received_into_account_id UUID NOT NULL REFERENCES public.accounts(id),
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_account TEXT,
  cost_basis_rate NUMERIC(20,8), -- avg buy rate at time of sale
  cost_basis_amount NUMERIC(20,4), -- in received_currency
  gross_profit NUMERIC(20,4), -- in received_currency
  milad_share_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
  ali_share_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
  milad_profit NUMERIC(20,4),
  ali_profit NUMERIC(20,4),
  notes TEXT,
  attachment_url TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sell_transactions TO authenticated;
GRANT ALL ON public.sell_transactions TO service_role;
ALTER TABLE public.sell_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sell" ON public.sell_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert sell" ON public.sell_transactions FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update sell" ON public.sell_transactions FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "admin delete sell" ON public.sell_transactions FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER sell_updated_at BEFORE UPDATE ON public.sell_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Compute avg buy rate for currency (weighted by amount, in specific paid_currency)
CREATE OR REPLACE FUNCTION public.avg_buy_rate(_currency TEXT, _quote_currency TEXT, _as_of DATE DEFAULT CURRENT_DATE)
RETURNS NUMERIC LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN SUM(bought_amount) > 0
    THEN SUM(paid_amount) / SUM(bought_amount)
    ELSE 0 END
  FROM public.buy_transactions
  WHERE bought_currency = _currency
    AND paid_currency = _quote_currency
    AND entry_date <= _as_of
    AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.trg_sell_calc_and_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  avg_rate NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'sell' AND ref_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Compute cost basis using avg buy rate
  avg_rate := public.avg_buy_rate(NEW.sold_currency, NEW.received_currency, NEW.entry_date);
  NEW.cost_basis_rate := avg_rate;
  NEW.cost_basis_amount := ROUND(avg_rate * NEW.sold_amount, 4);
  NEW.gross_profit := NEW.received_amount - NEW.cost_basis_amount;

  IF (NEW.milad_share_pct + NEW.ali_share_pct) <> 100 THEN
    NEW.ali_share_pct := 100 - NEW.milad_share_pct;
  END IF;

  NEW.milad_profit := ROUND(NEW.gross_profit * NEW.milad_share_pct / 100, 4);
  NEW.ali_profit := ROUND(NEW.gross_profit * NEW.ali_share_pct / 100, 4);

  IF TG_OP = 'UPDATE' THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'sell' AND ref_id = NEW.id;
  END IF;

  RETURN NEW;
END; $$;
CREATE TRIGGER trg_sell_calc BEFORE INSERT OR UPDATE ON public.sell_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_sell_calc_and_ledger();

CREATE OR REPLACE FUNCTION public.trg_sell_ledger_after()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'sell' AND ref_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
  VALUES (NEW.sold_from_account_id, NEW.entry_date, NEW.sold_currency, -NEW.sold_amount, 'sell', NEW.id,
    'Sold ' || NEW.sold_amount || ' ' || NEW.sold_currency || ' @ ' || NEW.sell_rate);
  INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
  VALUES (NEW.received_into_account_id, NEW.entry_date, NEW.received_currency, NEW.received_amount, 'sell', NEW.id,
    'Sold ' || NEW.sold_amount || ' ' || NEW.sold_currency || ' @ ' || NEW.sell_rate);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_sell_ledger AFTER INSERT OR UPDATE OR DELETE ON public.sell_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_sell_ledger_after();

-- ============ EXPENSES ============
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by public.paid_by NOT NULL,
  paid_from_account_id UUID NOT NULL REFERENCES public.accounts(id),
  amount NUMERIC(20,4) NOT NULL,
  currency TEXT NOT NULL,
  category TEXT,
  related_buy_id UUID REFERENCES public.buy_transactions(id),
  related_sell_id UUID REFERENCES public.sell_transactions(id),
  related_person TEXT,
  is_business BOOLEAN NOT NULL DEFAULT TRUE,
  reduces_profit BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  attachment_url TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update expenses" ON public.expenses FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "admin delete expenses" ON public.expenses FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_expense_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'expense' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.paid_from_account_id, NEW.entry_date, NEW.currency, -NEW.amount, 'expense', NEW.id,
      'Expense: ' || COALESCE(NEW.category, 'uncategorized'));
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_expense_ledger AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.trg_expense_ledger();

-- ============ TRANSFERS ============
CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  from_account_id UUID NOT NULL REFERENCES public.accounts(id),
  to_account_id UUID NOT NULL REFERENCES public.accounts(id),
  amount NUMERIC(20,4) NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT,
  requested_by public.brought_in_by,
  notes TEXT,
  attachment_url TEXT,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read transfers" ON public.transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert transfers" ON public.transfers FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update transfers" ON public.transfers FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "admin delete transfers" ON public.transfers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER transfers_updated_at BEFORE UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_transfer_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'transfer' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.from_account_id, NEW.entry_date, NEW.currency, -NEW.amount, 'transfer', NEW.id,
      'Transfer out: ' || COALESCE(NEW.reason,''));
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.to_account_id, NEW.entry_date, NEW.currency, NEW.amount, 'transfer', NEW.id,
      'Transfer in: ' || COALESCE(NEW.reason,''));
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_transfer_ledger AFTER INSERT OR UPDATE OR DELETE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.trg_transfer_ledger();

-- ============ DAILY CLOSINGS ============
CREATE TABLE public.daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_date DATE NOT NULL UNIQUE,
  snapshot JSONB NOT NULL, -- account_id -> {expected, actual, difference}
  notes TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  closed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_closings TO authenticated;
GRANT ALL ON public.daily_closings TO service_role;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read closings" ON public.daily_closings FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers write closings" ON public.daily_closings FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update closings" ON public.daily_closings FOR UPDATE TO authenticated USING (public.can_write(auth.uid()) AND is_locked = FALSE);
CREATE POLICY "admin delete closings" ON public.daily_closings FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE TRIGGER closings_updated_at BEFORE UPDATE ON public.daily_closings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "auth insert audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor = auth.uid());

-- ============ HELPERS: current balances view ============
CREATE OR REPLACE VIEW public.account_balances AS
SELECT
  a.id AS account_id,
  a.name,
  a.currency,
  a.account_type,
  a.owner,
  a.opening_balance + COALESCE(SUM(l.amount), 0) AS current_balance
FROM public.accounts a
LEFT JOIN public.ledger_entries l ON l.account_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.id;
GRANT SELECT ON public.account_balances TO authenticated;

CREATE OR REPLACE VIEW public.currency_inventory AS
SELECT
  a.currency,
  SUM(a.opening_balance + COALESCE(sub.total, 0)) AS total_amount
FROM public.accounts a
LEFT JOIN (
  SELECT account_id, SUM(amount) AS total FROM public.ledger_entries GROUP BY account_id
) sub ON sub.account_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.currency;
GRANT SELECT ON public.currency_inventory TO authenticated;
