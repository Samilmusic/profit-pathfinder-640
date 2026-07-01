
-- ============================================================
-- Inventory Lots (FIFO cost basis)
-- ============================================================

CREATE TYPE public.inventory_lot_status AS ENUM ('available','partial','depleted');

CREATE TABLE public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_code TEXT UNIQUE,
  currency TEXT NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  original_amount NUMERIC NOT NULL,
  remaining_amount NUMERIC NOT NULL,
  cost_basis_rate NUMERIC NOT NULL,
  cost_basis_currency TEXT NOT NULL,
  source_ref_type TEXT NOT NULL,   -- 'brought_in' | 'buy' | 'manual'
  source_ref_id UUID,
  source_description TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.inventory_lot_status NOT NULL DEFAULT 'available',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inventory_lots_fifo_idx
  ON public.inventory_lots (currency, account_id, entry_date, created_at)
  WHERE status <> 'depleted';
CREATE INDEX inventory_lots_source_idx
  ON public.inventory_lots (source_ref_type, source_ref_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_lots TO authenticated;
GRANT ALL ON public.inventory_lots TO service_role;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lots read" ON public.inventory_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "lots write" ON public.inventory_lots FOR ALL TO authenticated
  USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));

CREATE TRIGGER inventory_lots_updated BEFORE UPDATE ON public.inventory_lots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Lot Consumptions
-- ============================================================
CREATE TABLE public.lot_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES public.inventory_lots(id) ON DELETE CASCADE,
  sell_ref_type TEXT NOT NULL,     -- 'sell'
  sell_ref_id UUID NOT NULL,
  currency TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  cost_rate NUMERIC NOT NULL,
  cost_amount NUMERIC NOT NULL,
  cost_basis_currency TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lot_consumptions_sell_idx ON public.lot_consumptions (sell_ref_type, sell_ref_id);
CREATE INDEX lot_consumptions_lot_idx ON public.lot_consumptions (lot_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lot_consumptions TO authenticated;
GRANT ALL ON public.lot_consumptions TO service_role;
ALTER TABLE public.lot_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consumptions read" ON public.lot_consumptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "consumptions write" ON public.lot_consumptions FOR ALL TO authenticated
  USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));

