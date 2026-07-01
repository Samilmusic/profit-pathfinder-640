
-- Enums
DO $$ BEGIN
  CREATE TYPE public.trade_status AS ENUM ('draft','in_progress','awaiting_profit','awaiting_docs','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.movement_type AS ENUM (
    'send_money','receive_money','pay_third_party','receive_third_party',
    'profit_collection','expense','service_charge','internal_transfer','settlement'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.movement_status AS ENUM ('pending','in_transit','completed','failed','waived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.party_kind AS ENUM ('our_account','customer_account','customer','ali','milad','external_person','cash','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.profit_status AS ENUM ('pending','received','waived','kept_in_wallet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Parent
CREATE TABLE IF NOT EXISTS public.trade_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  title TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  base_currency TEXT NOT NULL DEFAULT 'AED',
  quote_currency TEXT,
  capital_amount NUMERIC(20,4) DEFAULT 0,
  capital_currency TEXT,
  expected_profit NUMERIC(20,4) DEFAULT 0,
  expected_profit_currency TEXT,
  received_profit NUMERIC(20,4) DEFAULT 0,
  pending_profit NUMERIC(20,4) DEFAULT 0,
  related_expenses NUMERIC(20,4) DEFAULT 0,
  net_profit NUMERIC(20,4) DEFAULT 0,
  milad_share_pct NUMERIC(6,3) DEFAULT 50,
  ali_share_pct NUMERIC(6,3) DEFAULT 50,
  milad_profit NUMERIC(20,4) DEFAULT 0,
  ali_profit NUMERIC(20,4) DEFAULT 0,
  status public.trade_status NOT NULL DEFAULT 'draft',
  final_profit_confirmed BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_cycles TO authenticated;
GRANT ALL ON public.trade_cycles TO service_role;
ALTER TABLE public.trade_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_cycles read" ON public.trade_cycles FOR SELECT TO authenticated USING (true);
CREATE POLICY "trade_cycles write" ON public.trade_cycles FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "trade_cycles update" ON public.trade_cycles FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "trade_cycles delete" ON public.trade_cycles FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Movements (legs)
CREATE TABLE IF NOT EXISTS public.trade_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trade_cycles(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 0,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  movement_type public.movement_type NOT NULL,
  -- From
  from_kind public.party_kind,
  from_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  from_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  from_label TEXT,
  -- To
  to_kind public.party_kind,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  to_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  to_label TEXT,
  -- Amounts
  amount NUMERIC(20,4) NOT NULL,
  currency TEXT NOT NULL,
  rate NUMERIC(20,8),
  purpose TEXT,
  related_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  doc_required BOOLEAN NOT NULL DEFAULT true,
  status public.movement_status NOT NULL DEFAULT 'pending',
  completion_note TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_movements TO authenticated;
GRANT ALL ON public.trade_movements TO service_role;
ALTER TABLE public.trade_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_movements read" ON public.trade_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "trade_movements write" ON public.trade_movements FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "trade_movements update" ON public.trade_movements FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "trade_movements delete" ON public.trade_movements FOR DELETE TO authenticated USING (public.can_write(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_trade_movements_trade ON public.trade_movements(trade_id, seq);

-- Profit collections (separate from movements for structured tracking)
CREATE TABLE IF NOT EXISTS public.trade_profit_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trade_cycles(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(20,4) NOT NULL,
  currency TEXT NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  received_by TEXT,
  status public.profit_status NOT NULL DEFAULT 'received',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_profit_collections TO authenticated;
GRANT ALL ON public.trade_profit_collections TO service_role;
ALTER TABLE public.trade_profit_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tpc read" ON public.trade_profit_collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpc write" ON public.trade_profit_collections FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "tpc update" ON public.trade_profit_collections FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "tpc delete" ON public.trade_profit_collections FOR DELETE TO authenticated USING (public.can_write(auth.uid()));

-- updated_at triggers
CREATE TRIGGER trg_trade_cycles_updated_at BEFORE UPDATE ON public.trade_cycles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_trade_movements_updated_at BEFORE UPDATE ON public.trade_movements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tpc_updated_at BEFORE UPDATE ON public.trade_profit_collections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ledger generation for movements involving our accounts
CREATE OR REPLACE FUNCTION public.trg_trade_movement_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type='trade_movement' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status IN ('completed','in_transit') THEN
    IF NEW.from_account_id IS NOT NULL THEN
      INSERT INTO public.ledger_entries(account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.from_account_id, NEW.entry_date, NEW.currency, -NEW.amount, 'trade_movement', NEW.id,
        'Trade ' || NEW.movement_type::text || ' out');
    END IF;
    IF NEW.to_account_id IS NOT NULL THEN
      INSERT INTO public.ledger_entries(account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.to_account_id, NEW.entry_date, NEW.currency, NEW.amount, 'trade_movement', NEW.id,
        'Trade ' || NEW.movement_type::text || ' in');
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_trade_movement_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.trade_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_trade_movement_ledger();

-- Profit collection ledger
CREATE OR REPLACE FUNCTION public.trg_trade_profit_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type='trade_profit' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status='received' AND NEW.account_id IS NOT NULL THEN
    INSERT INTO public.ledger_entries(account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.account_id, NEW.entry_date, NEW.currency, NEW.amount, 'trade_profit', NEW.id, 'Trade profit received');
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_trade_profit_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.trade_profit_collections
FOR EACH ROW EXECUTE FUNCTION public.trg_trade_profit_ledger();

-- Recompute trade totals
CREATE OR REPLACE FUNCTION public.recompute_trade_totals(_trade_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  t public.trade_cycles%ROWTYPE;
  v_received NUMERIC := 0;
  v_pending NUMERIC := 0;
  v_expense NUMERIC := 0;
  v_net NUMERIC := 0;
BEGIN
  SELECT * INTO t FROM public.trade_cycles WHERE id = _trade_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_received
    FROM public.trade_profit_collections WHERE trade_id=_trade_id AND status='received';
  SELECT COALESCE(SUM(amount),0) INTO v_pending
    FROM public.trade_profit_collections WHERE trade_id=_trade_id AND status='pending';
  SELECT COALESCE(SUM(amount),0) INTO v_expense
    FROM public.trade_movements WHERE trade_id=_trade_id AND movement_type IN ('expense','service_charge') AND deleted_at IS NULL;

  v_net := v_received - v_expense;

  UPDATE public.trade_cycles SET
    received_profit = v_received,
    pending_profit = v_pending,
    related_expenses = v_expense,
    net_profit = v_net,
    milad_profit = ROUND(v_net * COALESCE(milad_share_pct,50)/100, 4),
    ali_profit = ROUND(v_net * COALESCE(ali_share_pct,50)/100, 4),
    updated_at = now()
  WHERE id = _trade_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_recompute_trade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.recompute_trade_totals(COALESCE(NEW.trade_id, OLD.trade_id));
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_recompute_from_movement
AFTER INSERT OR UPDATE OR DELETE ON public.trade_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_trade();

CREATE TRIGGER trg_recompute_from_profit
AFTER INSERT OR UPDATE OR DELETE ON public.trade_profit_collections
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_trade();

-- Enforce completion: cannot close trade unless movements complete and profit confirmed
CREATE OR REPLACE FUNCTION public.enforce_trade_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE incomplete INT; missing_docs INT;
BEGIN
  IF NEW.status='completed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    SELECT count(*) INTO incomplete FROM public.trade_movements
      WHERE trade_id=NEW.id AND deleted_at IS NULL AND status NOT IN ('completed','waived');
    IF incomplete > 0 THEN
      RAISE EXCEPTION 'Cannot close trade: % movements still pending', incomplete;
    END IF;
    SELECT count(*) INTO missing_docs FROM public.trade_movements m
      WHERE m.trade_id=NEW.id AND m.deleted_at IS NULL AND m.doc_required=true
        AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.ref_type='trade_movement' AND d.ref_id=m.id);
    IF missing_docs > 0 THEN
      RAISE EXCEPTION 'Cannot close trade: % movements missing required documents', missing_docs;
    END IF;
    IF NOT NEW.final_profit_confirmed THEN
      RAISE EXCEPTION 'Cannot close trade: final profit must be confirmed';
    END IF;
    NEW.closed_at := now();
    NEW.closed_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_enforce_trade_completion
BEFORE INSERT OR UPDATE ON public.trade_cycles
FOR EACH ROW EXECUTE FUNCTION public.enforce_trade_completion();

-- Auto-code
CREATE OR REPLACE FUNCTION public.trg_trade_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := 'TC-' || to_char(now(),'YYMMDD') || '-' || lpad((floor(random()*10000))::text,4,'0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_trade_code BEFORE INSERT ON public.trade_cycles FOR EACH ROW EXECUTE FUNCTION public.trg_trade_code();

-- Attach audit
CREATE TRIGGER trg_audit_trade_cycles AFTER INSERT OR UPDATE OR DELETE ON public.trade_cycles FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER trg_audit_trade_movements AFTER INSERT OR UPDATE OR DELETE ON public.trade_movements FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
CREATE TRIGGER trg_audit_trade_profit AFTER INSERT OR UPDATE OR DELETE ON public.trade_profit_collections FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
