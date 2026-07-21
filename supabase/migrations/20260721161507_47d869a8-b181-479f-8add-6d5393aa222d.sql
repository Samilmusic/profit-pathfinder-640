
-- =============== Enums ==================================================
ALTER TYPE public.ledger_ref_type ADD VALUE IF NOT EXISTS 'third_party_settlement';

ALTER TYPE public.remittance_status ADD VALUE IF NOT EXISTS 'customer_paid_supplier';
ALTER TYPE public.remittance_status ADD VALUE IF NOT EXISTS 'waiting_settlement_proof';
ALTER TYPE public.remittance_status ADD VALUE IF NOT EXISTS 'waiting_supplier_delivery';
ALTER TYPE public.remittance_status ADD VALUE IF NOT EXISTS 'partially_settled';

DO $$ BEGIN
  CREATE TYPE public.remittance_payment_destination AS ENUM (
    'into_account','cash_to_us','to_third_party','settles_linked_buy','pending'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.remittance_excess_allocation AS ENUM (
    'none','our_account','another_supplier','customer_balance','pending','commission'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.buy_settlement_source AS ENUM ('own_funds','remittance_payment','mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============== Column additions =======================================
ALTER TABLE public.remittances
  ADD COLUMN IF NOT EXISTS payment_destination public.remittance_payment_destination NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS third_party_customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS third_party_name text,
  ADD COLUMN IF NOT EXISTS linked_buy_id uuid REFERENCES public.buy_transactions(id),
  ADD COLUMN IF NOT EXISTS settlement_amount numeric,
  ADD COLUMN IF NOT EXISTS settlement_currency text,
  ADD COLUMN IF NOT EXISTS settlement_date date,
  ADD COLUMN IF NOT EXISTS settlement_proof_url text,
  ADD COLUMN IF NOT EXISTS excess_allocation public.remittance_excess_allocation NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS excess_allocation_target_id uuid,
  ADD COLUMN IF NOT EXISTS excess_allocation_note text;

ALTER TABLE public.buy_transactions
  ADD COLUMN IF NOT EXISTS settlement_source public.buy_settlement_source NOT NULL DEFAULT 'own_funds',
  ADD COLUMN IF NOT EXISTS settled_by_remittance_id uuid REFERENCES public.remittances(id),
  ADD COLUMN IF NOT EXISTS supplier_settled_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_delivery_note text;

CREATE INDEX IF NOT EXISTS idx_remittances_linked_buy ON public.remittances(linked_buy_id);
CREATE INDEX IF NOT EXISTS idx_buy_settled_by_remittance ON public.buy_transactions(settled_by_remittance_id);

-- =============== Buy ledger trigger — skip IRR-out leg for third-party ==
CREATE OR REPLACE FUNCTION public.trg_buy_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.ledger_entries WHERE ref_type = 'buy' AND ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    -- Outflow leg: skip when funds came from a linked remittance payment
    IF COALESCE(NEW.settlement_source::text, 'own_funds') <> 'remittance_payment' THEN
      INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.paid_from_account_id, NEW.entry_date, NEW.paid_currency, -NEW.paid_amount, 'buy', NEW.id,
        'Bought ' || NEW.bought_amount || ' ' || NEW.bought_currency || ' @ ' || NEW.buy_rate);
    END IF;
    -- Inflow (receiving the bought currency) only after supplier has actually delivered
    IF COALESCE(NEW.supplier_delivered, false) OR COALESCE(NEW.settlement_source::text,'own_funds') = 'own_funds' THEN
      INSERT INTO public.ledger_entries (account_id, entry_date, currency, amount, ref_type, ref_id, description)
      VALUES (NEW.received_into_account_id, COALESCE(NEW.supplier_delivered_at::date, NEW.entry_date),
        NEW.bought_currency, NEW.bought_amount, 'buy', NEW.id,
        'Bought ' || NEW.bought_amount || ' ' || NEW.bought_currency || ' @ ' || NEW.buy_rate);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $fn$;

-- =============== Buy lot trigger — gate on delivery for remittance flows =
CREATE OR REPLACE FUNCTION public.trg_buy_lot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE rem_code text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.inventory_lots
      WHERE source_ref_type = 'buy' AND source_ref_id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.deleted_at IS NULL THEN
    -- If settled from a remittance and not yet delivered, don't create the lot yet.
    IF COALESCE(NEW.settlement_source::text,'own_funds') = 'remittance_payment'
       AND NOT COALESCE(NEW.supplier_delivered, false) THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    IF NEW.settled_by_remittance_id IS NOT NULL THEN
      SELECT doc_no INTO rem_code FROM public.remittances WHERE id = NEW.settled_by_remittance_id;
    END IF;

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
        || ' @ ' || NEW.buy_rate || ' ' || NEW.paid_currency
        || COALESCE(' — settled by ' || rem_code, ''),
      COALESCE(NEW.supplier_delivered_at::date, NEW.entry_date), NEW.created_by);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $fn$;

-- =============== Remittance ledger trigger — third-party aware ==========
CREATE OR REPLACE FUNCTION public.trg_remittance_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE dest text;
BEGIN
  DELETE FROM public.ledger_entries
    WHERE ref_type IN ('remittance','third_party_settlement') AND ref_id = COALESCE(NEW.id, OLD.id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  dest := COALESCE(NEW.payment_destination::text, 'pending');

  -- Money we sent (transfer out) — always hits our account when transfer_completed/closed
  IF NEW.status IN ('closed','transfer_completed','ready_to_close') AND NEW.source_account_id IS NOT NULL THEN
    INSERT INTO public.ledger_entries (account_id, currency, amount, ref_type, ref_id, entry_date, description)
    VALUES (NEW.source_account_id, NEW.transfer_currency, -NEW.transferred_amount, 'remittance', NEW.id, NEW.entry_date,
      'Remittance out — ' || COALESCE(NEW.doc_no,'') || COALESCE(' → '||NEW.beneficiary_name,''));
  END IF;

  -- Customer's payment leg
  IF dest IN ('into_account','cash_to_us') THEN
    IF NEW.status = 'closed' AND NEW.payment_received_account_id IS NOT NULL AND NEW.customer_payment_amount > 0 THEN
      INSERT INTO public.ledger_entries (account_id, currency, amount, ref_type, ref_id, entry_date, description)
      VALUES (NEW.payment_received_account_id, NEW.customer_payment_currency, NEW.customer_payment_amount, 'remittance', NEW.id, NEW.entry_date,
        'Remittance payment in — ' || COALESCE(NEW.doc_no,''));
    END IF;
  ELSIF dest IN ('to_third_party','settles_linked_buy') THEN
    -- Memo-only ledger row: NO account, so it never affects any balance.
    IF NEW.settlement_amount IS NOT NULL AND NEW.settlement_amount > 0 THEN
      INSERT INTO public.ledger_entries (account_id, currency, amount, ref_type, ref_id, entry_date, description)
      VALUES (NULL, COALESCE(NEW.settlement_currency, NEW.customer_payment_currency),
        NEW.settlement_amount, 'third_party_settlement', NEW.id,
        COALESCE(NEW.settlement_date, NEW.entry_date),
        'Third-party settlement — ' || COALESCE(NEW.doc_no,'')
          || COALESCE(' → paid to ' || NEW.third_party_name, '')
          || COALESCE(' (linked ' || (SELECT doc_no FROM public.buy_transactions WHERE id = NEW.linked_buy_id) || ')', ''));
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

-- =============== Sync buy.supplier_settled_amount when remittance saved =
CREATE OR REPLACE FUNCTION public.trg_remittance_sync_buy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  -- Detach previous buy if changed
  IF TG_OP = 'UPDATE' AND OLD.linked_buy_id IS NOT NULL
     AND OLD.linked_buy_id IS DISTINCT FROM NEW.linked_buy_id THEN
    UPDATE public.buy_transactions
       SET settled_by_remittance_id = NULL,
           settlement_source = 'own_funds',
           supplier_settled_amount = 0
     WHERE id = OLD.linked_buy_id AND settled_by_remittance_id = OLD.id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.linked_buy_id IS NOT NULL THEN
      UPDATE public.buy_transactions
         SET settled_by_remittance_id = NULL,
             settlement_source = 'own_funds',
             supplier_settled_amount = 0
       WHERE id = OLD.linked_buy_id AND settled_by_remittance_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.linked_buy_id IS NOT NULL THEN
    UPDATE public.buy_transactions
       SET settled_by_remittance_id = NEW.id,
           settlement_source = 'remittance_payment',
           supplier_settled_amount = COALESCE(NEW.settlement_amount, 0)
     WHERE id = NEW.linked_buy_id;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_remittance_sync_buy ON public.remittances;
CREATE TRIGGER trg_remittance_sync_buy
AFTER INSERT OR UPDATE OR DELETE ON public.remittances
FOR EACH ROW EXECUTE FUNCTION public.trg_remittance_sync_buy();

-- =============== Record supplier delivery RPC ============================
CREATE OR REPLACE FUNCTION public.record_supplier_delivery(_buy_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.can_write(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE public.buy_transactions
     SET supplier_delivered = true,
         supplier_delivered_at = COALESCE(supplier_delivered_at, now()),
         supplier_delivery_note = COALESCE(_note, supplier_delivery_note),
         updated_at = now()
   WHERE id = _buy_id;
END $fn$;
REVOKE ALL ON FUNCTION public.record_supplier_delivery(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_supplier_delivery(uuid, text) TO authenticated;

-- =============== Validation checklist for close =========================
CREATE OR REPLACE FUNCTION public.validate_third_party_settlement(_remittance_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $fn$
DECLARE
  r public.remittances%ROWTYPE;
  b public.buy_transactions%ROWTYPE;
  has_proof boolean := false;
  items jsonb := '[]'::jsonb;
  dest text;
BEGIN
  SELECT * INTO r FROM public.remittances WHERE id = _remittance_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  dest := COALESCE(r.payment_destination::text, 'pending');
  IF dest NOT IN ('to_third_party','settles_linked_buy') THEN
    RETURN jsonb_build_object('found', true, 'is_third_party', false);
  END IF;

  has_proof := (r.settlement_proof_url IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.documents WHERE ref_type='remittance' AND ref_id=r.id
               AND doc_type IN ('payment_receipt','bank_transfer_screenshot','cash_delivery_receipt','whatsapp_confirmation'));

  IF r.linked_buy_id IS NOT NULL THEN
    SELECT * INTO b FROM public.buy_transactions WHERE id = r.linked_buy_id;
  END IF;

  items := items || jsonb_build_array(
    jsonb_build_object('key','customer_paid','label','Customer payment recorded',
                       'ok', r.settlement_amount IS NOT NULL AND r.settlement_amount > 0),
    jsonb_build_object('key','settlement_proof','label','Third-party payment proof uploaded',
                       'ok', has_proof),
    jsonb_build_object('key','transfer_done','label','Remittance transfer completed',
                       'ok', r.status IN ('transfer_completed','ready_to_close','closed')
                          OR (r.transfer_date IS NOT NULL AND r.transferred_amount > 0)),
    jsonb_build_object('key','linked_buy','label','Linked supplier buy present',
                       'ok', r.linked_buy_id IS NOT NULL),
    jsonb_build_object('key','supplier_delivery','label','Supplier delivered bought currency',
                       'ok', b.id IS NULL OR COALESCE(b.supplier_delivered,false))
  );

  RETURN jsonb_build_object(
    'found', true,
    'is_third_party', true,
    'can_close', (SELECT bool_and((x->>'ok')::boolean) FROM jsonb_array_elements(items) x),
    'items', items,
    'linked_buy_id', r.linked_buy_id,
    'linked_buy_code', b.doc_no,
    'supplier_bought_amount', b.bought_amount,
    'supplier_bought_currency', b.bought_currency,
    'supplier_delivered', COALESCE(b.supplier_delivered, false)
  );
END $fn$;
REVOKE ALL ON FUNCTION public.validate_third_party_settlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_third_party_settlement(uuid) TO authenticated;

-- =============== Settlement path view ===================================
CREATE OR REPLACE VIEW public.v_remittance_settlement_path
WITH (security_invoker = on) AS
SELECT
  r.id AS remittance_id,
  r.doc_no AS remittance_code,
  r.status,
  r.payment_destination,
  r.entry_date,
  r.customer_id AS payer_customer_id,
  cp.name AS payer_name,
  r.third_party_customer_id,
  COALESCE(ctp.name, r.third_party_name) AS third_party_name,
  r.settlement_amount,
  r.settlement_currency,
  r.settlement_date,
  r.settlement_proof_url,
  r.transferred_amount AS remittance_sent_amount,
  r.transfer_currency AS remittance_sent_currency,
  r.net_commission_aed,
  b.id AS linked_buy_id,
  b.doc_no AS linked_buy_code,
  b.bought_amount AS supplier_bought_amount,
  b.bought_currency AS supplier_bought_currency,
  b.buy_rate AS supplier_rate,
  b.supplier_delivered,
  b.supplier_delivered_at,
  b.supplier_settled_amount,
  r.excess_allocation
FROM public.remittances r
LEFT JOIN public.customers cp ON cp.id = r.customer_id
LEFT JOIN public.customers ctp ON ctp.id = r.third_party_customer_id
LEFT JOIN public.buy_transactions b ON b.id = r.linked_buy_id
WHERE r.payment_destination IN ('to_third_party','settles_linked_buy');

GRANT SELECT ON public.v_remittance_settlement_path TO authenticated;
