CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  mobile_phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clients_name_min_length CHECK (char_length(btrim(name)) >= 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_org_phone_unique
  ON public.clients (organization_id, mobile_phone);

CREATE UNIQUE INDEX IF NOT EXISTS clients_org_normalized_name_unique
  ON public.clients (organization_id, normalized_name);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage clients in organization"
ON public.clients
FOR ALL
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Super admins can manage all clients"
ON public.clients
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
