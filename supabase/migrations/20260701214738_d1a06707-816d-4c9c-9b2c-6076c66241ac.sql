
REVOKE EXECUTE ON FUNCTION public.capture_reference_rate() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "market_notifications_write" ON public.market_notifications;
CREATE POLICY "market_notifications_insert" ON public.market_notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "market_notifications_update" ON public.market_notifications
  FOR UPDATE TO authenticated
  USING (public.can_write(auth.uid()))
  WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "market_notifications_delete" ON public.market_notifications
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
