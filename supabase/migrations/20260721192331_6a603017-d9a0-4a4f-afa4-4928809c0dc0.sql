ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;