
REVOKE ALL ON FUNCTION public.trg_sell_payment_ledger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_sell_payment_recompute() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_sell_doc_recompute() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_sell_deal_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_sell_ledger_after() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_sell_cycle_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_txn_completion() FROM PUBLIC, anon, authenticated;
