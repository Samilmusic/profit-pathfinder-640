ALTER TABLE public.customer_bank_accounts
  ADD COLUMN IF NOT EXISTS account_type TEXT;