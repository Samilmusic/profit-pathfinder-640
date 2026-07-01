
-- 1) cancel_reason columns
ALTER TABLE public.customer_deposits ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.buy_transactions ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.sell_transactions ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.brought_in_money ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.trade_cycles ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) add device column to audit_events
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS device text;

-- 3) helper: set edit context for current transaction (reason + device)
CREATE OR REPLACE FUNCTION public.set_edit_context(_reason text, _device text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.edit_reason', COALESCE(_reason,''), true);
  PERFORM set_config('app.edit_device', COALESCE(_device,''), true);
END $$;

GRANT EXECUTE ON FUNCTION public.set_edit_context(text, text) TO authenticated;

-- 4) update audit trigger to capture reason + device
CREATE OR REPLACE FUNCTION public.trg_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  v_reason text;
  v_device text;
BEGIN
  actor := auth.uid();
  v_reason := NULLIF(current_setting('app.edit_reason', true), '');
  v_device := NULLIF(current_setting('app.edit_device', true), '');
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, new_value, reason, device)
    VALUES (actor, TG_TABLE_NAME, NEW.id, 'insert', to_jsonb(NEW), v_reason, v_device);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, old_value, new_value, reason, device)
      VALUES (actor, TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), v_reason, v_device);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_events(actor_id, entity_type, entity_id, action, old_value, reason, device)
    VALUES (actor, TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), v_reason, v_device);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

-- 5) safe cancel (soft-delete) helper
CREATE OR REPLACE FUNCTION public.cancel_record(_table text, _id uuid, _reason text, _device text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required to cancel a record';
  END IF;
  IF NOT public.can_write(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _table NOT IN ('customer_deposits','buy_transactions','sell_transactions','transfers','expenses','brought_in_money','trade_cycles','payment_orders','customers','accounts') THEN
    RAISE EXCEPTION 'Table % not cancellable', _table;
  END IF;
  PERFORM public.set_edit_context(_reason, _device);
  EXECUTE format('UPDATE public.%I SET deleted_at = now(), cancel_reason = $1 WHERE id = $2 AND deleted_at IS NULL', _table)
    USING _reason, _id;
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_record(text, uuid, text, text) TO authenticated;
