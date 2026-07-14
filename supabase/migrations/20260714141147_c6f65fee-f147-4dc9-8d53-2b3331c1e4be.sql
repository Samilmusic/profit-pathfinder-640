
-- PHASE 1 — FINANCIAL INTEGRITY FOUNDATION

ALTER TABLE public.trade_cycles
  ADD COLUMN IF NOT EXISTS deal_code TEXT,
  ADD COLUMN IF NOT EXISTS trade_mode TEXT
    CHECK (trade_mode IN ('buy_only','sell_from_inventory','matched_direct','legacy')),
  ADD COLUMN IF NOT EXISTS profit_destination_account_id UUID
    REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS profit_status TEXT
    CHECK (profit_status IN ('pending','received','receivable','waived'))
    DEFAULT 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS trade_cycles_deal_code_uidx
  ON public.trade_cycles(deal_code) WHERE deal_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_trade_cycle_deal_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix TEXT; y INT;
BEGIN
  IF NEW.deal_code IS NOT NULL AND NEW.deal_code <> '' THEN RETURN NEW; END IF;
  prefix := CASE COALESCE(NEW.trade_mode, NEW.cycle_kind::text, 'generic')
              WHEN 'matched_direct' THEN 'MATCH'
              WHEN 'buy_only' THEN 'BUY'
              WHEN 'sell_from_inventory' THEN 'SELL'
              ELSE 'DEAL'
            END;
  y := EXTRACT(YEAR FROM COALESCE(NEW.entry_date, CURRENT_DATE));
  NEW.deal_code := public.next_doc_no(prefix, y);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trade_cycle_deal_code ON public.trade_cycles;
CREATE TRIGGER trg_trade_cycle_deal_code
  BEFORE INSERT ON public.trade_cycles
  FOR EACH ROW EXECUTE FUNCTION public.trg_trade_cycle_deal_code();

UPDATE public.trade_cycles tc
SET deal_code = public.next_doc_no('DEAL',
  EXTRACT(YEAR FROM COALESCE(tc.entry_date, tc.created_at::date, CURRENT_DATE))::int)
WHERE tc.deal_code IS NULL;

UPDATE public.trade_cycles SET trade_mode = 'legacy' WHERE trade_mode IS NULL;

-- profit_receivables
CREATE TABLE IF NOT EXISTS public.profit_receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_cycle_id UUID REFERENCES public.trade_cycles(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id),
  currency TEXT NOT NULL DEFAULT 'AED',
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','received','waived','cancelled')),
  received_at TIMESTAMPTZ,
  received_into_account_id UUID REFERENCES public.accounts(id),
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profit_receivables TO authenticated;
GRANT ALL ON public.profit_receivables TO service_role;

ALTER TABLE public.profit_receivables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read profit receivables" ON public.profit_receivables;
CREATE POLICY "Staff can read profit receivables"
  ON public.profit_receivables FOR SELECT
  TO authenticated USING (public.can_write(auth.uid()));

DROP POLICY IF EXISTS "Staff can write profit receivables" ON public.profit_receivables;
CREATE POLICY "Staff can write profit receivables"
  ON public.profit_receivables FOR ALL
  TO authenticated
  USING (public.can_write(auth.uid()))
  WITH CHECK (public.can_write(auth.uid()));

DROP TRIGGER IF EXISTS set_profit_receivables_updated_at ON public.profit_receivables;
CREATE TRIGGER set_profit_receivables_updated_at
  BEFORE UPDATE ON public.profit_receivables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Placeholder profit account (option B)
INSERT INTO public.accounts (name, account_type, currency, owner, opening_balance, is_active, notes)
SELECT 'Profit — Unassigned (AED)', 'person_holding'::account_type, 'AED', 'other', 0, true,
       'Auto-created placeholder for matched-trade profits without a destination.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts WHERE name = 'Profit — Unassigned (AED)' AND deleted_at IS NULL
);

WITH placeholder AS (
  SELECT id FROM public.accounts
   WHERE name = 'Profit — Unassigned (AED)' AND deleted_at IS NULL LIMIT 1
)
UPDATE public.trade_cycles tc
SET profit_destination_account_id = (SELECT id FROM placeholder)
WHERE tc.profit_destination_account_id IS NULL
  AND (tc.trade_mode = 'matched_direct' OR tc.cycle_kind = 'generic');

-- Rename "Ali Cash Box" → "Milad Box"
UPDATE public.accounts
SET name = replace(name, 'Ali Cash Box', 'Milad Box'),
    updated_at = now()
WHERE name ILIKE 'Ali Cash Box%';

