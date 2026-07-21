
ALTER VIEW public.v_operator_labels        SET (security_invoker = true);
ALTER VIEW public.v_remittance_lifecycle   SET (security_invoker = true);
ALTER VIEW public.v_profit_events_multi    SET (security_invoker = true);

REVOKE ALL ON FUNCTION public.report_customer_list(text,date,date,text,text,int,int)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_customer_detail(uuid,text,date,date)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_supplier_list(text,date,date,text,text,int,int)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_supplier_detail(uuid,text,date,date)              FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.report_customer_list(text,date,date,text,text,int,int)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_customer_detail(uuid,text,date,date)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_supplier_list(text,date,date,text,text,int,int)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_supplier_detail(uuid,text,date,date)              TO authenticated;
