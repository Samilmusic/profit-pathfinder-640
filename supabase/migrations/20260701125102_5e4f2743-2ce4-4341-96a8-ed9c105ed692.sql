
ALTER VIEW public.customer_wallet_balances SET (security_invoker = true);
ALTER VIEW public.company_vs_customer_funds SET (security_invoker = true);
ALTER VIEW public.service_charge_daily SET (security_invoker = true);
