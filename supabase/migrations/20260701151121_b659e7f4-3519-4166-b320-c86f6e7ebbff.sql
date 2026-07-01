
-- Add new account_type values for pending delivery and generic other
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'pending_delivery';
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'other';

-- Extend sell/buy completion enforcement so a sell cannot be marked completed
-- without both a source (sold_from) and a destination (received_into) account.
CREATE OR REPLACE FUNCTION public.enforce_txn_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE money_docs int; delivery_docs int; ref text := TG_ARGV[0];
BEGIN
  IF NEW.settlement_status = 'completed' AND (TG_OP = 'INSERT' OR OLD.settlement_status IS DISTINCT FROM 'completed') THEN
    IF COALESCE(NEW.completion_note,'') = '' THEN
      RAISE EXCEPTION 'Completion note is required to mark % as completed', ref;
    END IF;
    IF ref = 'sell' THEN
      IF NEW.sold_from_account_id IS NULL THEN
        RAISE EXCEPTION 'Cannot complete sell: source (sold-from) account is required';
      END IF;
      IF NEW.received_into_account_id IS NULL THEN
        RAISE EXCEPTION 'Cannot complete sell: destination (received-into) account is required so the received currency lands in a real balance';
      END IF;
    ELSIF ref = 'buy' THEN
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
END; $function$;

-- View: current balances grouped by currency + account type for the dashboard
CREATE OR REPLACE VIEW public.v_balances_by_currency_type AS
SELECT
  a.currency,
  a.account_type::text AS account_type,
  COUNT(*)::int AS account_count,
  COALESCE(SUM(b.current_balance), 0) AS total_balance
FROM public.accounts a
LEFT JOIN public.account_balances b ON b.account_id = a.id
WHERE a.deleted_at IS NULL AND a.is_active = true
GROUP BY a.currency, a.account_type
ORDER BY a.currency, a.account_type;

GRANT SELECT ON public.v_balances_by_currency_type TO authenticated;
