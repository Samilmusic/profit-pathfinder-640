
-- 1. Lock down audit_events
DROP POLICY IF EXISTS "auth read audit" ON public.audit_events;
DROP POLICY IF EXISTS "admin read audit events" ON public.audit_events;
CREATE POLICY "admin read audit events" ON public.audit_events
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 2. Restrict profiles reads (email exposure)
DROP POLICY IF EXISTS "auth read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles read own" ON public.profiles;
CREATE POLICY "profiles read own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- 3. Stop auto-granting 'viewer' to new sign-ups (first user still becomes admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  -- Other users get NO role and therefore no data access until an admin promotes them.
  RETURN NEW;
END;
$function$;

-- 4. Revoke broad EXECUTE on SECURITY DEFINER functions
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;

-- Re-grant only the functions the client (or RLS) needs
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_edit_context(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_record(text, uuid, text, text) TO authenticated;

-- 5. Force security_invoker on remaining views
ALTER VIEW public.inventory_lots_view SET (security_invoker = on);
ALTER VIEW public.profit_by_lot SET (security_invoker = on);
ALTER VIEW public.remaining_by_cost_rate SET (security_invoker = on);
ALTER VIEW public.profit_by_account SET (security_invoker = on);
ALTER VIEW public.v_balances_by_currency_type SET (security_invoker = on);
ALTER VIEW public.profit_by_source SET (security_invoker = on);
ALTER VIEW public.sale_allocations_view SET (security_invoker = on);
ALTER VIEW public.v_open_cycles SET (security_invoker = on);
