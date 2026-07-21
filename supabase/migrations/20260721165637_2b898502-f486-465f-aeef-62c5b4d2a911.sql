
-- Enums
CREATE TYPE public.allocation_status AS ENUM ('draft','open','closed','reversed','void');
CREATE TYPE public.posting_class     AS ENUM ('shadow','historical_active','operational_active');
CREATE TYPE public.entry_kind        AS ENUM ('normal','reversal','adjustment');
CREATE TYPE public.workflow_version  AS ENUM ('legacy','v2');

-- Feature flags
CREATE TABLE public.app_feature_flags (
  key          text PRIMARY KEY,
  enabled      boolean NOT NULL DEFAULT false,
  description  text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES auth.users(id)
);
GRANT SELECT ON public.app_feature_flags TO authenticated;
GRANT ALL    ON public.app_feature_flags TO service_role;
ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "flags readable by authenticated"
  ON public.app_feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "flags writable by admin only"
  ON public.app_feature_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_feature_flags (key, enabled, description) VALUES
  ('remittance_v2_enabled', false,
   'When true, new remittance records may be created with workflow_version=v2 (allocation layer). Existing records are never downgraded.'),
  ('allocation_layer_posting', false,
   'Master switch. When false, allocation postings remain shadow-only regardless of individual records.');

-- workflow_version on remittances
ALTER TABLE public.remittances
  ADD COLUMN workflow_version public.workflow_version NOT NULL DEFAULT 'legacy';

CREATE OR REPLACE FUNCTION public.trg_remittance_workflow_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.workflow_version = 'v2'
     AND NEW.workflow_version <> 'v2' THEN
    RAISE EXCEPTION 'Cannot downgrade remittance % from v2 to %', OLD.id, NEW.workflow_version;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER remittance_workflow_lock
  BEFORE UPDATE ON public.remittances
  FOR EACH ROW EXECUTE FUNCTION public.trg_remittance_workflow_lock();

-- Third-party clearing accounts
CREATE TABLE public.third_party_clearing_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency    text NOT NULL UNIQUE,
  account_id  uuid NOT NULL REFERENCES public.accounts(id),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.third_party_clearing_accounts TO authenticated;
GRANT ALL    ON public.third_party_clearing_accounts TO service_role;
ALTER TABLE public.third_party_clearing_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clearing readable by authenticated"
  ON public.third_party_clearing_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "clearing writable by admin only"
  ON public.third_party_clearing_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Remittance allocations
CREATE TABLE public.remittance_allocations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id             uuid NOT NULL REFERENCES public.remittances(id) ON DELETE RESTRICT,
  buy_id                    uuid REFERENCES public.buy_transactions(id) ON DELETE RESTRICT,
  currency                  text NOT NULL,
  allocated_amount          numeric NOT NULL CHECK (allocated_amount > 0),
  status                    public.allocation_status NOT NULL DEFAULT 'draft',
  posting_class             public.posting_class NOT NULL DEFAULT 'shadow',
  workflow_version          public.workflow_version NOT NULL DEFAULT 'v2',
  frozen_cost_amount        numeric,
  frozen_cost_currency      text,
  frozen_spread_profit_aed  numeric,
  frozen_commission_aed     numeric,
  frozen_total_profit_aed   numeric,
  frozen_at                 timestamptz,
  frozen_by                 uuid REFERENCES auth.users(id),
  frozen_snapshot           jsonb,
  reversed_by_id            uuid REFERENCES public.remittance_allocations(id),
  notes                     text,
  created_by                uuid REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rem_alloc_remittance ON public.remittance_allocations(remittance_id);
