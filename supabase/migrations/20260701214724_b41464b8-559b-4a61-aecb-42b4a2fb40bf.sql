
-- ============================================================
-- MARKET INTELLIGENCE UPGRADE
-- 1. Reference rate snapshot columns on transactional tables
-- 2. Alert threshold settings
-- 3. Notifications table
-- 4. Helper views (deltas, inventory exposure)
-- 5. Trigger to capture reference rate on insert
-- ============================================================

-- ---- 1. reference rate columns -------------------------------------------
ALTER TABLE public.sell_transactions
  ADD COLUMN IF NOT EXISTS reference_rate_source text,
  ADD COLUMN IF NOT EXISTS reference_buy_rate    numeric,
  ADD COLUMN IF NOT EXISTS reference_sell_rate   numeric,
  ADD COLUMN IF NOT EXISTS reference_mid_rate    numeric,
  ADD COLUMN IF NOT EXISTS reference_rate_time   timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_rate      numeric,
  ADD COLUMN IF NOT EXISTS rate_difference       numeric,
  ADD COLUMN IF NOT EXISTS rate_difference_percent numeric,
  ADD COLUMN IF NOT EXISTS reference_currency    text;

ALTER TABLE public.buy_transactions
  ADD COLUMN IF NOT EXISTS reference_rate_source text,
  ADD COLUMN IF NOT EXISTS reference_buy_rate    numeric,
  ADD COLUMN IF NOT EXISTS reference_sell_rate   numeric,
  ADD COLUMN IF NOT EXISTS reference_mid_rate    numeric,
  ADD COLUMN IF NOT EXISTS reference_rate_time   timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_rate      numeric,
  ADD COLUMN IF NOT EXISTS rate_difference       numeric,
  ADD COLUMN IF NOT EXISTS rate_difference_percent numeric,
  ADD COLUMN IF NOT EXISTS reference_currency    text;

ALTER TABLE public.brought_in_money
  ADD COLUMN IF NOT EXISTS reference_rate_source text,
  ADD COLUMN IF NOT EXISTS reference_buy_rate    numeric,
  ADD COLUMN IF NOT EXISTS reference_sell_rate   numeric,
  ADD COLUMN IF NOT EXISTS reference_mid_rate    numeric,
  ADD COLUMN IF NOT EXISTS reference_rate_time   timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_rate      numeric,
  ADD COLUMN IF NOT EXISTS rate_difference       numeric,
  ADD COLUMN IF NOT EXISTS rate_difference_percent numeric,
  ADD COLUMN IF NOT EXISTS reference_currency    text;

ALTER TABLE public.trade_cycles
  ADD COLUMN IF NOT EXISTS reference_rate_source text,
  ADD COLUMN IF NOT EXISTS reference_buy_rate    numeric,
  ADD COLUMN IF NOT EXISTS reference_sell_rate   numeric,
  ADD COLUMN IF NOT EXISTS reference_mid_rate    numeric,
  ADD COLUMN IF NOT EXISTS reference_rate_time   timestamptz,
  ADD COLUMN IF NOT EXISTS reference_currency    text;

-- ---- 2. Alert threshold settings ----------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS alert_drop_pct_15min      numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS alert_rise_pct_15min      numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS alert_volatility_pct_1h   numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS alert_stale_minutes       integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS alert_near_cost_pct       numeric NOT NULL DEFAULT 0.3;

-- ---- 3. Notifications table ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  severity    text NOT NULL DEFAULT 'info',
  currency    text,
  title       text NOT NULL,
  body        text,
  metadata    jsonb,
  ref_type    text,
  ref_id      uuid,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_notifications TO authenticated;
GRANT ALL ON public.market_notifications TO service_role;

ALTER TABLE public.market_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_notifications_read" ON public.market_notifications;
CREATE POLICY "market_notifications_read" ON public.market_notifications
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "market_notifications_write" ON public.market_notifications;
CREATE POLICY "market_notifications_write" ON public.market_notifications
  FOR ALL TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_market_notifications_created ON public.market_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_notifications_unread ON public.market_notifications (read_at) WHERE read_at IS NULL;

