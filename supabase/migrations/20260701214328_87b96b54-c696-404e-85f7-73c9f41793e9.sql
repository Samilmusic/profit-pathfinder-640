
CREATE TABLE IF NOT EXISTS public.market_rate_fetches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'bonbast',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  currencies jsonb,
  error_message text,
  triggered_by text
);
GRANT SELECT ON public.market_rate_fetches TO authenticated;
GRANT ALL ON public.market_rate_fetches TO service_role;
ALTER TABLE public.market_rate_fetches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mrf readable by authenticated"
  ON public.market_rate_fetches FOR SELECT
  TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_mrf_started_at ON public.market_rate_fetches(started_at DESC);

CREATE OR REPLACE VIEW public.market_rates_recent
WITH (security_invoker = on) AS
SELECT id, source, currency, buy_rate, sell_rate, mid_rate, fetched_at, status, error_message, rn
FROM (
  SELECT id, source, currency, buy_rate, sell_rate, mid_rate, fetched_at, status, error_message,
         row_number() OVER (PARTITION BY currency, source ORDER BY fetched_at DESC) AS rn
  FROM public.market_rates
  WHERE status = 'ok'
) t
WHERE rn <= 2;

GRANT SELECT ON public.market_rates_recent TO authenticated;
