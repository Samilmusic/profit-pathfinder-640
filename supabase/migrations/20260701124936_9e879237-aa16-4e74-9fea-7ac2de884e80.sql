
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'customer_wallet';
ALTER TYPE public.ledger_ref_type ADD VALUE IF NOT EXISTS 'deposit';
ALTER TYPE public.ledger_ref_type ADD VALUE IF NOT EXISTS 'payment_order';
ALTER TYPE public.ledger_ref_type ADD VALUE IF NOT EXISTS 'service_charge';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'deposit_receipt';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'payment_order_proof';

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('bank_transfer','cash_delivery','currency_delivery','internal','international','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fee_kind AS ENUM ('fixed','percent','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
