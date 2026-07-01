
-- 1) Enum
DO $$ BEGIN
  CREATE TYPE public.sell_deal_status AS ENUM (
    'open','waiting_payment','partially_paid','waiting_receipt','ready_to_close','closed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Columns on sell_transactions
ALTER TABLE public.sell_transactions
  ADD COLUMN IF NOT EXISTS deal_status public.sell_deal_status NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS amount_received numeric(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_difference_reason text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS expected_payment_date date;

-- Received account no longer required at save-time
ALTER TABLE public.sell_transactions ALTER COLUMN received_into_account_id DROP NOT NULL;

-- Backfill
UPDATE public.sell_transactions
   SET deal_status = 'closed',
       amount_received = received_amount,
       closed_at = COALESCE(closed_at, updated_at)
 WHERE settlement_status = 'completed' AND deal_status = 'open';

-- 3) sell_payments table
CREATE TABLE IF NOT EXISTS public.sell_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sell_id uuid NOT NULL REFERENCES public.sell_transactions(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL,
  amount numeric(20,4) NOT NULL CHECK (amount > 0),
  received_into_account_id uuid REFERENCES public.accounts(id),
  receipt_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sell_payments TO authenticated;
GRANT ALL ON public.sell_payments TO service_role;

ALTER TABLE public.sell_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read sell_payments" ON public.sell_payments;
CREATE POLICY "auth read sell_payments" ON public.sell_payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "writers insert sell_payments" ON public.sell_payments;
CREATE POLICY "writers insert sell_payments" ON public.sell_payments FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
DROP POLICY IF EXISTS "writers update sell_payments" ON public.sell_payments;
CREATE POLICY "writers update sell_payments" ON public.sell_payments FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
DROP POLICY IF EXISTS "admin delete sell_payments" ON public.sell_payments;
CREATE POLICY "admin delete sell_payments" ON public.sell_payments FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sell_payments_sell ON public.sell_payments(sell_id);

DROP TRIGGER IF EXISTS trg_sell_payments_updated ON public.sell_payments;
CREATE TRIGGER trg_sell_payments_updated BEFORE UPDATE ON public.sell_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Ledger for sell payments (money in)
CREATE OR REPLACE FUNCTION public.trg_sell_payment_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type='sell_payment' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.deleted_at IS NULL AND NEW.received_into_account_id IS NOT NULL THEN
    INSERT INTO public.ledger_entries(account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.received_into_account_id, NEW.entry_date, NEW.currency, NEW.amount, 'sell_payment', NEW.id,
      'Sell payment received');
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sell_payment_ledger ON public.sell_payments;
CREATE TRIGGER trg_sell_payment_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.sell_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_sell_payment_ledger();

-- 5) Recompute parent sell deal_status after payments change
CREATE OR REPLACE FUNCTION public.recompute_sell_deal_status(_sell_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.sell_transactions%ROWTYPE;
  paid numeric := 0;
  has_receipt boolean := false;
  new_status public.sell_deal_status;
BEGIN
  SELECT * INTO s FROM public.sell_transactions WHERE id = _sell_id;
  IF NOT FOUND OR s.deal_status IN ('closed','cancelled') THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.sell_payments
    WHERE sell_id = _sell_id AND deleted_at IS NULL AND currency = s.received_currency;

  SELECT EXISTS(SELECT 1 FROM public.documents
                 WHERE ref_type='sell' AND ref_id=_sell_id
                   AND doc_type IN ('payment_receipt','bank_transfer_screenshot','cash_delivery_receipt','whatsapp_confirmation'))
    OR EXISTS(SELECT 1 FROM public.sell_payments WHERE sell_id=_sell_id AND deleted_at IS NULL AND receipt_url IS NOT NULL)
    INTO has_receipt;

  IF paid <= 0 THEN
    new_status := CASE WHEN has_receipt THEN 'waiting_receipt' ELSE 'waiting_payment' END;
  ELSIF paid + 0.0001 < s.received_amount THEN
    new_status := 'partially_paid';
  ELSE
    new_status := CASE WHEN has_receipt AND s.received_into_account_id IS NOT NULL THEN 'ready_to_close' ELSE 'waiting_receipt' END;
  END IF;

  UPDATE public.sell_transactions
     SET amount_received = paid, deal_status = new_status, updated_at = now()
   WHERE id = _sell_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_sell_payment_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_sell_deal_status(COALESCE(NEW.sell_id, OLD.sell_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sell_payment_recompute ON public.sell_payments;
CREATE TRIGGER trg_sell_payment_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.sell_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_sell_payment_recompute();

-- Also recompute when a document is added/removed for a sell
CREATE OR REPLACE FUNCTION public.trg_sell_doc_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid; rtype text;
BEGIN
  rtype := COALESCE(NEW.ref_type, OLD.ref_type);
  rid := COALESCE(NEW.ref_id, OLD.ref_id);
  IF rtype = 'sell' THEN
    PERFORM public.recompute_sell_deal_status(rid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_sell_doc_recompute ON public.documents;
CREATE TRIGGER trg_sell_doc_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.trg_sell_doc_recompute();

-- 6) Gate sell ledger & cycle sync on deal_status
--    Only post received-leg (and only affect cycle) when closed.
CREATE OR REPLACE FUNCTION public.trg_sell_ledger_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'sell' AND ref_id = OLD.id;
    RETURN OLD;
  END IF;
  DELETE FROM public.ledger_entries WHERE ref_type='sell' AND ref_id=NEW.id;

  -- Sold-leg (inventory out): always post on create/update (unless cancelled)
  IF NEW.deal_status <> 'cancelled' AND NEW.sold_from_account_id IS NOT NULL THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.sold_from_account_id, NEW.entry_date, NEW.sold_currency, -NEW.sold_amount, 'sell', NEW.id,
      'Sold ' || NEW.sold_amount || ' ' || NEW.sold_currency || ' @ ' || NEW.sell_rate);
  END IF;

  -- Received-leg: only when closed and destination known.
  -- (Ongoing partial payments post via sell_payments ledger.)
  IF NEW.deal_status = 'closed' AND NEW.received_into_account_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.sell_payments WHERE sell_id=NEW.id AND deleted_at IS NULL) THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.received_into_account_id, NEW.entry_date, NEW.received_currency, NEW.received_amount, 'sell', NEW.id,
      'Sell settled — received ' || NEW.received_amount || ' ' || NEW.received_currency);
  END IF;
  RETURN NEW;
END $$;

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

  IF TG_OP = 'INSERT' AND NEW.trade_cycle_id IS NULL AND COALESCE(NEW.creates_cycle,false)
     AND NEW.deal_status = 'closed' THEN
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

  IF NEW.trade_cycle_id IS NOT NULL AND NEW.deal_status = 'closed' THEN
    PERFORM public.recompute_cycle_profit(NEW.trade_cycle_id);
  END IF;
  RETURN NEW;
END $$;

-- Skip enforce_txn_completion for sells (deal_status supersedes settlement_status)
CREATE OR REPLACE FUNCTION public.enforce_txn_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE money_docs int; delivery_docs int; ref text := TG_ARGV[0];
BEGIN
  IF ref = 'sell' THEN
    RETURN NEW; -- handled by deal_status lifecycle
  END IF;
  IF NEW.settlement_status = 'completed' AND (TG_OP = 'INSERT' OR OLD.settlement_status IS DISTINCT FROM 'completed') THEN
    IF COALESCE(NEW.completion_note,'') = '' THEN
      RAISE EXCEPTION 'Completion note is required to mark % as completed', ref;
    END IF;
    IF ref = 'buy' THEN
      IF NEW.paid_from_account_id IS NULL THEN
        RAISE EXCEPTION 'Cannot complete buy: source (paid-from) account is required';
      END IF;
      IF NEW.received_into_account_id IS NULL THEN
        RAISE EXCEPTION 'Cannot complete buy: destination (received-into) account is required';
      END IF;
    END IF;
    SELECT count(*) INTO money_docs FROM public.documents
      WHERE ref_type = ref AND ref_id = NEW.id
        AND doc_type IN ('payment_receipt','bank_transfer_screenshot','cash_delivery_receipt','whatsapp_confirmation');
    SELECT count(*) INTO delivery_docs FROM public.documents
      WHERE ref_type = ref AND ref_id = NEW.id
        AND doc_type IN ('currency_handover_proof','cash_delivery_receipt','bank_transfer_screenshot');
    IF money_docs = 0 THEN RAISE EXCEPTION 'Cannot complete %: proof of payment/receipt is required', ref; END IF;
    IF delivery_docs = 0 THEN RAISE EXCEPTION 'Cannot complete %: proof of currency delivery is required', ref; END IF;
  END IF;
  RETURN NEW;
END; $$;

-- 7) close_sell_deal RPC
CREATE OR REPLACE FUNCTION public.close_sell_deal(_id uuid, _override boolean DEFAULT false, _difference_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  s public.sell_transactions%ROWTYPE;
  paid numeric := 0;
  has_receipt boolean := false;
BEGIN
  IF NOT public.can_write(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT * INTO s FROM public.sell_transactions WHERE id=_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sell not found'; END IF;
  IF s.deal_status = 'closed' THEN RETURN; END IF;
  IF s.deal_status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled sell cannot be closed'; END IF;

  IF s.received_into_account_id IS NULL THEN
    RAISE EXCEPTION 'Pick a receiving account before closing the deal';
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.sell_payments
    WHERE sell_id=_id AND deleted_at IS NULL AND currency=s.received_currency;

  IF paid + 0.0001 < s.received_amount AND NOT _override THEN
    RAISE EXCEPTION 'Cannot close: only % of % received. Record remaining payment or admin-override.', paid, s.received_amount;
  END IF;

  IF NOT _override THEN
    SELECT EXISTS(SELECT 1 FROM public.documents
       WHERE ref_type='sell' AND ref_id=_id
         AND doc_type IN ('payment_receipt','bank_transfer_screenshot','cash_delivery_receipt','whatsapp_confirmation'))
      OR EXISTS(SELECT 1 FROM public.sell_payments WHERE sell_id=_id AND deleted_at IS NULL AND receipt_url IS NOT NULL)
      INTO has_receipt;
    IF NOT has_receipt THEN
      RAISE EXCEPTION 'Cannot close: upload a receipt or admin-override';
    END IF;
  END IF;

  UPDATE public.sell_transactions
     SET deal_status='closed',
         amount_received = GREATEST(paid, amount_received),
         payment_difference_reason = COALESCE(_difference_reason, payment_difference_reason),
         settlement_status='completed',
         closed_at = now(),
         closed_by = auth.uid(),
         updated_at = now()
   WHERE id=_id;
END $$;

REVOKE ALL ON FUNCTION public.close_sell_deal(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_sell_deal(uuid, boolean, text) TO authenticated;

-- 8) cancel_sell_deal RPC (restores inventory via ledger removal; lot consumptions restored by existing delete-trigger path)
CREATE OR REPLACE FUNCTION public.cancel_sell_deal(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required to cancel a deal';
  END IF;
  IF NOT public.can_write(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  PERFORM public.set_edit_context(_reason, NULL);

  -- restore any FIFO lot consumptions
  FOR r IN SELECT lot_id, amount FROM public.lot_consumptions
           WHERE sell_ref_type='sell' AND sell_ref_id=_id LOOP
    UPDATE public.inventory_lots
       SET remaining_amount = remaining_amount + r.amount,
           status = CASE WHEN remaining_amount + r.amount >= original_amount THEN 'available'
                         WHEN remaining_amount + r.amount > 0 THEN 'partial' ELSE 'depleted' END
     WHERE id = r.lot_id;
  END LOOP;
  DELETE FROM public.lot_consumptions WHERE sell_ref_type='sell' AND sell_ref_id=_id;

  UPDATE public.sell_transactions
     SET deal_status='cancelled', cancel_reason=_reason, updated_at=now()
   WHERE id=_id;

  -- remove ledger entries so balances snap back
  DELETE FROM public.ledger_entries WHERE ref_type='sell' AND ref_id=_id;
END $$;

REVOKE ALL ON FUNCTION public.cancel_sell_deal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_sell_deal(uuid, text) TO authenticated;
