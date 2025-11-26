-- Correção de Prioridade Máxima: Isolamento Crítico e Integridade Numérica
-- Passo 1: Corrigir dados NULL antes de aplicar constraints

-- 1. CORREÇÃO DE DADOS: Preencher organization_id NULL com base no barbeiro

-- Atualizar barbers com organization_id NULL (buscar da tabela user_roles)
UPDATE public.barbers b
SET organization_id = ur.organization_id
FROM public.user_roles ur
WHERE b.user_id = ur.user_id
  AND b.organization_id IS NULL
  AND ur.organization_id IS NOT NULL;

-- Atualizar units com organization_id NULL (se houver alguma lógica, caso contrário precisaria de intervenção manual)
-- Por ora, vamos deixar units como está pois provavelmente não há NULL

-- Atualizar monthly_goals com organization_id NULL (buscar do barbeiro)
UPDATE public.monthly_goals mg
SET organization_id = b.organization_id
FROM public.barbers b
WHERE mg.barber_id = b.id
  AND mg.organization_id IS NULL
  AND b.organization_id IS NOT NULL;

-- Atualizar daily_productions com organization_id NULL (buscar do barbeiro)
UPDATE public.daily_productions dp
SET organization_id = b.organization_id
FROM public.barbers b
WHERE dp.barber_id = b.id
  AND dp.organization_id IS NULL
  AND b.organization_id IS NOT NULL;

-- 2. ISOLAMENTO CRÍTICO: Tornar organization_id OBRIGATÓRIO (NOT NULL)

-- Tabela: barbers
ALTER TABLE public.barbers 
ALTER COLUMN organization_id SET NOT NULL;

-- Tabela: units
ALTER TABLE public.units 
ALTER COLUMN organization_id SET NOT NULL;

-- Tabela: monthly_goals
ALTER TABLE public.monthly_goals 
ALTER COLUMN organization_id SET NOT NULL;

-- Tabela: daily_productions
ALTER TABLE public.daily_productions 
ALTER COLUMN organization_id SET NOT NULL;

-- 3. INTEGRIDADE NUMÉRICA: Restrições CHECK para comissões (0 a 100)

-- Tabela barbers: validar services_commission
ALTER TABLE public.barbers 
ADD CONSTRAINT services_commission_range 
CHECK (services_commission >= 0 AND services_commission <= 100);

-- Tabela barbers: validar products_commission
ALTER TABLE public.barbers 
ADD CONSTRAINT products_commission_range 
CHECK (products_commission >= 0 AND products_commission <= 100);

-- Comentários para documentação
COMMENT ON CONSTRAINT services_commission_range ON public.barbers IS 
'Garante que a comissão de serviços esteja entre 0% e 100%';

COMMENT ON CONSTRAINT products_commission_range ON public.barbers IS 
'Garante que a comissão de produtos esteja entre 0% e 100%';