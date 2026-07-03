
-- 1. Stop auto-creating customer wallets / customer person-holding accounts
DROP TRIGGER IF EXISTS trg_customer_wallets ON public.customers;
DROP TRIGGER IF EXISTS customer_holding_accounts ON public.customers;

-- Keep the functions in place (for possible future opt-in) but they no longer fire.

-- 2. Archive customer wallets & customer person-holding accounts that have never
--    been used (no ledger entries). Anything with real history is left untouched
--    so financial books are preserved.
UPDATE public.accounts a
   SET deleted_at = now(),
       is_active  = false,
       notes      = COALESCE(notes,'') || E'\n[archived by phase-1 cleanup]'
 WHERE a.deleted_at IS NULL
   AND (
        a.account_type = 'customer_wallet'
     OR (a.account_type = 'person_holding' AND a.holder_type = 'customer')
   )
   AND NOT EXISTS (SELECT 1 FROM public.ledger_entries l WHERE l.account_id = a.id);

-- 3. Archive Milad person-holding accounts and Ali USD holding (phase-1 keeps only
--    Ali Cash Box AED, Held by Ali AED, Held by Ali IRR).
UPDATE public.accounts a
   SET deleted_at = now(),
       is_active  = false,
       notes      = COALESCE(notes,'') || E'\n[archived by phase-1 cleanup]'
 WHERE a.deleted_at IS NULL
   AND a.account_type = 'person_holding'
   AND (
        a.owner = 'milad'
     OR (a.owner = 'ali' AND a.currency = 'USD')
   )
   AND NOT EXISTS (SELECT 1 FROM public.ledger_entries l WHERE l.account_id = a.id);
