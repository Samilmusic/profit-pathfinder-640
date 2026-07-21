
DO $$
DECLARE
  v_batch_id uuid;
  v_eligible int := 0;
BEGIN
  INSERT INTO public.remittance_migration_batches
    (note, run_by, is_dry_run)
  VALUES
    ('Phase 2 initial shadow backfill (postgres migration; empty remittances table)',
     NULL, false)
  RETURNING id INTO v_batch_id;

  SELECT count(*) INTO v_eligible
    FROM public.remittances WHERE workflow_version='legacy';

  UPDATE public.remittance_migration_batches
     SET eligible_count = v_eligible,
         inserted_count = 0,
         skipped_count  = 0,
         error_count    = 0,
         finished_at    = now()
   WHERE id = v_batch_id;
END $$;
