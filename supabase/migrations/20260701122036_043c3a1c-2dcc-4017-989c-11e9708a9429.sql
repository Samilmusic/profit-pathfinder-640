
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_write(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.avg_buy_rate(text, text, date) FROM authenticated;
