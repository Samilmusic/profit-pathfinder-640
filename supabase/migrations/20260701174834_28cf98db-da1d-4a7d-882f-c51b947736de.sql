
ALTER FUNCTION public.has_role(uuid, app_role) SECURITY INVOKER;
ALTER FUNCTION public.is_admin(uuid) SECURITY INVOKER;
ALTER FUNCTION public.can_write(uuid) SECURITY INVOKER;
ALTER FUNCTION public.set_edit_context(text, text) SECURITY INVOKER;
ALTER FUNCTION public.cancel_record(text, uuid, text, text) SECURITY INVOKER;
