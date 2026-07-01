
-- 1) Enum values (safe if run again)
ALTER TYPE public.sell_deal_status ADD VALUE IF NOT EXISTS 'waiting_currency_delivery';
ALTER TYPE public.sell_deal_status ADD VALUE IF NOT EXISTS 'waiting_delivery_proof';

-- 2) New delivery-tracking columns on sell_transactions
ALTER TABLE public.sell_transactions
  ADD COLUMN IF NOT EXISTS currency_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_by uuid,
  ADD COLUMN IF NOT EXISTS delivery_method text,
  ADD COLUMN IF NOT EXISTS delivered_to text,
  ADD COLUMN IF NOT EXISTS delivery_notes text;

-- 3) Updated status recomputer including delivery stages
CREATE OR REPLACE FUNCTION public.recompute_sell_deal_status(_sell_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.sell_transactions%ROWTYPE;
  paid numeric := 0;
  has_payment_receipt boolean := false;
  has_delivery_proof boolean := false;
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
    INTO has_payment_receipt;

  SELECT EXISTS(SELECT 1 FROM public.documents
                 WHERE ref_type='sell' AND ref_id=_sell_id
                   AND doc_type IN ('currency_handover_proof','cash_delivery_receipt','bank_transfer_screenshot'))
    INTO has_delivery_proof;

  IF paid <= 0 THEN
    new_status := 'waiting_payment';
  ELSIF paid + 0.0001 < s.received_amount THEN
    new_status := 'partially_paid';
  ELSIF NOT has_payment_receipt THEN
    new_status := 'waiting_receipt';
  ELSIF NOT s.currency_delivered THEN
    new_status := 'waiting_currency_delivery';
  ELSIF NOT has_delivery_proof THEN
    new_status := 'waiting_delivery_proof';
  ELSIF s.received_into_account_id IS NULL THEN
    new_status := 'waiting_receipt';
  ELSE
    new_status := 'ready_to_close';
  END IF;

  UPDATE public.sell_transactions
     SET amount_received = paid, deal_status = new_status, updated_at = now()
   WHERE id = _sell_id;
END $function$;

-- 4) Sold-leg ledger only posts after delivery (or when closed).
CREATE OR REPLACE FUNCTION public.trg_sell_ledger_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'sell' AND ref_id = OLD.id;
    RETURN OLD;
  END IF;
  DELETE FROM public.ledger_entries WHERE ref_type='sell' AND ref_id=NEW.id;

  -- Sold-leg: only after currency is actually delivered (or deal closed)
  IF NEW.deal_status <> 'cancelled'
     AND NEW.sold_from_account_id IS NOT NULL
     AND (NEW.currency_delivered = true OR NEW.deal_status = 'closed') THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.sold_from_account_id, COALESCE(NEW.delivered_at::date, NEW.entry_date), NEW.sold_currency, -NEW.sold_amount, 'sell', NEW.id,
      'Delivered ' || NEW.sold_amount || ' ' || NEW.sold_currency || ' to customer'
      || CASE WHEN NEW.delivery_method IS NOT NULL THEN ' (' || NEW.delivery_method || ')' ELSE '' END);
  END IF;

  -- Received-leg on close (partial payments post via sell_payments ledger)
  IF NEW.deal_status = 'closed' AND NEW.received_into_account_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.sell_payments WHERE sell_id=NEW.id AND deleted_at IS NULL) THEN
    INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
    VALUES (NEW.received_into_account_id, NEW.entry_date, NEW.received_currency, NEW.received_amount, 'sell', NEW.id,
      'Sell settled — received ' || NEW.received_amount || ' ' || NEW.received_currency);
  END IF;
  RETURN NEW;
END $function$;

-- 5) close_sell_deal enforces delivery + delivery proof
CREATE OR REPLACE FUNCTION public.close_sell_deal(_id uuid, _override boolean DEFAULT false, _difference_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.sell_transactions%ROWTYPE;
  paid numeric := 0;
  has_payment_receipt boolean := false;
  has_delivery_proof boolean := false;
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
      INTO has_payment_receipt;
    IF NOT has_payment_receipt THEN
      RAISE EXCEPTION 'Cannot close: upload a payment receipt or admin-override';
    END IF;

    IF NOT s.currency_delivered THEN
      RAISE EXCEPTION 'Cannot close: currency delivery is not recorded';
    END IF;

    SELECT EXISTS(SELECT 1 FROM public.documents
       WHERE ref_type='sell' AND ref_id=_id
         AND doc_type IN ('currency_handover_proof','cash_delivery_receipt','bank_transfer_screenshot'))
      INTO has_delivery_proof;
    IF NOT has_delivery_proof THEN
      RAISE EXCEPTION 'Cannot close: upload a delivery proof or admin-override';
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
END $function$;

-- 6) New RPC to mark delivery
CREATE OR REPLACE FUNCTION public.mark_sell_delivered(
  _id uuid,
  _method text,
  _delivered_to text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _sold_from_account_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE s public.sell_transactions%ROWTYPE;
BEGIN
  IF NOT public.can_write(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO s FROM public.sell_transactions WHERE id=_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sell not found'; END IF;
  IF s.deal_status IN ('closed','cancelled') THEN RAISE EXCEPTION 'Deal is % — cannot record delivery', s.deal_status; END IF;

  UPDATE public.sell_transactions SET
    currency_delivered = true,
    delivered_at = COALESCE(delivered_at, now()),
    delivered_by = COALESCE(delivered_by, auth.uid()),
    delivery_method = COALESCE(_method, delivery_method),
    delivered_to = COALESCE(_delivered_to, delivered_to),
    delivery_notes = COALESCE(_notes, delivery_notes),
    sold_from_account_id = COALESCE(_sold_from_account_id, sold_from_account_id),
    updated_at = now()
  WHERE id=_id;

  PERFORM public.recompute_sell_deal_status(_id);
END $function$;

REVOKE ALL ON FUNCTION public.mark_sell_delivered(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_sell_delivered(uuid, text, text, text, uuid) TO authenticated;
