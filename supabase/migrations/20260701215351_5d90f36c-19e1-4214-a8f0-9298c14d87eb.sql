
CREATE TABLE IF NOT EXISTS public.doc_counters (
  prefix text NOT NULL,
  year int NOT NULL,
  next_val bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (prefix, year)
);
GRANT SELECT ON public.doc_counters TO authenticated;
GRANT ALL ON public.doc_counters TO service_role;
ALTER TABLE public.doc_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "counters read authenticated" ON public.doc_counters;
CREATE POLICY "counters read authenticated" ON public.doc_counters FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_doc_no(_prefix text, _year int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO public.doc_counters (prefix, year, next_val) VALUES (_prefix, _year, 1)
  ON CONFLICT (prefix, year) DO UPDATE SET next_val = public.doc_counters.next_val + 1
  RETURNING next_val INTO v;
  RETURN _prefix || '-' || _year::text || '-' || lpad(v::text, 6, '0');
END $$;
REVOKE ALL ON FUNCTION public.next_doc_no(text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_doc_no(text,int) TO authenticated, service_role;

ALTER TABLE public.sell_transactions   ADD COLUMN IF NOT EXISTS doc_no text UNIQUE;
ALTER TABLE public.buy_transactions    ADD COLUMN IF NOT EXISTS doc_no text UNIQUE;
ALTER TABLE public.brought_in_money    ADD COLUMN IF NOT EXISTS doc_no text UNIQUE;
ALTER TABLE public.expenses            ADD COLUMN IF NOT EXISTS doc_no text UNIQUE;

CREATE OR REPLACE FUNCTION public.trg_assign_doc_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text := TG_ARGV[0]; y int;
BEGIN
  IF NEW.doc_no IS NOT NULL AND NEW.doc_no <> '' THEN RETURN NEW; END IF;
  y := EXTRACT(YEAR FROM COALESCE(NEW.entry_date, CURRENT_DATE));
  NEW.doc_no := public.next_doc_no(p, y);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assign_doc_no_sell ON public.sell_transactions;
CREATE TRIGGER assign_doc_no_sell BEFORE INSERT ON public.sell_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_assign_doc_no('SELL');
DROP TRIGGER IF EXISTS assign_doc_no_buy ON public.buy_transactions;
CREATE TRIGGER assign_doc_no_buy BEFORE INSERT ON public.buy_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_assign_doc_no('BUY');
DROP TRIGGER IF EXISTS assign_doc_no_br ON public.brought_in_money;
CREATE TRIGGER assign_doc_no_br BEFORE INSERT ON public.brought_in_money
  FOR EACH ROW EXECUTE FUNCTION public.trg_assign_doc_no('BR');
DROP TRIGGER IF EXISTS assign_doc_no_exp ON public.expenses;
CREATE TRIGGER assign_doc_no_exp BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.trg_assign_doc_no('EXP');

-- Backfill with user triggers disabled to avoid re-firing ledger/inventory logic
ALTER TABLE public.sell_transactions DISABLE TRIGGER USER;
ALTER TABLE public.buy_transactions DISABLE TRIGGER USER;
ALTER TABLE public.brought_in_money DISABLE TRIGGER USER;
ALTER TABLE public.expenses DISABLE TRIGGER USER;

DO $$
DECLARE r RECORD; y int; v text;
BEGIN
  FOR r IN SELECT id, entry_date FROM public.sell_transactions WHERE doc_no IS NULL ORDER BY entry_date, created_at LOOP
    y := EXTRACT(YEAR FROM r.entry_date); v := public.next_doc_no('SELL', y);
    UPDATE public.sell_transactions SET doc_no = v WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, entry_date FROM public.buy_transactions WHERE doc_no IS NULL ORDER BY entry_date, created_at LOOP
    y := EXTRACT(YEAR FROM r.entry_date); v := public.next_doc_no('BUY', y);
    UPDATE public.buy_transactions SET doc_no = v WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, entry_date FROM public.brought_in_money WHERE doc_no IS NULL ORDER BY entry_date, created_at LOOP
    y := EXTRACT(YEAR FROM r.entry_date); v := public.next_doc_no('BR', y);
    UPDATE public.brought_in_money SET doc_no = v WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, entry_date FROM public.expenses WHERE doc_no IS NULL ORDER BY entry_date, created_at LOOP
    y := EXTRACT(YEAR FROM r.entry_date); v := public.next_doc_no('EXP', y);
    UPDATE public.expenses SET doc_no = v WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.sell_transactions ENABLE TRIGGER USER;
ALTER TABLE public.buy_transactions ENABLE TRIGGER USER;
ALTER TABLE public.brought_in_money ENABLE TRIGGER USER;
ALTER TABLE public.expenses ENABLE TRIGGER USER;
