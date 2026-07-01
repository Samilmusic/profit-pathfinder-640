GRANT INSERT ON public.market_rates TO authenticated;
CREATE POLICY "market_rates admins insert manual"
  ON public.market_rates FOR INSERT
  TO authenticated
  WITH CHECK (source = 'manual' AND public.is_admin(auth.uid()));
