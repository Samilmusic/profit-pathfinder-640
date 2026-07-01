
CREATE TABLE public.market_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'bonbast',
  currency TEXT NOT NULL,
  buy_rate NUMERIC,
  sell_rate NUMERIC,
  mid_rate NUMERIC,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_response JSONB,
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.market_rates TO authenticated;
GRANT ALL ON public.market_rates TO service_role;

ALTER TABLE public.market_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_rates readable by authenticated"
  ON public.market_rates FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_market_rates_currency_fetched ON public.market_rates(currency, fetched_at DESC);
CREATE INDEX idx_market_rates_source_currency_fetched ON public.market_rates(source, currency, fetched_at DESC);

CREATE OR REPLACE VIEW public.market_rates_latest
WITH (security_invoker = on)
AS
SELECT DISTINCT ON (currency, source)
  id, source, currency, buy_rate, sell_rate, mid_rate,
  fetched_at, status, error_message
FROM public.market_rates
WHERE status = 'ok'
ORDER BY currency, source, fetched_at DESC;

GRANT SELECT ON public.market_rates_latest TO authenticated;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS market_rate_source TEXT NOT NULL DEFAULT 'bonbast',
  ADD COLUMN IF NOT EXISTS market_rate_refresh_minutes INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS market_rate_manual_fallback BOOLEAN NOT NULL DEFAULT true;
