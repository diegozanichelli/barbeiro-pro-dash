
-- Create organization_holidays table
CREATE TABLE IF NOT EXISTS public.organization_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, date)
);

-- Enable RLS
ALTER TABLE public.organization_holidays ENABLE ROW LEVEL SECURITY;

-- Managers can view holidays in their organization
CREATE POLICY "Managers can view organization holidays"
ON public.organization_holidays
FOR SELECT
USING (organization_id = get_user_organization(auth.uid()));

-- Managers can manage holidays in their organization
CREATE POLICY "Managers can manage organization holidays"
ON public.organization_holidays
FOR ALL
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
);

-- Super admins can manage all holidays
CREATE POLICY "Super admins can manage all holidays"
ON public.organization_holidays
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_organization_holidays_updated_at
BEFORE UPDATE ON public.organization_holidays
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