-- ============================================================
-- Lot code generator
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_inventory_lot_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seq INT;
BEGIN
  IF NEW.lot_code IS NULL OR NEW.lot_code = '' THEN
    SELECT COUNT(*) + 1 INTO seq FROM public.inventory_lots WHERE currency = NEW.currency;
    NEW.lot_code := NEW.currency || '-' || lpad(seq::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_lots_code BEFORE INSERT ON public.inventory_lots
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventory_lot_code();

-- ============================================================
-- Auto-create inventory lots from Brought-In conversions
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_brought_in_lot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.inventory_lots
      WHERE source_ref_type = 'brought_in' AND source_ref_id = COALESCE(NEW.id, OLD.id);
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    -- Case A: conversion enabled → lot for the converted currency
    IF NEW.convert_enabled = true
       AND NEW.final_deposit_account_id IS NOT NULL
       AND NEW.converted_amount IS NOT NULL
       AND NEW.converted_currency IS NOT NULL
       AND NEW.conversion_rate IS NOT NULL THEN
      INSERT INTO public.inventory_lots
        (currency, account_id, original_amount, remaining_amount,
         cost_basis_rate, cost_basis_currency,
         source_ref_type, source_ref_id, source_description, entry_date, created_by)
      VALUES (
        NEW.converted_currency, NEW.final_deposit_account_id,
        NEW.converted_amount, NEW.converted_amount,
        NEW.conversion_rate, NEW.currency,
        'brought_in', NEW.id,
        'Brought-in by ' || NEW.brought_by::text
          || COALESCE(' - ' || NEW.source_name, '')
          || ' — converted ' || NEW.amount || ' ' || NEW.currency
          || ' @ ' || NEW.conversion_rate,
        NEW.entry_date, NEW.created_by);
    ELSE
      -- Case B: no conversion → lot in original currency (cost = itself, 1:1)
      INSERT INTO public.inventory_lots
        (currency, account_id, original_amount, remaining_amount,
         cost_basis_rate, cost_basis_currency,
         source_ref_type, source_ref_id, source_description, entry_date, created_by)
      VALUES (
        NEW.currency, NEW.deposit_account_id,
        NEW.amount, NEW.amount,
        1, NEW.currency,
        'brought_in', NEW.id,
        'Brought-in by ' || NEW.brought_by::text
          || COALESCE(' - ' || NEW.source_name, ''),
        NEW.entry_date, NEW.created_by);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_brought_in_lot ON public.brought_in_money;
CREATE TRIGGER trg_brought_in_lot
AFTER INSERT OR UPDATE OR DELETE ON public.brought_in_money
FOR EACH ROW EXECUTE FUNCTION public.trg_brought_in_lot();

-- ============================================================
-- Auto-create inventory lots from Buy transactions
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_buy_lot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.inventory_lots
      WHERE source_ref_type = 'buy' AND source_ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.inventory_lots
      (currency, account_id, original_amount, remaining_amount,
       cost_basis_rate, cost_basis_currency,
       source_ref_type, source_ref_id, source_description, entry_date, created_by)
    VALUES (
      NEW.bought_currency, NEW.received_into_account_id,
      NEW.bought_amount, NEW.bought_amount,
      NEW.buy_rate, NEW.paid_currency,
      'buy', NEW.id,
      'Bought ' || NEW.bought_amount || ' ' || NEW.bought_currency
        || ' @ ' || NEW.buy_rate || ' ' || NEW.paid_currency,
      NEW.entry_date, NEW.created_by);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_buy_lot ON public.buy_transactions;
CREATE TRIGGER trg_buy_lot
AFTER INSERT OR UPDATE OR DELETE ON public.buy_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_buy_lot();

-- ============================================================
-- Backfill lots for existing brought-in and buy rows
-- ============================================================
INSERT INTO public.inventory_lots
  (currency, account_id, original_amount, remaining_amount,
   cost_basis_rate, cost_basis_currency,
   source_ref_type, source_ref_id, source_description, entry_date, created_by)
SELECT
  CASE WHEN b.convert_enabled AND b.converted_currency IS NOT NULL THEN b.converted_currency ELSE b.currency END,
  CASE WHEN b.convert_enabled AND b.final_deposit_account_id IS NOT NULL THEN b.final_deposit_account_id ELSE b.deposit_account_id END,
  CASE WHEN b.convert_enabled AND b.converted_amount IS NOT NULL THEN b.converted_amount ELSE b.amount END,
  CASE WHEN b.convert_enabled AND b.converted_amount IS NOT NULL THEN b.converted_amount ELSE b.amount END,
  CASE WHEN b.convert_enabled AND b.conversion_rate IS NOT NULL THEN b.conversion_rate ELSE 1 END,
  CASE WHEN b.convert_enabled THEN b.currency ELSE b.currency END,
  'brought_in', b.id,
  'Backfilled brought-in ' || b.brought_by::text,
  b.entry_date, b.created_by
FROM public.brought_in_money b
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_lots l
   WHERE l.source_ref_type='brought_in' AND l.source_ref_id = b.id
);

INSERT INTO public.inventory_lots
  (currency, account_id, original_amount, remaining_amount,
   cost_basis_rate, cost_basis_currency,
   source_ref_type, source_ref_id, source_description, entry_date, created_by)
SELECT
  bt.bought_currency, bt.received_into_account_id,
  bt.bought_amount, bt.bought_amount,
  bt.buy_rate, bt.paid_currency,
  'buy', bt.id,
  'Backfilled buy',
  bt.entry_date, bt.created_by
FROM public.buy_transactions bt
WHERE bt.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.inventory_lots l WHERE l.source_ref_type='buy' AND l.source_ref_id=bt.id);

