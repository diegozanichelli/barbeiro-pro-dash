-- Criar tabela para armazenar nomes customizados dos rankings
CREATE TABLE public.ranking_custom_names (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  ranking_key TEXT NOT NULL,
  custom_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, ranking_key)
);

-- Enable Row Level Security
ALTER TABLE public.ranking_custom_names ENABLE ROW LEVEL SECURITY;

-- Managers can view custom names in their organization
CREATE POLICY "Managers can view custom names in their organization"
ON public.ranking_custom_names
FOR SELECT
USING (organization_id = get_user_organization(auth.uid()));

-- Managers can manage custom names in their organization
CREATE POLICY "Managers can manage custom names in their organization"
ON public.ranking_custom_names
FOR ALL
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND has_role(auth.uid(), 'manager'::app_role)
);

-- Super admins can manage all custom names
CREATE POLICY "Super admins can manage all custom names"
ON public.ranking_custom_names
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ranking_custom_names_updated_at
BEFORE UPDATE ON public.ranking_custom_names
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();