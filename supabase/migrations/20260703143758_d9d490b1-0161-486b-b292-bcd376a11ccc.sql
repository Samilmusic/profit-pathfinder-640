
ALTER TABLE public.market_rates
  ADD COLUMN IF NOT EXISTS source_unit text,
  ADD COLUMN IF NOT EXISTS source_buy_rate numeric,
  ADD COLUMN IF NOT EXISTS source_sell_rate numeric,
  ADD COLUMN IF NOT EXISTS source_mid_rate numeric;

-- Backfill: bonbast rows with unit not yet set are legacy Toman values.
UPDATE public.market_rates
SET
  source_unit = 'TOMAN',
  source_buy_rate = buy_rate,
  source_sell_rate = sell_rate,
  source_mid_rate = mid_rate,
  buy_rate  = CASE WHEN buy_rate  IS NOT NULL THEN buy_rate  * 10 ELSE NULL END,
  sell_rate = CASE WHEN sell_rate IS NOT NULL THEN sell_rate * 10 ELSE NULL END,
  mid_rate  = CASE WHEN mid_rate  IS NOT NULL THEN mid_rate  * 10 ELSE NULL END
WHERE source = 'bonbast' AND source_unit IS NULL;

-- Manual rates: assumed to already be in IRR (system unit).
UPDATE public.market_rates
SET
  source_unit = 'IRR',
  source_buy_rate = buy_rate,
  source_sell_rate = sell_rate,
  source_mid_rate = mid_rate
WHERE source <> 'bonbast' AND source_unit IS NULL;