-- ---- 4. Helper views ----------------------------------------------------
-- Current rate vs 5m/15m/1h/24h historical anchors (per currency, bonbast source).
CREATE OR REPLACE VIEW public.market_rate_deltas
WITH (security_invoker = on) AS
WITH latest AS (
  SELECT DISTINCT ON (currency)
    currency, mid_rate AS current_mid, buy_rate AS current_buy, sell_rate AS current_sell, fetched_at
  FROM public.market_rates
  WHERE source = 'bonbast' AND status = 'ok'
  ORDER BY currency, fetched_at DESC
),
prev AS (
  SELECT
    l.currency,
    (SELECT mid_rate FROM public.market_rates m
       WHERE m.currency = l.currency AND m.source='bonbast' AND m.status='ok'
         AND m.fetched_at <= l.fetched_at - interval '5 minutes'
       ORDER BY m.fetched_at DESC LIMIT 1) AS mid_5m,
    (SELECT mid_rate FROM public.market_rates m
       WHERE m.currency = l.currency AND m.source='bonbast' AND m.status='ok'
         AND m.fetched_at <= l.fetched_at - interval '15 minutes'
       ORDER BY m.fetched_at DESC LIMIT 1) AS mid_15m,
    (SELECT mid_rate FROM public.market_rates m
       WHERE m.currency = l.currency AND m.source='bonbast' AND m.status='ok'
         AND m.fetched_at <= l.fetched_at - interval '1 hour'
       ORDER BY m.fetched_at DESC LIMIT 1) AS mid_1h,
    (SELECT mid_rate FROM public.market_rates m
       WHERE m.currency = l.currency AND m.source='bonbast' AND m.status='ok'
         AND m.fetched_at <= l.fetched_at - interval '24 hours'
       ORDER BY m.fetched_at DESC LIMIT 1) AS mid_24h
  FROM latest l
)
SELECT
  l.currency, l.current_buy, l.current_sell, l.current_mid, l.fetched_at,
  p.mid_5m, p.mid_15m, p.mid_1h, p.mid_24h,
  CASE WHEN p.mid_5m  > 0 THEN ROUND(((l.current_mid - p.mid_5m ) / p.mid_5m ) * 100, 4) END AS pct_5m,
  CASE WHEN p.mid_15m > 0 THEN ROUND(((l.current_mid - p.mid_15m) / p.mid_15m) * 100, 4) END AS pct_15m,
  CASE WHEN p.mid_1h  > 0 THEN ROUND(((l.current_mid - p.mid_1h ) / p.mid_1h ) * 100, 4) END AS pct_1h,
  CASE WHEN p.mid_24h > 0 THEN ROUND(((l.current_mid - p.mid_24h) / p.mid_24h) * 100, 4) END AS pct_24h
FROM latest l LEFT JOIN prev p USING (currency);

GRANT SELECT ON public.market_rate_deltas TO authenticated;

-- Inventory exposure per currency vs current market
CREATE OR REPLACE VIEW public.inventory_exposure
WITH (security_invoker = on) AS
WITH inv AS (
  SELECT
    currency,
    SUM(remaining_amount) AS available,
    CASE WHEN SUM(remaining_amount) > 0
      THEN SUM(remaining_amount * cost_basis_rate) / SUM(remaining_amount)
      ELSE 0 END AS avg_cost,
    -- assume cost basis currency is uniform per lot; take most common
    (ARRAY_AGG(cost_basis_currency ORDER BY entry_date DESC))[1] AS cost_ccy
  FROM public.inventory_lots
  WHERE remaining_amount > 0 AND status <> 'depleted'
  GROUP BY currency
),
mkt AS (
  SELECT currency, current_buy, current_sell, current_mid, fetched_at
  FROM public.market_rate_deltas
)
SELECT
  i.currency,
  i.available,
  i.avg_cost,
  i.cost_ccy,
  m.current_buy   AS market_buy,
  m.current_sell  AS market_sell,
  m.current_mid   AS market_mid,
  m.fetched_at    AS market_fetched_at,
  CASE WHEN m.current_mid IS NOT NULL AND i.avg_cost > 0
    THEN ROUND((m.current_mid - i.avg_cost) * i.available, 4)
  END AS unrealized_pl,
  CASE WHEN m.current_mid IS NOT NULL AND i.avg_cost > 0
    THEN ROUND(((m.current_mid - i.avg_cost) / i.avg_cost) * 100, 4)
  END AS unrealized_pl_pct
