
-- 1) Workflow state enum
DO $$ BEGIN
  CREATE TYPE public.remittance_workflow_state AS ENUM (
    'draft','funds_received','settlement_pending','allocating','ready_to_close','closed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) remittances.workflow_state
ALTER TABLE public.remittances
  ADD COLUMN IF NOT EXISTS workflow_state public.remittance_workflow_state;

CREATE OR REPLACE FUNCTION public.trg_remittance_workflow_state_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.workflow_version = 'v2' AND NEW.workflow_state IS NULL THEN
    RAISE EXCEPTION 'v2 remittance requires workflow_state';
  END IF;
  IF NEW.workflow_version = 'legacy' AND NEW.workflow_state IS NOT NULL THEN
    RAISE EXCEPTION 'legacy remittance must not carry workflow_state';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.workflow_state IN ('closed','cancelled')
     AND NEW.workflow_state IS DISTINCT FROM OLD.workflow_state THEN
    RAISE EXCEPTION 'workflow_state % is terminal and cannot change', OLD.workflow_state;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS remittance_workflow_state_guard ON public.remittances;
CREATE TRIGGER remittance_workflow_state_guard
  BEFORE INSERT OR UPDATE ON public.remittances
  FOR EACH ROW EXECUTE FUNCTION public.trg_remittance_workflow_state_guard();

-- 3) Bypass legacy sync for v2
CREATE OR REPLACE FUNCTION public.trg_remittance_sync_buy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.workflow_version, OLD.workflow_version) = 'v2' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.linked_buy_id IS NOT NULL
     AND OLD.linked_buy_id IS DISTINCT FROM NEW.linked_buy_id THEN
    UPDATE public.buy_transactions
       SET settled_by_remittance_id = NULL,
           settlement_source = 'own_funds',
           supplier_settled_amount = 0
     WHERE id = OLD.linked_buy_id AND settled_by_remittance_id = OLD.id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.linked_buy_id IS NOT NULL THEN
      UPDATE public.buy_transactions
         SET settled_by_remittance_id = NULL,
             settlement_source = 'own_funds',
             supplier_settled_amount = 0
       WHERE id = OLD.linked_buy_id AND settled_by_remittance_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.linked_buy_id IS NOT NULL THEN
    UPDATE public.buy_transactions
       SET settled_by_remittance_id = NEW.id,
           settlement_source = 'remittance_payment',
           supplier_settled_amount = COALESCE(NEW.settlement_amount, 0)
     WHERE id = NEW.linked_buy_id;
  END IF;
  RETURN NEW;
END $$;

-- 4) Extend remittance_allocations
ALTER TABLE public.remittance_allocations
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.inventory_lots(id),
  ADD COLUMN IF NOT EXISTS parent_allocation_id uuid REFERENCES public.remittance_allocations(id),
  ADD COLUMN IF NOT EXISTS entry_kind public.entry_kind NOT NULL DEFAULT 'normal';

ALTER TABLE public.remittance_allocations
  DROP CONSTRAINT IF EXISTS remittance_allocations_target_chk;
ALTER TABLE public.remittance_allocations
  ADD CONSTRAINT remittance_allocations_target_chk
  CHECK ((buy_id IS NOT NULL)::int + (lot_id IS NOT NULL)::int = 1);

CREATE OR REPLACE FUNCTION public.trg_rem_alloc_lot_disabled()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.lot_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lot-based remittance allocations are not enabled in Phase 4A';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rem_alloc_lot_disabled ON public.remittance_allocations;
CREATE TRIGGER rem_alloc_lot_disabled
  BEFORE INSERT OR UPDATE ON public.remittance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.trg_rem_alloc_lot_disabled();

CREATE OR REPLACE FUNCTION public.trg_rem_alloc_reversal_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE parent RECORD;
BEGIN
  IF NEW.entry_kind = 'reversal' THEN
    IF NEW.parent_allocation_id IS NULL THEN
      RAISE EXCEPTION 'reversal allocation must reference a parent_allocation_id';
    END IF;
    SELECT * INTO parent FROM public.remittance_allocations WHERE id = NEW.parent_allocation_id;
    IF parent.entry_kind <> 'normal' THEN
      RAISE EXCEPTION 'parent allocation must be a normal entry';
    END IF;
    IF parent.remittance_id <> NEW.remittance_id THEN
      RAISE EXCEPTION 'reversal must belong to the same remittance as its parent';
    END IF;
  ELSIF NEW.parent_allocation_id IS NOT NULL THEN
    RAISE EXCEPTION 'parent_allocation_id may only be set on reversal entries';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS rem_alloc_reversal_guard ON public.remittance_allocations;
CREATE TRIGGER rem_alloc_reversal_guard
  BEFORE INSERT OR UPDATE ON public.remittance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.trg_rem_alloc_reversal_guard();

-- 5) remittance_settlement_events
CREATE TABLE IF NOT EXISTS public.remittance_settlement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id uuid NOT NULL REFERENCES public.remittances(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rem_settle_events_rem
  ON public.remittance_settlement_events(remittance_id, created_at DESC);

GRANT SELECT ON public.remittance_settlement_events TO authenticated;
GRANT ALL ON public.remittance_settlement_events TO service_role;

ALTER TABLE public.remittance_settlement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rem_settle_events_read ON public.remittance_settlement_events;
CREATE POLICY rem_settle_events_read ON public.remittance_settlement_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'operator')
  );

DROP POLICY IF EXISTS rem_settle_events_no_direct_write ON public.remittance_settlement_events;
CREATE POLICY rem_settle_events_no_direct_write ON public.remittance_settlement_events
  FOR INSERT TO authenticated WITH CHECK (false);

-- 6) remittance_workflow_transitions
CREATE TABLE IF NOT EXISTS public.remittance_workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id uuid NOT NULL REFERENCES public.remittances(id) ON DELETE CASCADE,
  from_state public.remittance_workflow_state,
  to_state   public.remittance_workflow_state NOT NULL,
  reason text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rem_wf_trans_rem
  ON public.remittance_workflow_transitions(remittance_id, created_at DESC);

GRANT SELECT ON public.remittance_workflow_transitions TO authenticated;
GRANT ALL ON public.remittance_workflow_transitions TO service_role;

ALTER TABLE public.remittance_workflow_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rem_wf_trans_read ON public.remittance_workflow_transitions;
CREATE POLICY rem_wf_trans_read ON public.remittance_workflow_transitions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'operator')
  );

DROP POLICY IF EXISTS rem_wf_trans_no_direct_write ON public.remittance_workflow_transitions;
CREATE POLICY rem_wf_trans_no_direct_write ON public.remittance_workflow_transitions
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.trg_remittance_workflow_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.workflow_version <> 'v2' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.workflow_state IS NOT NULL THEN
    INSERT INTO public.remittance_workflow_transitions(remittance_id, from_state, to_state, actor)
    VALUES (NEW.id, NULL, NEW.workflow_state, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND NEW.workflow_state IS DISTINCT FROM OLD.workflow_state THEN
    INSERT INTO public.remittance_workflow_transitions(remittance_id, from_state, to_state, actor)
    VALUES (NEW.id, OLD.workflow_state, NEW.workflow_state, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS remittance_workflow_log ON public.remittances;
CREATE TRIGGER remittance_workflow_log
  AFTER INSERT OR UPDATE ON public.remittances
  FOR EACH ROW EXECUTE FUNCTION public.trg_remittance_workflow_log();
