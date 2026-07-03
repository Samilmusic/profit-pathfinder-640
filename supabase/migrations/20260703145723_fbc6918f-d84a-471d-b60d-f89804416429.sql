
-- 1. Drop overly permissive profiles SELECT policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- 2. Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.admin_recalculate_balances() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_sell_received_lot(uuid) FROM PUBLIC, anon, authenticated;

-- Grant admin_recalculate_balances back to authenticated (admin check happens inside the function via has_role/is_admin)
-- Actually keep it revoked; expose via a wrapper only if needed. Admins call via service_role from server function.
GRANT EXECUTE ON FUNCTION public.admin_recalculate_balances() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_sell_received_lot(uuid) TO service_role;
