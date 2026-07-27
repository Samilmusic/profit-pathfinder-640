CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  body text not null,
  pinned boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS customer_notes_customer_idx ON public.customer_notes(customer_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_notes_read ON public.customer_notes;
CREATE POLICY customer_notes_read ON public.customer_notes FOR SELECT TO authenticated USING (public.can_write(auth.uid()));
DROP POLICY IF EXISTS customer_notes_write ON public.customer_notes;
CREATE POLICY customer_notes_write ON public.customer_notes FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
DROP POLICY IF EXISTS customer_notes_update ON public.customer_notes;
CREATE POLICY customer_notes_update ON public.customer_notes FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
DROP POLICY IF EXISTS customer_notes_delete ON public.customer_notes;
CREATE POLICY customer_notes_delete ON public.customer_notes FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
DROP TRIGGER IF EXISTS customer_notes_set_updated_at ON public.customer_notes;
CREATE TRIGGER customer_notes_set_updated_at BEFORE UPDATE ON public.customer_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();