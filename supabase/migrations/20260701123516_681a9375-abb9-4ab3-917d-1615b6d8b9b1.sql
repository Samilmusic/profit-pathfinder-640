
CREATE TYPE public.settlement_status AS ENUM (
  'draft','awaiting_payment','payment_received','awaiting_delivery',
  'currency_delivered','awaiting_receipt','completed','cancelled'
);
CREATE TYPE public.doc_type AS ENUM (
  'payment_receipt','bank_transfer_screenshot','cash_delivery_receipt',
  'currency_handover_proof','whatsapp_confirmation','invoice',
  'expense_receipt','id_passport','other'
);
CREATE TYPE public.holder_type AS ENUM ('milad','ali','customer','other');

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS holder_type public.holder_type,
  ADD COLUMN IF NOT EXISTS holder_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS holder_person_name text;

ALTER TABLE public.buy_transactions
  ADD COLUMN IF NOT EXISTS settlement_status public.settlement_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS money_holder_type public.holder_type,
  ADD COLUMN IF NOT EXISTS currency_holder_type public.holder_type,
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE public.sell_transactions
  ADD COLUMN IF NOT EXISTS settlement_status public.settlement_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS money_holder_type public.holder_type,
  ADD COLUMN IF NOT EXISTS currency_holder_type public.holder_type,
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS settlement_status public.settlement_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS completion_note text;

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS settlement_status public.settlement_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS completion_note text;

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type public.doc_type NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  ref_type text NOT NULL,
  ref_id uuid,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_ref_idx ON public.documents(ref_type, ref_id);
CREATE INDEX documents_type_idx ON public.documents(doc_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read documents" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers insert documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers update documents" ON public.documents FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "writers delete documents" ON public.documents FOR DELETE TO authenticated USING (public.can_write(auth.uid()));

CREATE POLICY "auth read doc files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "writers upload doc files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents' AND public.can_write(auth.uid()));
CREATE POLICY "writers update doc files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'documents' AND public.can_write(auth.uid()));
CREATE POLICY "writers delete doc files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents' AND public.can_write(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_txn_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE money_docs int; delivery_docs int; ref text := TG_ARGV[0];
BEGIN
  IF NEW.settlement_status = 'completed' AND (TG_OP = 'INSERT' OR OLD.settlement_status IS DISTINCT FROM 'completed') THEN
    IF COALESCE(NEW.completion_note,'') = '' THEN
      RAISE EXCEPTION 'Completion note is required to mark % as completed', ref;
    END IF;
    SELECT count(*) INTO money_docs FROM public.documents
      WHERE ref_type = ref AND ref_id = NEW.id
        AND doc_type IN ('payment_receipt','bank_transfer_screenshot','cash_delivery_receipt','whatsapp_confirmation');
    SELECT count(*) INTO delivery_docs FROM public.documents
      WHERE ref_type = ref AND ref_id = NEW.id
        AND doc_type IN ('currency_handover_proof','cash_delivery_receipt','bank_transfer_screenshot');
    IF money_docs = 0 THEN RAISE EXCEPTION 'Cannot complete %: proof of payment/receipt is required', ref; END IF;
    IF delivery_docs = 0 THEN RAISE EXCEPTION 'Cannot complete %: proof of currency delivery is required', ref; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER buy_completion_gate BEFORE UPDATE OR INSERT ON public.buy_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_txn_completion('buy');
CREATE TRIGGER sell_completion_gate BEFORE UPDATE OR INSERT ON public.sell_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_txn_completion('sell');

CREATE OR REPLACE FUNCTION public.enforce_expense_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  IF NEW.settlement_status = 'completed' AND (TG_OP = 'INSERT' OR OLD.settlement_status IS DISTINCT FROM 'completed') THEN
    SELECT count(*) INTO n FROM public.documents WHERE ref_type='expense' AND ref_id=NEW.id
      AND doc_type IN ('expense_receipt','payment_receipt','bank_transfer_screenshot');
    IF n = 0 THEN RAISE EXCEPTION 'Cannot complete expense: receipt or payment proof is required'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER expense_completion_gate BEFORE UPDATE OR INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_completion();

CREATE OR REPLACE FUNCTION public.enforce_transfer_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  IF NEW.settlement_status = 'completed' AND (TG_OP = 'INSERT' OR OLD.settlement_status IS DISTINCT FROM 'completed') THEN
    SELECT count(*) INTO n FROM public.documents WHERE ref_type='transfer' AND ref_id=NEW.id
      AND doc_type IN ('bank_transfer_screenshot','cash_delivery_receipt','currency_handover_proof','payment_receipt');
    IF n = 0 THEN RAISE EXCEPTION 'Cannot complete transfer: transfer or handover proof is required'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER transfer_completion_gate BEFORE UPDATE OR INSERT ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_transfer_completion();

CREATE OR REPLACE FUNCTION public.create_customer_holding_accounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ccy text;
BEGIN
  FOREACH ccy IN ARRAY ARRAY['AED','IRR','USD'] LOOP
    INSERT INTO public.accounts (name, account_type, currency, owner, opening_balance, holder_type, holder_customer_id, is_active, notes)
    VALUES ('Held by ' || NEW.name || ' (' || ccy || ')', 'person_holding', ccy, 'other', 0, 'customer', NEW.id, true, 'Auto-created person-holding account');
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER customer_holding_accounts AFTER INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.create_customer_holding_accounts();

INSERT INTO public.accounts (name, account_type, currency, owner, opening_balance, holder_type, is_active, notes)
SELECT 'Held by Milad (' || c || ')', 'person_holding'::public.account_type, c, 'milad'::public.account_owner, 0, 'milad'::public.holder_type, true, 'System person-holding'
FROM unnest(ARRAY['AED','IRR','USD']) c
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.holder_type='milad' AND a.currency=c AND a.account_type='person_holding');

INSERT INTO public.accounts (name, account_type, currency, owner, opening_balance, holder_type, is_active, notes)
SELECT 'Held by Ali (' || c || ')', 'person_holding'::public.account_type, c, 'ali'::public.account_owner, 0, 'ali'::public.holder_type, true, 'System person-holding'
FROM unnest(ARRAY['AED','IRR','USD']) c
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.holder_type='ali' AND a.currency=c AND a.account_type='person_holding');

INSERT INTO public.accounts (name, account_type, currency, owner, opening_balance, holder_type, holder_customer_id, is_active, notes)
SELECT 'Held by ' || cu.name || ' (' || c || ')', 'person_holding'::public.account_type, c, 'other'::public.account_owner, 0, 'customer'::public.holder_type, cu.id, true, 'Auto-created (backfill)'
FROM public.customers cu CROSS JOIN unnest(ARRAY['AED','IRR','USD']) c
WHERE cu.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.holder_customer_id=cu.id AND a.currency=c AND a.account_type='person_holding');
