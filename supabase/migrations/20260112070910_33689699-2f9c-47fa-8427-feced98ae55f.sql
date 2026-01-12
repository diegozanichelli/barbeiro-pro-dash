-- 1. Adicionar campo de mapeamento na tabela units
ALTER TABLE public.units
ADD COLUMN external_unit_id TEXT;

COMMENT ON COLUMN public.units.external_unit_id IS 
  'ID da unidade no sistema Meu Gerente 2.0 para integração';

-- 2. Criar tabela financeiro_integracao
CREATE TABLE public.financeiro_integracao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referência interna (Performance Barber)
  daily_production_id UUID NOT NULL REFERENCES public.daily_productions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Dados para integração externa (Meu Gerente 2.0)
  unit_id TEXT NOT NULL,
  valor_venda NUMERIC NOT NULL DEFAULT 0,
  valor_comissao NUMERIC NOT NULL DEFAULT 0,
  data_venda DATE NOT NULL,
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Evitar duplicatas
  UNIQUE(daily_production_id)
);

-- 3. Habilitar RLS
ALTER TABLE public.financeiro_integracao ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de segurança
CREATE POLICY "Managers can view integration data"
ON public.financeiro_integracao
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Super admins can manage all integration data"
ON public.financeiro_integracao
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 5. Trigger para atualizar updated_at
CREATE TRIGGER update_financeiro_integracao_updated_at
BEFORE UPDATE ON public.financeiro_integracao
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Função de sincronização automática
CREATE OR REPLACE FUNCTION public.sync_financeiro_integracao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_external_unit_id TEXT;
  v_valor_venda NUMERIC;
BEGIN
  -- Buscar o external_unit_id da unidade do barbeiro
  SELECT u.external_unit_id INTO v_external_unit_id
  FROM barbers b
  JOIN units u ON b.unit_id = u.id
  WHERE b.id = NEW.barber_id;
  
  -- Se não houver mapeamento, não sincroniza
  IF v_external_unit_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Calcular valor total da venda (retrocompatível)
  IF (NEW.services_basic_total IS NOT NULL) OR (NEW.services_extra_total IS NOT NULL) THEN
    v_valor_venda := COALESCE(NEW.services_basic_total, 0) 
                   + COALESCE(NEW.services_extra_total, 0) 
                   + COALESCE(NEW.products_total, 0);
  ELSE
    v_valor_venda := COALESCE(NEW.services_total, 0) 
                   + COALESCE(NEW.products_total, 0);
  END IF;
  
  -- Upsert na tabela de integração
  INSERT INTO financeiro_integracao (
    daily_production_id,
    organization_id,
    unit_id,
    valor_venda,
    valor_comissao,
    data_venda
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    v_external_unit_id,
    v_valor_venda,
    NEW.commission_earned,
    NEW.date
  )
  ON CONFLICT (daily_production_id) 
  DO UPDATE SET
    valor_venda = EXCLUDED.valor_venda,
    valor_comissao = EXCLUDED.valor_comissao,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- 7. Trigger para sincronização automática após insert/update em daily_productions
CREATE TRIGGER trg_sync_financeiro_integracao
AFTER INSERT OR UPDATE ON public.daily_productions
FOR EACH ROW
EXECUTE FUNCTION public.sync_financeiro_integracao();