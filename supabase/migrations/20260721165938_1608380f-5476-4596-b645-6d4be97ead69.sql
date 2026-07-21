
-- =========================================================================
-- PHASE 2 — Reconciliation framework. Shadow-only. Zero side effects.
-- =========================================================================

-- 1. Diff category enum
CREATE TYPE public.migration_diff_category AS ENUM (
  'matched',          -- expected == actual, all checks pass
  'amount_mismatch',  -- linked buy amount differs from remittance settlement/fx amount
  'missing_buy',      -- eligible remittance has no linked_buy_id
  'missing_lot',      -- linked buy exists but no inventory lot yet (undelivered)
  'over_allocated',   -- buy already fully allocated elsewhere
  'no_op',            -- remittance not eligible (destination not third-party)
  'error',            -- exception raised during evaluation
  'skipped_v2'        -- remittance already workflow_version='v2'
);

-- 2. Batches header
CREATE TABLE public.remittance_migration_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note           text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  run_by         uuid REFERENCES auth.users(id),
  eligible_count int NOT NULL DEFAULT 0,
  inserted_count int NOT NULL DEFAULT 0,
  skipped_count  int NOT NULL DEFAULT 0,
  error_count    int NOT NULL DEFAULT 0,
  is_dry_run     boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.remittance_migration_batches TO authenticated;
GRANT ALL    ON public.remittance_migration_batches TO service_role;
ALTER TABLE public.remittance_migration_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches readable by authenticated"
  ON public.remittance_migration_batches FOR SELECT TO authenticated USING (true);
-- writes go through the admin RPC only; no policy needed for INSERT

-- 3. Per-remittance audit
CREATE TABLE public.remittance_migration_audit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          uuid NOT NULL REFERENCES public.remittance_migration_batches(id) ON DELETE CASCADE,
  remittance_id     uuid NOT NULL REFERENCES public.remittances(id) ON DELETE CASCADE,
  linked_buy_id     uuid REFERENCES public.buy_transactions(id),
  allocation_id     uuid REFERENCES public.remittance_allocations(id),
  diff_category     public.migration_diff_category NOT NULL,
  expected_amount   numeric,
  actual_amount     numeric,
  expected_currency text,
  details           jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_rem_mig_audit_remittance ON public.remittance_migration_audit(remittance_id);
CREATE INDEX idx_rem_mig_audit_batch    ON public.remittance_migration_audit(batch_id);
CREATE INDEX idx_rem_mig_audit_category ON public.remittance_migration_audit(diff_category);

GRANT SELECT ON public.remittance_migration_audit TO authenticated;
GRANT ALL    ON public.remittance_migration_audit TO service_role;
ALTER TABLE public.remittance_migration_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mig audit readable by authenticated"
  ON public.remittance_migration_audit FOR SELECT TO authenticated USING (true);
-- writes go through the admin RPC only

-- 4. Reconciliation view — expected vs actual per legacy remittance
CREATE OR REPLACE VIEW public.v_remittance_migration_diff
WITH (security_invoker = on) AS
SELECT
  r.id                                                   AS remittance_id,
  r.doc_no,
  r.workflow_version,
  r.payment_destination,
  r.linked_buy_id,
  r.settlement_amount                                    AS expected_settlement_amount,
  r.settlement_currency                                  AS expected_settlement_currency,
  b.bought_amount                                        AS actual_buy_amount,
  b.bought_currency                                      AS actual_buy_currency,
  b.supplier_delivered                                   AS buy_delivered,
  COALESCE(alloc_used.total,0)                           AS already_allocated,
  COALESCE(b.bought_amount,0) - COALESCE(alloc_used.total,0) AS buy_capacity_remaining,
  (SELECT count(*) FROM public.remittance_allocations ra WHERE ra.remittance_id = r.id) AS existing_alloc_count,
  (SELECT count(*) FROM public.inventory_lots l
     WHERE l.source_ref_type='buy' AND l.source_ref_id = r.linked_buy_id)              AS lot_count
FROM public.remittances r
LEFT JOIN public.buy_transactions b ON b.id = r.linked_buy_id
LEFT JOIN LATERAL (
  SELECT SUM(allocated_amount) AS total
    FROM public.remittance_allocations
   WHERE buy_id = r.linked_buy_id
     AND status IN ('draft','open','closed')
) alloc_used ON true
WHERE r.workflow_version = 'legacy';

GRANT SELECT ON public.v_remittance_migration_diff TO authenticated;

-- 5. Promotion guard — shadow → active requires master flag + admin
CREATE OR REPLACE FUNCTION public.trg_rem_alloc_promotion_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  master_on boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.posting_class = 'shadow'
     AND NEW.posting_class <> 'shadow' THEN
    SELECT enabled INTO master_on
      FROM public.app_feature_flags
     WHERE key = 'allocation_layer_posting';
    IF NOT COALESCE(master_on, false) THEN
      RAISE EXCEPTION 'Cannot promote allocation % out of shadow: feature flag allocation_layer_posting is OFF', OLD.id;
    END IF;
    IF NOT public.has_role(auth.uid(),'admin') THEN
      RAISE EXCEPTION 'Cannot promote allocation % out of shadow: admin role required', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER rem_alloc_promotion_guard
  BEFORE UPDATE ON public.remittance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.trg_rem_alloc_promotion_guard();

