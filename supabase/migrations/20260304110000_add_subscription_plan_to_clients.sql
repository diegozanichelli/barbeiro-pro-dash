ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS subscription_plan_id UUID NULL REFERENCES public.subscription_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_subscription_plan_idx
  ON public.clients (subscription_plan_id);
