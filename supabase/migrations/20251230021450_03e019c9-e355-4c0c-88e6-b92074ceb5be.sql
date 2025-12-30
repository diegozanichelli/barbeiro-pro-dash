-- Adicionar coluna has_subscription_module na tabela organizations
ALTER TABLE public.organizations 
ADD COLUMN has_subscription_module boolean NOT NULL DEFAULT false;

-- Criar tabela barber_subscription_earnings para armazenar ganhos de assinatura
CREATE TABLE public.barber_subscription_earnings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2020),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(barber_id, month, year)
);

-- Habilitar RLS
ALTER TABLE public.barber_subscription_earnings ENABLE ROW LEVEL SECURITY;

-- Política: Managers podem gerenciar ganhos de assinatura na sua organização
CREATE POLICY "Managers can manage subscription earnings in their organization"
ON public.barber_subscription_earnings
FOR ALL
USING (
  (organization_id = get_user_organization(auth.uid())) 
  AND has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  (organization_id = get_user_organization(auth.uid())) 
  AND has_role(auth.uid(), 'manager'::app_role)
);

-- Política: Barbeiros podem ver seus próprios ganhos de assinatura
CREATE POLICY "Barbers can view their own subscription earnings"
ON public.barber_subscription_earnings
FOR SELECT
USING (
  barber_id IN (
    SELECT id FROM public.barbers 
    WHERE user_id = auth.uid() 
    AND organization_id = get_user_organization(auth.uid())
  )
);

-- Política: Super admins podem gerenciar todos os ganhos de assinatura
CREATE POLICY "Super admins can manage all subscription earnings"
ON public.barber_subscription_earnings
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_barber_subscription_earnings_updated_at
BEFORE UPDATE ON public.barber_subscription_earnings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();