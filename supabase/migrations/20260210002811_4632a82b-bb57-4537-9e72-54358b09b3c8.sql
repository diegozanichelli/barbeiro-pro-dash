
-- 1. Nova tabela subscription_plans
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- RLS: Gestores CRUD
CREATE POLICY "Managers can manage subscription plans"
ON public.subscription_plans FOR ALL
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role));

-- RLS: Barbeiros SELECT
CREATE POLICY "Barbers can view subscription plans"
ON public.subscription_plans FOR SELECT
USING (organization_id = get_user_organization(auth.uid()));

-- RLS: Super admins
CREATE POLICY "Super admins can manage all subscription plans"
ON public.subscription_plans FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Novas colunas em sale_transactions
ALTER TABLE public.sale_transactions
  ADD COLUMN subscription_plan_id uuid REFERENCES subscription_plans(id),
  ADD COLUMN subscription_action text,
  ADD COLUMN downgrade_reason text;
