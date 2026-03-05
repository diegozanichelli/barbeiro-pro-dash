CREATE TABLE IF NOT EXISTS public.subscription_plan_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  catalog_service_id UUID NOT NULL REFERENCES public.catalog_services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plan_services_unique UNIQUE (subscription_plan_id, catalog_service_id)
);

CREATE INDEX IF NOT EXISTS subscription_plan_services_org_idx
  ON public.subscription_plan_services (organization_id);

CREATE INDEX IF NOT EXISTS subscription_plan_services_plan_idx
  ON public.subscription_plan_services (subscription_plan_id);

ALTER TABLE public.subscription_plan_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage subscription plan services in organization"
ON public.subscription_plan_services
FOR ALL
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Super admins can manage all subscription plan services"
ON public.subscription_plan_services
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
