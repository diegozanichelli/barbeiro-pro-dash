ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS subscription_started_at date,
  ADD COLUMN IF NOT EXISTS subscription_unit_id uuid,
  ADD COLUMN IF NOT EXISTS migrated_from_legacy boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_subscription_unit ON public.clients(subscription_unit_id) WHERE subscription_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_migrated_legacy ON public.clients(organization_id) WHERE migrated_from_legacy = true;