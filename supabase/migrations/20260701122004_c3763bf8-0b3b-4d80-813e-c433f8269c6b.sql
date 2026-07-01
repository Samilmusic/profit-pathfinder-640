
ALTER VIEW public.account_balances SET (security_invoker = on);
ALTER VIEW public.currency_inventory SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_brought_in_ledger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_buy_ledger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_sell_calc_and_ledger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_sell_ledger_after() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_expense_ledger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_transfer_ledger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.avg_buy_rate(text, text, date) FROM PUBLIC, anon;
