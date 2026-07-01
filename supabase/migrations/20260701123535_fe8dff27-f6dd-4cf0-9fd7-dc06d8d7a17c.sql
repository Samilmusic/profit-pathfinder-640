
REVOKE EXECUTE ON FUNCTION public.enforce_txn_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_expense_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_transfer_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_customer_holding_accounts() FROM PUBLIC, anon, authenticated;
