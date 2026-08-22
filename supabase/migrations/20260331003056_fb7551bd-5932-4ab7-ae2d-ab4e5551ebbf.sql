
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  barber_id uuid REFERENCES public.barbers(id) ON DELETE CASCADE NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barbers can manage their own subscriptions"
ON public.push_subscriptions FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Managers can view subscriptions in their organization"
ON public.push_subscriptions FOR SELECT
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Super admins can manage all subscriptions"
ON public.push_subscriptions FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
