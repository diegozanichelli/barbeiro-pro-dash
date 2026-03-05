
-- Table: client_purchase_history
CREATE TABLE public.client_purchase_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  mobile_phone text NOT NULL,
  item_name text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('service','product','subscription')),
  amount numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cph_org_phone_date ON public.client_purchase_history (organization_id, mobile_phone, purchased_at DESC);
CREATE INDEX idx_cph_org_name_date ON public.client_purchase_history (organization_id, lower(btrim(client_name)), purchased_at DESC);

-- RLS
ALTER TABLE public.client_purchase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage purchase history in their organization"
ON public.client_purchase_history
FOR ALL
TO authenticated
USING (
  (organization_id = get_user_organization(auth.uid()))
  AND has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  (organization_id = get_user_organization(auth.uid()))
  AND has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Super admins can manage all purchase history"
ON public.client_purchase_history
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Barbers can insert purchase history in their organization"
ON public.client_purchase_history
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
);

CREATE POLICY "Barbers can view purchase history in their organization"
ON public.client_purchase_history
FOR SELECT
TO authenticated
USING (
  organization_id = get_user_organization(auth.uid())
);
