
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_brought_in_ledger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_buy_ledger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sell_calc_and_ledger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sell_ledger_after() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_expense_ledger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_transfer_ledger() FROM authenticated;
