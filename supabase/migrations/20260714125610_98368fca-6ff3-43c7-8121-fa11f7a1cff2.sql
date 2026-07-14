
-- 1) audit_logs: require can_write in addition to actor = auth.uid()
DROP POLICY IF EXISTS "auth insert audit" ON public.audit_logs;
CREATE POLICY "writers insert audit" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor = auth.uid() AND public.can_write(auth.uid()));

-- 2) Restrict SELECT of sensitive PII/financial tables to writers/admins (not viewers)
DROP POLICY IF EXISTS "auth read customers" ON public.customers;
CREATE POLICY "writers read customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.can_write(auth.uid()));

DROP POLICY IF EXISTS "cba read" ON public.customer_bank_accounts;
CREATE POLICY "writers read cba" ON public.customer_bank_accounts
  FOR SELECT TO authenticated
  USING (public.can_write(auth.uid()));

DROP POLICY IF EXISTS "auth read credit" ON public.customer_credit;
CREATE POLICY "writers read credit" ON public.customer_credit
  FOR SELECT TO authenticated
  USING (public.can_write(auth.uid()));

DROP POLICY IF EXISTS "auth read sell" ON public.sell_transactions;
CREATE POLICY "writers read sell" ON public.sell_transactions
  FOR SELECT TO authenticated
  USING (public.can_write(auth.uid()));

DROP POLICY IF EXISTS "auth read accounts" ON public.accounts;
CREATE POLICY "writers read accounts" ON public.accounts
  FOR SELECT TO authenticated
  USING (public.can_write(auth.uid()));