-- 6. Idempotent shadow backfill RPC
CREATE OR REPLACE FUNCTION public.run_remittance_shadow_backfill(_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id       uuid;
  r                record;
  v_eligible       int := 0;
  v_inserted       int := 0;
  v_skipped        int := 0;
  v_errors         int := 0;
  v_category       public.migration_diff_category;
  v_alloc_id       uuid;
  v_expected_amt   numeric;
  v_used           numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  INSERT INTO public.remittance_migration_batches (note, run_by)
  VALUES (_note, auth.uid())
  RETURNING id INTO v_batch_id;

  FOR r IN
    SELECT rm.*
      FROM public.remittances rm
     WHERE rm.workflow_version = 'legacy'
     ORDER BY rm.created_at
  LOOP
    v_eligible := v_eligible + 1;

    -- skip if already audited
    IF EXISTS (SELECT 1 FROM public.remittance_migration_audit
                WHERE remittance_id = r.id) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      -- categorise
      IF r.payment_destination NOT IN ('to_third_party','settles_linked_buy') THEN
        v_category := 'no_op';
        INSERT INTO public.remittance_migration_audit
          (batch_id, remittance_id, diff_category, expected_currency, details)
        VALUES (v_batch_id, r.id, v_category, r.settlement_currency,
                jsonb_build_object('reason','destination not third-party',
                                   'payment_destination', r.payment_destination));
        CONTINUE;
      END IF;

      IF r.linked_buy_id IS NULL THEN
        v_category := 'missing_buy';
        INSERT INTO public.remittance_migration_audit
          (batch_id, remittance_id, diff_category, expected_amount, expected_currency, details)
        VALUES (v_batch_id, r.id, v_category, r.settlement_amount, r.settlement_currency,
                jsonb_build_object('reason','no linked buy'));
        CONTINUE;
      END IF;

      v_expected_amt := COALESCE(r.settlement_amount, r.fx_purchased_amount, 0);

      SELECT COALESCE(SUM(allocated_amount),0) INTO v_used
        FROM public.remittance_allocations
       WHERE buy_id = r.linked_buy_id
         AND status IN ('draft','open','closed');

      IF v_used + v_expected_amt >
         (SELECT COALESCE(bought_amount,0)
            FROM public.buy_transactions WHERE id = r.linked_buy_id) + 0.00001 THEN
        v_category := 'over_allocated';
        INSERT INTO public.remittance_migration_audit
          (batch_id, remittance_id, linked_buy_id, diff_category,
           expected_amount, actual_amount, expected_currency, details)
        VALUES (v_batch_id, r.id, r.linked_buy_id, v_category,
                v_expected_amt, v_used, r.settlement_currency,
                jsonb_build_object('reason','buy already fully allocated'));
        CONTINUE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.inventory_lots l
                      WHERE l.source_ref_type='buy' AND l.source_ref_id = r.linked_buy_id) THEN
        v_category := 'missing_lot';
      ELSE
        v_category := 'matched';
      END IF;

      -- Insert SHADOW allocation. posting_class defaults to 'shadow'.
      INSERT INTO public.remittance_allocations
        (remittance_id, buy_id, currency, allocated_amount,
         status, posting_class, workflow_version, notes, created_by)
      VALUES
        (r.id, r.linked_buy_id,
         COALESCE(r.settlement_currency, r.customer_payment_currency),
         v_expected_amt,
         'draft', 'shadow', 'v2',
         'Shadow migration batch ' || v_batch_id::text,
         auth.uid())
      RETURNING id INTO v_alloc_id;

      INSERT INTO public.remittance_migration_audit
        (batch_id, remittance_id, linked_buy_id, allocation_id, diff_category,
         expected_amount, expected_currency, details)
      VALUES (v_batch_id, r.id, r.linked_buy_id, v_alloc_id, v_category,
              v_expected_amt, r.settlement_currency,
              jsonb_build_object('note','shadow allocation created'));

      v_inserted := v_inserted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      INSERT INTO public.remittance_migration_audit
        (batch_id, remittance_id, linked_buy_id, diff_category, details)
      VALUES (v_batch_id, r.id, r.linked_buy_id, 'error',
              jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM));
    END;
  END LOOP;

  UPDATE public.remittance_migration_batches
     SET eligible_count = v_eligible,
         inserted_count = v_inserted,
         skipped_count  = v_skipped,
         error_count    = v_errors,
         finished_at    = now()
   WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'eligible', v_eligible,
    'inserted', v_inserted,
    'skipped',  v_skipped,
    'errors',   v_errors
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.run_remittance_shadow_backfill(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.run_remittance_shadow_backfill(text) TO authenticated, service_role;

-- 7. Audit triggers on new tables
CREATE TRIGGER audit_rem_migration_batches
  AFTER INSERT OR UPDATE OR DELETE ON public.remittance_migration_batches
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();

CREATE TRIGGER audit_rem_migration_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.remittance_migration_audit
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();
