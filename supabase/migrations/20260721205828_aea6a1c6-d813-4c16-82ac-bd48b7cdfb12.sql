INSERT INTO public.user_roles (user_id, role)
VALUES ('b2cefafd-ff36-4412-8941-18070a0112e0','admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.audit_logs (actor, action, table_name, record_id, details)
VALUES (
  'b2cefafd-ff36-4412-8941-18070a0112e0',
  'role_grant_temporary',
  'user_roles',
  'b2cefafd-ff36-4412-8941-18070a0112e0',
  jsonb_build_object(
    'role','admin','reason','Phase C QA — run remittance_v2_reconcile()',
    'granted_by','Phase C QA automation','partner_role_preserved',true
  )
);