
-- 1. money_location enum + columns
DO $$ BEGIN
  CREATE TYPE public.money_location AS ENUM (
    'cash_box','aed_bank','toman_bank','foreign_bank',
    'held_milad','held_ali','held_customer',
    'pending_delivery','pending_deposit'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.buy_transactions   ADD COLUMN IF NOT EXISTS money_location public.money_location;
ALTER TABLE public.sell_transactions  ADD COLUMN IF NOT EXISTS money_location public.money_location;
ALTER TABLE public.transfers          ADD COLUMN IF NOT EXISTS money_location public.money_location;
ALTER TABLE public.customer_deposits  ADD COLUMN IF NOT EXISTS money_location public.money_location;
ALTER TABLE public.payment_orders     ADD COLUMN IF NOT EXISTS money_location public.money_location;
ALTER TABLE public.expenses           ADD COLUMN IF NOT EXISTS money_location public.money_location;

-- 2. expense taxonomy
DO $$ BEGIN
  CREATE TYPE public.expense_kind AS ENUM (
    'petrol','parking','delivery','transfer_fee','bank_charge',
    'personal_ali','business','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS expense_kind public.expense_kind DEFAULT 'other';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS related_ref_type text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS related_ref_id uuid;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_required boolean NOT NULL DEFAULT true;

-- 3. payment order polish
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS destination_bank_name text;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS receiver_iban text;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS is_free_service boolean NOT NULL DEFAULT false;

-- 4. Audit log
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,        -- insert/update/delete/restore
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read audit" ON public.audit_events;
CREATE POLICY "auth read audit" ON public.audit_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "writers insert audit" ON public.audit_events;
CREATE POLICY "writers insert audit" ON public.audit_events FOR INSERT TO authenticated
  WITH CHECK (public.can_write(auth.uid()));

CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON public.audit_events(entity_type, entity_id, created_at DESC);

-- Generic audit trigger fn
CREATE OR REPLACE FUNCTION public.trg_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
BEGIN
  actor := auth.uid();
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, new_value)
    VALUES (actor, TG_TABLE_NAME, NEW.id, 'insert', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, old_value, new_value)
      VALUES (actor, TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, old_value)
    VALUES (actor, TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

-- Attach audit to key tables (drop-and-recreate for idempotency)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'buy_transactions','sell_transactions','transfers','expenses',
    'customer_deposits','payment_orders','brought_in_money','accounts','customers'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row()', t);
  END LOOP;
END $$;

-- 5. Dashboard rollup views
CREATE OR REPLACE VIEW public.v_total_assets_by_currency
WITH (security_invoker = true) AS
SELECT b.currency, SUM(b.current_balance) AS balance
FROM public.account_balances b
JOIN public.accounts a ON a.id = b.account_id
WHERE a.account_type <> 'customer_wallet'
GROUP BY b.currency;

CREATE OR REPLACE VIEW public.v_cash_available
WITH (security_invoker = true) AS
SELECT b.currency, SUM(b.current_balance) AS balance
FROM public.account_balances b
JOIN public.accounts a ON a.id = b.account_id
WHERE a.account_type IN ('cash','aed_bank','toman_bank','foreign_currency')
GROUP BY b.currency;

CREATE OR REPLACE VIEW public.v_money_in_circulation
WITH (security_invoker = true) AS
SELECT b.currency, SUM(b.current_balance) AS balance
FROM public.account_balances b
JOIN public.accounts a ON a.id = b.account_id
WHERE a.account_type = 'person_holding'
GROUP BY b.currency;

CREATE OR REPLACE VIEW public.v_today_profit
WITH (security_invoker = true) AS
SELECT
  COALESCE(SUM(gross_profit),0)    AS gross_profit,
  COALESCE(SUM(milad_profit),0)    AS milad_profit,
  COALESCE(SUM(ali_profit),0)      AS ali_profit,
  COUNT(*)                         AS sell_count
FROM public.sell_transactions
WHERE entry_date = CURRENT_DATE AND deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_month_profit
WITH (security_invoker = true) AS
SELECT
  COALESCE(SUM(gross_profit),0)    AS gross_profit,
  COALESCE(SUM(milad_profit),0)    AS milad_profit,
  COALESCE(SUM(ali_profit),0)      AS ali_profit,
  COUNT(*)                         AS sell_count
FROM public.sell_transactions
WHERE date_trunc('month', entry_date) = date_trunc('month', CURRENT_DATE)
  AND deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_daily_profit_series
WITH (security_invoker = true) AS
SELECT entry_date::date AS day,
       COALESCE(SUM(gross_profit),0) AS gross_profit,
       COALESCE(SUM(milad_profit),0) AS milad_profit,
       COALESCE(SUM(ali_profit),0) AS ali_profit
FROM public.sell_transactions
WHERE deleted_at IS NULL
  AND entry_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY entry_date
ORDER BY entry_date;

CREATE OR REPLACE VIEW public.v_ali_capital_summary
WITH (security_invoker = true) AS
SELECT
  (SELECT COALESCE(SUM(amount),0) FROM public.brought_in_money WHERE brought_by = 'ali' AND deleted_at IS NULL) AS total_brought_in,
  (SELECT COALESCE(SUM(ali_profit),0) FROM public.sell_transactions WHERE deleted_at IS NULL) AS total_profit_share,
  (SELECT COALESCE(SUM(amount),0) FROM public.expenses WHERE paid_by = 'ali' AND deleted_at IS NULL) AS total_paid_expenses,
  (SELECT COALESCE(SUM(current_balance),0) FROM public.account_balances b
     JOIN public.accounts a ON a.id = b.account_id
     WHERE a.holder_type = 'ali' AND a.account_type = 'person_holding') AS currently_holding;
