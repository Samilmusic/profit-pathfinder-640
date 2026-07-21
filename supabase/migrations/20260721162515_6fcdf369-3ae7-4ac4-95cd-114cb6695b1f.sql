
ALTER TABLE public.remittances
  ADD COLUMN IF NOT EXISTS fx_purchase_rate numeric,
  ADD COLUMN IF NOT EXISTS fx_supplier_customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS fx_supplier_name text,
  ADD COLUMN IF NOT EXISTS fx_purchased_amount numeric,
  ADD COLUMN IF NOT EXISTS fx_trading_profit_pay_ccy numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fx_trading_profit_aed numeric NOT NULL DEFAULT 0;

ALTER TABLE public.remittances
  ADD COLUMN IF NOT EXISTS total_profit_pay_ccy numeric
    GENERATED ALWAYS AS (COALESCE(gross_commission_pay_ccy,0) + COALESCE(fx_trading_profit_pay_ccy,0)) STORED,
  ADD COLUMN IF NOT EXISTS total_profit_aed numeric
    GENERATED ALWAYS AS (COALESCE(net_commission_aed,0) + COALESCE(fx_trading_profit_aed,0)) STORED;
