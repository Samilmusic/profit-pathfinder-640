
REVOKE EXECUTE ON FUNCTION public.next_doc_no(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_doc_no(text, int) TO service_role;
REVOKE EXECUTE ON FUNCTION public.trg_assign_doc_no() FROM PUBLIC, anon, authenticated;
