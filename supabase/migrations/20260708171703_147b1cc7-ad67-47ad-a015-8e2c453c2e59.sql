
-- Tighten user_roles read visibility
DROP POLICY IF EXISTS "authenticated can read roles" ON public.user_roles;
CREATE POLICY "users read own role, admins read all"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- Tighten storage.objects read access for the documents bucket
DROP POLICY IF EXISTS "auth read doc files" ON storage.objects;
CREATE POLICY "scoped read doc files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.can_write(auth.uid())
      OR public.is_admin(auth.uid())
      OR owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.storage_path = storage.objects.name
          AND d.uploaded_by = auth.uid()
      )
    )
  );
