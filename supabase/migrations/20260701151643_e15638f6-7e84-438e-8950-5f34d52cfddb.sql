
-- 1. App settings (single row)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  profit_recognition_method text NOT NULL DEFAULT 'cycle' CHECK (profit_recognition_method IN ('instant','cycle')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_admin_write" ON public.app_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 2. Extend trade_status enum for cycle states
ALTER TYPE public.trade_status ADD VALUE IF NOT EXISTS 'open';
ALTER TYPE public.trade_status ADD VALUE IF NOT EXISTS 'partially_closed';
ALTER TYPE public.trade_status ADD VALUE IF NOT EXISTS 'profit_pending';
ALTER TYPE public.trade_status ADD VALUE IF NOT EXISTS 'loss';
ALTER TYPE public.trade_status ADD VALUE IF NOT EXISTS 'missing_receipt';

-- 3. Add cycle-profit columns to trade_cycles
ALTER TABLE public.trade_cycles
  ADD COLUMN IF NOT EXISTS cycle_kind text NOT NULL DEFAULT 'generic' CHECK (cycle_kind IN ('generic','buyback')),
  ADD COLUMN IF NOT EXISTS initial_currency text,
  ADD COLUMN IF NOT EXISTS initial_amount numeric,
  ADD COLUMN IF NOT EXISTS initial_account_id uuid REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS intermediate_currency text,
  ADD COLUMN IF NOT EXISTS intermediate_received numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intermediate_used numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intermediate_account_id uuid REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS final_currency text,
  ADD COLUMN IF NOT EXISTS final_returned_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_account_id uuid REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS estimated_profit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS realized_profit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS realized_profit_currency text,
  ADD COLUMN IF NOT EXISTS expenses_in_final_ccy numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_rate numeric,
  ADD COLUMN IF NOT EXISTS avg_buyback_rate numeric;

-- 4. Link sell + buy transactions to a cycle
ALTER TABLE public.sell_transactions
  ADD COLUMN IF NOT EXISTS trade_cycle_id uuid REFERENCES public.trade_cycles(id),
  ADD COLUMN IF NOT EXISTS creates_cycle boolean NOT NULL DEFAULT true;
ALTER TABLE public.buy_transactions
  ADD COLUMN IF NOT EXISTS trade_cycle_id uuid REFERENCES public.trade_cycles(id);
CREATE INDEX IF NOT EXISTS idx_sell_cycle ON public.sell_transactions(trade_cycle_id);
CREATE INDEX IF NOT EXISTS idx_buy_cycle  ON public.buy_transactions(trade_cycle_id);

-- 5. Link expenses to a cycle (already may exist; keep additive)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS trade_cycle_id uuid REFERENCES public.trade_cycles(id),
  ADD COLUMN IF NOT EXISTS reduce_cycle_profit boolean NOT NULL DEFAULT true;

-- 6. Recompute function: aggregates linked sells/buys/expenses onto the cycle
CREATE OR REPLACE FUNCTION public.recompute_cycle_profit(_cycle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.trade_cycles%ROWTYPE;
  v_sell_sold NUMERIC := 0;         -- total initial-ccy sold via linked sells
  v_sell_recv NUMERIC := 0;         -- total intermediate-ccy received
  v_est_profit NUMERIC := 0;        -- sum of estimated gross_profit from sells
  v_buy_used NUMERIC := 0;          -- intermediate-ccy spent buying back
  v_buy_returned NUMERIC := 0;      -- initial-ccy returned via buys
  v_avg_sell NUMERIC := 0;
  v_avg_buy NUMERIC := 0;
  v_exp NUMERIC := 0;
  v_realized NUMERIC := 0;
  v_new_status public.trade_status;
BEGIN
  SELECT * INTO c FROM public.trade_cycles WHERE id = _cycle_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Sells that opened / feed this cycle (sold_currency = initial, received = intermediate)
  SELECT COALESCE(SUM(sold_amount),0), COALESCE(SUM(received_amount),0),
         COALESCE(SUM(gross_profit),0),
         CASE WHEN SUM(sold_amount)>0 THEN SUM(received_amount)/SUM(sold_amount) ELSE 0 END
    INTO v_sell_sold, v_sell_recv, v_est_profit, v_avg_sell
    FROM public.sell_transactions
   WHERE trade_cycle_id = _cycle_id AND deleted_at IS NULL;

  -- Buys that close the cycle (paid_currency = intermediate, bought = initial/final)
  SELECT COALESCE(SUM(paid_amount),0), COALESCE(SUM(bought_amount),0),
         CASE WHEN SUM(bought_amount)>0 THEN SUM(paid_amount)/SUM(bought_amount) ELSE 0 END
    INTO v_buy_used, v_buy_returned, v_avg_buy
    FROM public.buy_transactions
   WHERE trade_cycle_id = _cycle_id AND deleted_at IS NULL;

  -- Linked expenses (only those that reduce cycle profit)
  SELECT COALESCE(SUM(amount),0) INTO v_exp
    FROM public.expenses
   WHERE trade_cycle_id = _cycle_id AND deleted_at IS NULL AND reduce_cycle_profit = true
     AND currency = COALESCE(c.initial_currency, currency);

  -- Realized profit: only recognised for the portion actually bought back.
  -- Proportional initial capital consumed = (buy_used / sell_recv) * sell_sold
  v_realized := 0;
  IF v_sell_recv > 0 AND v_buy_returned > 0 THEN
    v_realized := v_buy_returned - (v_buy_used / v_sell_recv) * v_sell_sold - v_exp;
  END IF;

  IF v_buy_returned = 0 THEN
    v_new_status := 'open';
  ELSIF v_sell_recv - v_buy_used > 0.0001 THEN
    v_new_status := 'partially_closed';
  ELSIF v_realized < 0 THEN
    v_new_status := 'loss';
  ELSIF c.status = 'completed' THEN
    v_new_status := 'completed';
  ELSE
    v_new_status := 'profit_pending';
  END IF;

  UPDATE public.trade_cycles SET
    initial_amount = COALESCE(NULLIF(v_sell_sold,0), initial_amount),
    intermediate_received = v_sell_recv,
    intermediate_used = v_buy_used,
    final_returned_amount = v_buy_returned,
    sell_rate = NULLIF(v_avg_sell,0),
    avg_buyback_rate = NULLIF(v_avg_buy,0),
    estimated_profit = v_est_profit,
    realized_profit = ROUND(v_realized, 4),
    realized_profit_currency = COALESCE(realized_profit_currency, initial_currency),
    expenses_in_final_ccy = v_exp,
    net_profit = ROUND(v_realized, 4),
    milad_profit = ROUND(v_realized * COALESCE(milad_share_pct,50)/100, 4),
    ali_profit  = ROUND(v_realized * COALESCE(ali_share_pct, 50)/100, 4),
    status = CASE WHEN status IN ('completed','cancelled') THEN status ELSE v_new_status END,
    updated_at = now()
  WHERE id = _cycle_id;
END $$;

-- 7. Trigger: after sell insert/update/delete → touch cycle
CREATE OR REPLACE FUNCTION public.trg_sell_cycle_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_cycle uuid; method text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.trade_cycle_id IS NOT NULL THEN
      PERFORM public.recompute_cycle_profit(OLD.trade_cycle_id);
    END IF;
    RETURN OLD;
  END IF;

  -- Auto-create a cycle on INSERT if requested and none linked
  IF TG_OP = 'INSERT' AND NEW.trade_cycle_id IS NULL AND COALESCE(NEW.creates_cycle,false) THEN
    SELECT profit_recognition_method INTO method FROM public.app_settings LIMIT 1;
    IF method = 'cycle' THEN
      INSERT INTO public.trade_cycles (
        title, entry_date, customer_id, base_currency, quote_currency,
        capital_currency, capital_amount, initial_currency, initial_amount,
        initial_account_id, intermediate_currency, intermediate_account_id,
        final_currency, sell_rate, status, cycle_kind, created_by, notes
      ) VALUES (
        'Cycle from sell ' || COALESCE(NEW.sold_currency,'') || '→' || COALESCE(NEW.received_currency,''),
        NEW.entry_date, NEW.customer_id,
        NEW.sold_currency, NEW.received_currency,
        NEW.sold_currency, NEW.sold_amount,
        NEW.sold_currency, NEW.sold_amount, NEW.sold_from_account_id,
        NEW.received_currency, NEW.received_into_account_id,
        NEW.sold_currency, NEW.sell_rate, 'open', 'buyback',
        NEW.created_by, 'Auto-created from sell'
      ) RETURNING id INTO new_cycle;
      NEW.trade_cycle_id := new_cycle;
    END IF;
  END IF;

  IF NEW.trade_cycle_id IS NOT NULL THEN
    PERFORM public.recompute_cycle_profit(NEW.trade_cycle_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sell_cycle_sync_before ON public.sell_transactions;
CREATE TRIGGER trg_sell_cycle_sync_before
BEFORE INSERT ON public.sell_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_sell_cycle_sync();

DROP TRIGGER IF EXISTS trg_sell_cycle_sync_after ON public.sell_transactions;
CREATE TRIGGER trg_sell_cycle_sync_after
AFTER UPDATE OR DELETE ON public.sell_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_sell_cycle_sync();

-- 8. Trigger: after buy insert/update/delete → touch cycle
CREATE OR REPLACE FUNCTION public.trg_buy_cycle_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.trade_cycle_id IS NOT NULL THEN
      PERFORM public.recompute_cycle_profit(OLD.trade_cycle_id);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.trade_cycle_id IS NOT NULL THEN
    PERFORM public.recompute_cycle_profit(NEW.trade_cycle_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.trade_cycle_id IS NOT NULL AND OLD.trade_cycle_id <> COALESCE(NEW.trade_cycle_id,'00000000-0000-0000-0000-000000000000'::uuid) THEN
    PERFORM public.recompute_cycle_profit(OLD.trade_cycle_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_buy_cycle_sync ON public.buy_transactions;
CREATE TRIGGER trg_buy_cycle_sync
AFTER INSERT OR UPDATE OR DELETE ON public.buy_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_buy_cycle_sync();

-- 9. Trigger: expenses linked to a cycle
CREATE OR REPLACE FUNCTION public.trg_expense_cycle_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.trade_cycle_id IS NOT NULL THEN PERFORM public.recompute_cycle_profit(OLD.trade_cycle_id); END IF;
    RETURN OLD;
  END IF;
  IF NEW.trade_cycle_id IS NOT NULL THEN PERFORM public.recompute_cycle_profit(NEW.trade_cycle_id); END IF;
  IF TG_OP = 'UPDATE' AND OLD.trade_cycle_id IS NOT NULL AND OLD.trade_cycle_id IS DISTINCT FROM NEW.trade_cycle_id THEN
    PERFORM public.recompute_cycle_profit(OLD.trade_cycle_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_expense_cycle_sync ON public.expenses;
CREATE TRIGGER trg_expense_cycle_sync
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.trg_expense_cycle_sync();

-- 10. Report view: open cycles with remaining intermediate ccy
CREATE OR REPLACE VIEW public.v_open_cycles AS
SELECT
  c.id, c.code, c.title, c.entry_date, c.customer_id,
  c.initial_currency, c.initial_amount, c.initial_account_id,
  c.intermediate_currency, c.intermediate_received, c.intermediate_used,
  (c.intermediate_received - c.intermediate_used) AS intermediate_remaining,
  c.intermediate_account_id,
  c.final_currency, c.final_returned_amount,
  c.sell_rate, c.avg_buyback_rate,
  c.estimated_profit, c.realized_profit, c.realized_profit_currency,
  c.expenses_in_final_ccy, c.net_profit, c.milad_profit, c.ali_profit,
  c.status
FROM public.trade_cycles c
WHERE c.deleted_at IS NULL
  AND c.status NOT IN ('completed','cancelled');

GRANT SELECT ON public.v_open_cycles TO authenticated;