-- ============================================================
-- FIFO consumption on Sell
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_lots_fifo(
  _sell_id UUID, _currency TEXT, _account_id UUID, _amount NUMERIC, _entry_date DATE
) RETURNS TABLE(total_cost NUMERIC, cost_ccy TEXT, blended_rate NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lot RECORD; need NUMERIC := _amount; take NUMERIC; c_ccy TEXT; t_cost NUMERIC := 0;
BEGIN
  -- Restore/wipe prior consumptions from this sell first
  FOR lot IN SELECT lot_id, amount FROM public.lot_consumptions
             WHERE sell_ref_type='sell' AND sell_ref_id=_sell_id LOOP
    UPDATE public.inventory_lots
       SET remaining_amount = remaining_amount + lot.amount,
           status = CASE WHEN remaining_amount + lot.amount >= original_amount THEN 'available'
                         WHEN remaining_amount + lot.amount > 0 THEN 'partial' ELSE 'depleted' END
     WHERE id = lot.lot_id;
  END LOOP;
  DELETE FROM public.lot_consumptions WHERE sell_ref_type='sell' AND sell_ref_id=_sell_id;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, _currency, 0::NUMERIC;
    RETURN;
  END IF;

  FOR lot IN
    SELECT * FROM public.inventory_lots
     WHERE currency = _currency
       AND (_account_id IS NULL OR account_id = _account_id)
       AND remaining_amount > 0
       AND status <> 'depleted'
     ORDER BY entry_date ASC, created_at ASC
  LOOP
    EXIT WHEN need <= 0;
    take := LEAST(need, lot.remaining_amount);
    IF c_ccy IS NULL THEN c_ccy := lot.cost_basis_currency; END IF;

    INSERT INTO public.lot_consumptions
      (lot_id, sell_ref_type, sell_ref_id, currency, amount, cost_rate, cost_amount, cost_basis_currency, entry_date)
    VALUES (lot.id, 'sell', _sell_id, _currency, take, lot.cost_basis_rate,
            ROUND(take * lot.cost_basis_rate, 6), lot.cost_basis_currency, _entry_date);

    UPDATE public.inventory_lots
       SET remaining_amount = remaining_amount - take,
           status = CASE WHEN remaining_amount - take <= 0 THEN 'depleted' ELSE 'partial' END
     WHERE id = lot.id;

    t_cost := t_cost + (take * lot.cost_basis_rate);
    need := need - take;
  END LOOP;

  RETURN QUERY SELECT ROUND(t_cost,6),
                      COALESCE(c_ccy, _currency),
                      CASE WHEN (_amount - need) > 0 THEN ROUND(t_cost / (_amount - need), 8) ELSE 0 END;
END $$;

-- Rewrite sell BEFORE trigger to use FIFO
CREATE OR REPLACE FUNCTION public.trg_sell_calc_and_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Restore lots
    FOR r IN SELECT lot_id, amount FROM public.lot_consumptions
             WHERE sell_ref_type='sell' AND sell_ref_id=OLD.id LOOP
      UPDATE public.inventory_lots
         SET remaining_amount = remaining_amount + r.amount,
             status = CASE WHEN remaining_amount + r.amount >= original_amount THEN 'available'
                           WHEN remaining_amount + r.amount > 0 THEN 'partial' ELSE 'depleted' END
       WHERE id = r.lot_id;
    END LOOP;
    DELETE FROM public.lot_consumptions WHERE sell_ref_type='sell' AND sell_ref_id=OLD.id;
    DELETE FROM public.ledger_entries WHERE ref_type='sell' AND ref_id=OLD.id;
    RETURN OLD;
  END IF;

  SELECT * INTO r FROM public.consume_lots_fifo(
    NEW.id, NEW.sold_currency, NEW.sold_from_account_id, NEW.sold_amount, NEW.entry_date);

  NEW.cost_basis_rate := r.blended_rate;
  NEW.cost_basis_amount := r.total_cost;

  -- profit only when the cost currency equals the received currency
  IF r.cost_ccy = NEW.received_currency THEN
    NEW.gross_profit := NEW.received_amount - r.total_cost;
  ELSE
    NEW.gross_profit := 0;
  END IF;

  IF (NEW.milad_share_pct + NEW.ali_share_pct) <> 100 THEN
    NEW.ali_share_pct := 100 - NEW.milad_share_pct;
  END IF;
  NEW.milad_profit := ROUND(NEW.gross_profit * NEW.milad_share_pct / 100, 4);
  NEW.ali_profit  := ROUND(NEW.gross_profit * NEW.ali_share_pct  / 100, 4);

  IF TG_OP = 'UPDATE' THEN
    DELETE FROM public.ledger_entries WHERE ref_type='sell' AND ref_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;

-- ============================================================
-- Reporting views
-- ============================================================
CREATE OR REPLACE VIEW public.inventory_lots_view AS
SELECT l.*,
       a.name AS account_name,
       (l.original_amount - l.remaining_amount) AS sold_amount
FROM public.inventory_lots l
LEFT JOIN public.accounts a ON a.id = l.account_id;

GRANT SELECT ON public.inventory_lots_view TO authenticated;

CREATE OR REPLACE VIEW public.profit_by_lot AS
SELECT l.id AS lot_id, l.lot_code, l.currency, l.cost_basis_rate, l.cost_basis_currency,
       l.source_ref_type, l.source_ref_id, l.source_description,
       COALESCE(SUM(c.amount),0) AS sold_amount,
       COALESCE(SUM(c.cost_amount),0) AS total_cost,
       COALESCE(SUM(s.received_amount * (c.amount / NULLIF(s.sold_amount,0))),0) AS total_received,
       COALESCE(SUM(s.received_amount * (c.amount / NULLIF(s.sold_amount,0))
                    - c.cost_amount) FILTER (WHERE s.received_currency = c.cost_basis_currency),0) AS gross_profit
FROM public.inventory_lots l
LEFT JOIN public.lot_consumptions c ON c.lot_id = l.id
LEFT JOIN public.sell_transactions s ON s.id = c.sell_ref_id AND c.sell_ref_type='sell'
GROUP BY l.id;

GRANT SELECT ON public.profit_by_lot TO authenticated;
