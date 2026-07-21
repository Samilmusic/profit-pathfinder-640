
CREATE OR REPLACE FUNCTION public.receive_linked_buy(
  _buy_id uuid,
  _received_into_account_id uuid,
  _bought_amount numeric DEFAULT NULL,
  _bought_currency text DEFAULT NULL,
  _delivered_at timestamptz DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.can_write(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _received_into_account_id IS NULL THEN
    RAISE EXCEPTION 'Received-into account is required';
  END IF;

  UPDATE public.buy_transactions
     SET received_into_account_id = _received_into_account_id,
         bought_amount = COALESCE(NULLIF(_bought_amount, 0), bought_amount),
         bought_currency = COALESCE(NULLIF(_bought_currency, ''), bought_currency),
         supplier_delivered = true,
         supplier_delivered_at = COALESCE(_delivered_at, supplier_delivered_at, now()),
         supplier_delivery_note = COALESCE(_note, supplier_delivery_note),
         entry_date = COALESCE(_delivered_at::date, entry_date),
         updated_at = now()
   WHERE id = _buy_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.receive_linked_buy(uuid, uuid, numeric, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_linked_buy(uuid, uuid, numeric, text, timestamptz, text) TO authenticated;