-- Reconciliation view
CREATE OR REPLACE VIEW public.v_balance_reconciliation
WITH (security_invoker = on) AS
WITH ledger_sum AS (
  SELECT account_id, currency, SUM(amount) AS ledger_balance
  FROM public.ledger_entries
  GROUP BY account_id, currency
),
inv_sum AS (
  SELECT account_id, currency, SUM(remaining_amount) AS inventory_balance
  FROM public.inventory_lots
  WHERE status <> 'depleted'
  GROUP BY account_id, currency
)
SELECT
  a.id AS account_id,
  a.name AS account_name,
  a.account_type::text AS account_type,
  COALESCE(l.currency, i.currency, a.currency) AS currency,
  COALESCE(l.ledger_balance, 0)::numeric AS ledger_balance,
  COALESCE(i.inventory_balance, 0)::numeric AS inventory_balance,
  COALESCE(l.ledger_balance, 0) - COALESCE(i.inventory_balance, 0) AS diff,
  CASE
    WHEN a.account_type::text IN ('cash','toman_bank','aed_bank','foreign_currency','person_holding','customer_wallet','wallet')
      THEN ABS(COALESCE(l.ledger_balance,0) - COALESCE(i.inventory_balance,0)) > 0.001
    ELSE false
  END AS is_mismatch
FROM public.accounts a
LEFT JOIN ledger_sum l ON l.account_id = a.id
LEFT JOIN inv_sum i    ON i.account_id = a.id AND i.currency = l.currency
WHERE a.deleted_at IS NULL;

GRANT SELECT ON public.v_balance_reconciliation TO authenticated;

-- validate_close(deal_id)
CREATE OR REPLACE FUNCTION public.validate_close(_sell_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  s public.sell_transactions%ROWTYPE;
  paid NUMERIC := 0;
  has_payment_receipt BOOLEAN := false;
  has_delivery_proof BOOLEAN := false;
  items JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO s FROM public.sell_transactions WHERE id = _sell_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

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

  items := items || jsonb_build_array(
    jsonb_build_object('key','receiving_account','label','Receiving account selected',
                       'ok', s.received_into_account_id IS NOT NULL),
    jsonb_build_object('key','payment_full','label','Full payment received',
                       'ok', paid + 0.0001 >= s.received_amount,
                       'detail', paid || ' / ' || s.received_amount || ' ' || s.received_currency),
    jsonb_build_object('key','payment_receipt','label','Payment receipt uploaded',
                       'ok', has_payment_receipt),
    jsonb_build_object('key','currency_delivered','label','Currency delivery recorded',
                       'ok', COALESCE(s.currency_delivered, false)),
    jsonb_build_object('key','delivery_proof','label','Delivery proof uploaded',
                       'ok', has_delivery_proof)
  );

  RETURN jsonb_build_object(
    'found', true,
    'can_close', (SELECT bool_and((x->>'ok')::boolean) FROM jsonb_array_elements(items) x),
    'items', items,
    'paid', paid,
    'required', s.received_amount
  );
END $$;

GRANT EXECUTE ON FUNCTION public.validate_close(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_close(UUID) FROM PUBLIC, anon;

-- admin_force_close
CREATE OR REPLACE FUNCTION public.admin_force_close(_sell_id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required to force-close a deal';
  END IF;
  PERFORM public.set_edit_context('FORCE CLOSE: ' || _reason, NULL);
  PERFORM public.close_sell_deal(_sell_id, true, _reason);
  INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, reason)
  VALUES (auth.uid(), 'sell_transactions', _sell_id, 'force_close', _reason);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_force_close(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_force_close(UUID, TEXT) FROM PUBLIC, anon;

-- admin_reconcile
CREATE OR REPLACE FUNCTION public.admin_reconcile(_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE mismatch_count INT; snapshot JSONB;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required for reconciliation';
  END IF;

  SELECT count(*) INTO mismatch_count FROM public.v_balance_reconciliation WHERE is_mismatch;
  SELECT jsonb_agg(row_to_json(v)) INTO snapshot
    FROM public.v_balance_reconciliation v WHERE is_mismatch;

  INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, new_value, reason)
  VALUES (auth.uid(), 'reconciliation', gen_random_uuid(), 'reconcile',
          jsonb_build_object('mismatch_count', mismatch_count, 'snapshot', COALESCE(snapshot,'[]'::jsonb)),
          _reason);

  RETURN jsonb_build_object('mismatch_count', mismatch_count, 'snapshot', COALESCE(snapshot,'[]'::jsonb));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_reconcile(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reconcile(TEXT) FROM PUBLIC, anon;
