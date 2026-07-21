
CREATE OR REPLACE FUNCTION public.assert_posting_active(_class public.posting_class)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _class = 'shadow' THEN
    RAISE EXCEPTION 'Refusing to post: allocation is in shadow classification';
  END IF;
END $$;