FROM inv i LEFT JOIN mkt m USING (currency);

GRANT SELECT ON public.inventory_exposure TO authenticated;

-- ---- 5. Reference-rate capture trigger ----------------------------------
CREATE OR REPLACE FUNCTION public.capture_reference_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ccy text;
  v_txn_rate numeric;
  rate public.market_rates_latest%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'sell_transactions' THEN
    v_ccy := NEW.sold_currency;
    v_txn_rate := NEW.sell_rate;
  ELSIF TG_TABLE_NAME = 'buy_transactions' THEN
    v_ccy := NEW.bought_currency;
    v_txn_rate := NEW.buy_rate;
  ELSIF TG_TABLE_NAME = 'brought_in_money' THEN
    IF NEW.convert_enabled AND NEW.converted_currency IS NOT NULL THEN
      v_ccy := NEW.currency;                -- original ccy being converted
      v_txn_rate := NEW.conversion_rate;
    ELSE
      RETURN NEW;                           -- no rate to compare
    END IF;
  ELSIF TG_TABLE_NAME = 'trade_cycles' THEN
    v_ccy := NEW.initial_currency;
    v_txn_rate := NEW.sell_rate;
  ELSE
    RETURN NEW;
  END IF;

  IF v_ccy IS NULL THEN RETURN NEW; END IF;

  -- pick bonbast if fresh, else manual, else last bonbast
  SELECT * INTO rate FROM public.market_rates_latest
   WHERE currency = v_ccy AND source = 'bonbast'
   LIMIT 1;
  IF NOT FOUND OR rate.mid_rate IS NULL THEN
    SELECT * INTO rate FROM public.market_rates_latest
     WHERE currency = v_ccy AND source = 'manual'
     LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN NEW; END IF;

  NEW.reference_rate_source := rate.source;
  NEW.reference_buy_rate    := rate.buy_rate;
  NEW.reference_sell_rate   := rate.sell_rate;
  NEW.reference_mid_rate    := rate.mid_rate;
  NEW.reference_rate_time   := rate.fetched_at;
  NEW.reference_currency    := v_ccy;

  IF TG_TABLE_NAME <> 'trade_cycles' THEN
    NEW.transaction_rate := v_txn_rate;
    IF v_txn_rate IS NOT NULL AND rate.mid_rate IS NOT NULL AND rate.mid_rate > 0 THEN
      NEW.rate_difference := ROUND(v_txn_rate - rate.mid_rate, 6);
      NEW.rate_difference_percent := ROUND(((v_txn_rate - rate.mid_rate) / rate.mid_rate) * 100, 4);
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sell_capture_ref_rate ON public.sell_transactions;
CREATE TRIGGER trg_sell_capture_ref_rate
  BEFORE INSERT ON public.sell_transactions
  FOR EACH ROW EXECUTE FUNCTION public.capture_reference_rate();

DROP TRIGGER IF EXISTS trg_buy_capture_ref_rate ON public.buy_transactions;
CREATE TRIGGER trg_buy_capture_ref_rate
  BEFORE INSERT ON public.buy_transactions
  FOR EACH ROW EXECUTE FUNCTION public.capture_reference_rate();

DROP TRIGGER IF EXISTS trg_brought_in_capture_ref_rate ON public.brought_in_money;
CREATE TRIGGER trg_brought_in_capture_ref_rate
  BEFORE INSERT ON public.brought_in_money
  FOR EACH ROW EXECUTE FUNCTION public.capture_reference_rate();

DROP TRIGGER IF EXISTS trg_trade_cycle_capture_ref_rate ON public.trade_cycles;
CREATE TRIGGER trg_trade_cycle_capture_ref_rate
  BEFORE INSERT ON public.trade_cycles
  FOR EACH ROW EXECUTE FUNCTION public.capture_reference_rate();
