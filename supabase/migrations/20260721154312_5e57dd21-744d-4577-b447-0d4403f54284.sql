
-- Convert trigger to SECURITY INVOKER (only assigns deal_code via next_doc_no)
ALTER FUNCTION public.trg_trade_cycle_deal_code() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.trg_trade_cycle_deal_code() FROM PUBLIC, anon, authenticated;

-- validate_close only reads tables that authenticated already has RLS access to
ALTER FUNCTION public.validate_close(uuid) SECURITY INVOKER;

-- Revoke direct access to admin-only functions; they will be called via server functions using service_role
REVOKE EXECUTE ON FUNCTION public.admin_force_close(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reconcile(text) FROM PUBLIC, anon, authenticated;
