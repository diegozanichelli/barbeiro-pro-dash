CREATE TABLE IF NOT EXISTS public.client_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  mobile_phone TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('service', 'product', 'subscription')),
  amount NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cph_org_phone_date_idx
  ON public.client_purchase_history (organization_id, mobile_phone, purchased_at DESC);

CREATE INDEX IF NOT EXISTS cph_org_name_date_idx
  ON public.client_purchase_history (organization_id, lower(btrim(client_name)), purchased_at DESC);

ALTER TABLE public.client_purchase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage purchase history in organization"
ON public.client_purchase_history
FOR ALL
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Super admins can manage all purchase history"
ON public.client_purchase_history
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
