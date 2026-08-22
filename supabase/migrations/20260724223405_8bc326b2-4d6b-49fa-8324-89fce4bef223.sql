ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS access_expires_at date,
  ADD COLUMN IF NOT EXISTS auto_deactivate boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_organizations_auto_deactivate_expiry
  ON public.organizations (access_expires_at)
  WHERE auto_deactivate = true;