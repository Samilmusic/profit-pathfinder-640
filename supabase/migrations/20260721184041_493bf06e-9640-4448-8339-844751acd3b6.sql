
REVOKE ALL ON FUNCTION public.report_meta(text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_executive_kpis()    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_operational_kpis()  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_meta(text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_executive_kpis()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_operational_kpis() TO authenticated;