CREATE INDEX idx_rem_alloc_buy         ON public.remittance_allocations(buy_id);
CREATE INDEX idx_rem_alloc_status      ON public.remittance_allocations(status);
CREATE INDEX idx_rem_alloc_posting     ON public.remittance_allocations(posting_class);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_allocations TO authenticated;
GRANT ALL ON public.remittance_allocations TO service_role;
ALTER TABLE public.remittance_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alloc readable by authenticated"
  ON public.remittance_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "alloc write by manager or admin"
  ON public.remittance_allocations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin')
           OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "alloc update by manager or admin"
  ON public.remittance_allocations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin')
           OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "alloc delete by admin only"
  ON public.remittance_allocations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER rem_alloc_touch_updated
  BEFORE UPDATE ON public.remittance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_rem_alloc_immutable_closed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP='UPDATE'
     AND OLD.status IN ('closed','reversed','void')
     AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Allocation % is % and cannot be modified', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER rem_alloc_immutable_closed
  BEFORE UPDATE ON public.remittance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.trg_rem_alloc_immutable_closed();

-- Profit components
CREATE TABLE public.remittance_profit_components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id     uuid NOT NULL REFERENCES public.remittances(id) ON DELETE CASCADE,
  allocation_id     uuid REFERENCES public.remittance_allocations(id) ON DELETE CASCADE,
  component_type    text NOT NULL CHECK (component_type IN ('spread','commission','fx_trading','fee','other')),
  currency          text NOT NULL,
  amount            numeric NOT NULL,
  amount_aed        numeric,
  posting_class     public.posting_class NOT NULL DEFAULT 'shadow',
  workflow_version  public.workflow_version NOT NULL DEFAULT 'v2',
  entry_kind        public.entry_kind NOT NULL DEFAULT 'normal',
  reference_note    text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rem_pc_remittance ON public.remittance_profit_components(remittance_id);
CREATE INDEX idx_rem_pc_alloc      ON public.remittance_profit_components(allocation_id);
CREATE INDEX idx_rem_pc_posting    ON public.remittance_profit_components(posting_class);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_profit_components TO authenticated;
GRANT ALL ON public.remittance_profit_components TO service_role;
ALTER TABLE public.remittance_profit_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pc readable by authenticated"
  ON public.remittance_profit_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "pc write by manager or admin"
  ON public.remittance_profit_components FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin')
           OR public.has_role(auth.uid(),'manager'));

-- Posting guard helper
CREATE OR REPLACE FUNCTION public.assert_posting_active(_class public.posting_class)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _class = 'shadow' THEN
    RAISE EXCEPTION 'Refusing to post: allocation is in shadow classification';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.assert_posting_active(public.posting_class) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.assert_posting_active(public.posting_class) TO authenticated, service_role;

-- Quantity guard
CREATE OR REPLACE FUNCTION public.trg_rem_alloc_quantity_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  buy_amt   numeric;
  used_amt  numeric;
BEGIN
  IF NEW.buy_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT bought_amount INTO buy_amt FROM public.buy_transactions WHERE id = NEW.buy_id;
  SELECT COALESCE(SUM(allocated_amount),0) INTO used_amt
    FROM public.remittance_allocations
   WHERE buy_id = NEW.buy_id
     AND status IN ('draft','open','closed')
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF used_amt + NEW.allocated_amount > COALESCE(buy_amt,0) + 0.00001 THEN
    RAISE EXCEPTION 'Allocation would exceed buy %: buy=%, already allocated=%, requested=%',
      NEW.buy_id, buy_amt, used_amt, NEW.allocated_amount;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER rem_alloc_quantity_guard
  BEFORE INSERT OR UPDATE ON public.remittance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.trg_rem_alloc_quantity_guard();

-- Audit triggers on new tables
CREATE TRIGGER audit_remittance_allocations
  AFTER INSERT OR UPDATE OR DELETE ON public.remittance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();

CREATE TRIGGER audit_remittance_profit_components
  AFTER INSERT OR UPDATE OR DELETE ON public.remittance_profit_components
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();

CREATE TRIGGER audit_third_party_clearing_accounts
  AFTER INSERT OR UPDATE OR DELETE ON public.third_party_clearing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();

CREATE TRIGGER audit_app_feature_flags
  AFTER INSERT OR UPDATE OR DELETE ON public.app_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
