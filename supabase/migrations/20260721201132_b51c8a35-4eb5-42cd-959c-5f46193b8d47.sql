CREATE OR REPLACE FUNCTION public._admin_report_gate()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'manager') OR
    public.has_role(auth.uid(),'partner') OR
    public.has_role(auth.uid(),'accountant')
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges' USING ERRCODE='42501';
  END IF;
END; $fn$;

DROP POLICY IF EXISTS "admin_alert_dismissals_select" ON public.admin_alert_dismissals;
CREATE POLICY "admin_alert_dismissals_select" ON public.admin_alert_dismissals FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'partner') OR public.has_role(auth.uid(),'accountant')
  );
DROP POLICY IF EXISTS "admin_alert_dismissals_insert" ON public.admin_alert_dismissals;
CREATE POLICY "admin_alert_dismissals_insert" ON public.admin_alert_dismissals FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'partner')
  );
DROP POLICY IF EXISTS "admin_alert_dismissals_update" ON public.admin_alert_dismissals;
CREATE POLICY "admin_alert_dismissals_update" ON public.admin_alert_dismissals FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'partner')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'partner')
  );