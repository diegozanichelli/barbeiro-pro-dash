CREATE TABLE IF NOT EXISTS public.organization_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, date)
);

ALTER TABLE public.organization_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage holidays from own organization"
ON public.organization_holidays
FOR ALL
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND organization_id = get_user_organization(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND organization_id = get_user_organization(auth.uid())
);

CREATE POLICY "Super admins can manage all holidays"
ON public.organization_holidays
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_organization_holidays_updated_at
BEFORE UPDATE ON public.organization_holidays
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
