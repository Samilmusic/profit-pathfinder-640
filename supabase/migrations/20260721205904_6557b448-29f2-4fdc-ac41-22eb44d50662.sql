DELETE FROM public.user_roles
WHERE user_id='b2cefafd-ff36-4412-8941-18070a0112e0' AND role='admin';

INSERT INTO public.audit_logs (actor, action, table_name, record_id, details)
VALUES (
  'b2cefafd-ff36-4412-8941-18070a0112e0',
  'role_revoke_temporary',
  'user_roles',
  'b2cefafd-ff36-4412-8941-18070a0112e0',
  jsonb_build_object(
    'role','admin','reason','Phase C QA reconciliation complete',
    'partner_role_preserved',true,'reconcile_result','all 15 checks PASS'
  )
);