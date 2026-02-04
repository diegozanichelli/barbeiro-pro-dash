-- Adicionar coluna source para diferenciar origem dos lançamentos
ALTER TABLE public.sale_transactions 
ADD COLUMN source text NOT NULL DEFAULT 'manager' 
CHECK (source IN ('manager', 'barber'));

-- Comentário explicativo
COMMENT ON COLUMN public.sale_transactions.source IS 'Origem do lançamento: manager (gestor/recepção) ou barber (barbeiro)';

-- Criar ou substituir a função que recalcula os totais
CREATE OR REPLACE FUNCTION public.recalculate_daily_production_from_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_barber_id uuid;
  v_daily_production_id uuid;
  v_date date;
  v_organization_id uuid;
  
  -- Totais do GESTOR (source = 'manager')
  v_tx_basic_total numeric := 0;
  v_tx_extra_total numeric := 0;
  v_tx_products_total numeric := 0;
  v_tx_services_count integer := 0;
  v_tx_products_count integer := 0;
  v_tx_clients_count integer := 0;
  v_tx_commission_earned numeric := 0;
  
  -- Totais do BARBEIRO (source = 'barber')
  v_manual_basic_total numeric := 0;
  v_manual_extra_total numeric := 0;
  v_manual_products_total numeric := 0;
  v_manual_services_count integer := 0;
  v_manual_products_count integer := 0;
BEGIN
  -- Determinar qual registro foi afetado
  IF TG_OP = 'DELETE' THEN
    v_daily_production_id := OLD.daily_production_id;
    v_barber_id := OLD.barber_id;
    v_organization_id := OLD.organization_id;
  ELSE
    v_daily_production_id := NEW.daily_production_id;
    v_barber_id := NEW.barber_id;
    v_organization_id := NEW.organization_id;
  END IF;

  -- Se não tem daily_production_id, não faz nada
  IF v_daily_production_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Buscar a data da produção
  SELECT date INTO v_date FROM daily_productions WHERE id = v_daily_production_id;

  -- Calcular totais do GESTOR (source = 'manager')
  SELECT 
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'service' THEN 1 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'product' THEN 1 END), 0),
    COALESCE(SUM(commission_amount), 0)
  INTO 
    v_tx_basic_total,
    v_tx_extra_total,
    v_tx_products_total,
    v_tx_services_count,
    v_tx_products_count,
    v_tx_commission_earned
  FROM sale_transactions
  WHERE daily_production_id = v_daily_production_id
    AND source = 'manager';

  -- Calcular totais do BARBEIRO (source = 'barber')
  SELECT 
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'service' THEN 1 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'product' THEN 1 END), 0)
  INTO 
    v_manual_basic_total,
    v_manual_extra_total,
    v_manual_products_total,
    v_manual_services_count,
    v_manual_products_count
  FROM sale_transactions
  WHERE daily_production_id = v_daily_production_id
    AND source = 'barber';

  -- Atualizar daily_productions com ambos os conjuntos de totais
  UPDATE daily_productions SET
    -- Campos TX (gestor)
    tx_basic_total = v_tx_basic_total,
    tx_extra_total = v_tx_extra_total,
    tx_products_total = v_tx_products_total,
    tx_services_count = v_tx_services_count,
    tx_products_count = v_tx_products_count,
    tx_commission_earned = v_tx_commission_earned,
    -- Campos MANUAL (barbeiro) - apenas se houver transações do barbeiro
    manual_basic_total = CASE WHEN v_manual_basic_total > 0 OR v_manual_extra_total > 0 OR v_manual_products_total > 0 
                         THEN v_manual_basic_total ELSE manual_basic_total END,
    manual_extra_total = CASE WHEN v_manual_basic_total > 0 OR v_manual_extra_total > 0 OR v_manual_products_total > 0 
                         THEN v_manual_extra_total ELSE manual_extra_total END,
    manual_products_total = CASE WHEN v_manual_basic_total > 0 OR v_manual_extra_total > 0 OR v_manual_products_total > 0 
                            THEN v_manual_products_total ELSE manual_products_total END,
    manual_services_count = CASE WHEN v_manual_services_count > 0 OR v_manual_products_count > 0 
                            THEN v_manual_services_count ELSE manual_services_count END,
    manual_products_count = CASE WHEN v_manual_services_count > 0 OR v_manual_products_count > 0 
                            THEN v_manual_products_count ELSE manual_products_count END,
    -- Campos OFICIAIS = soma de tx + manual (visão consolidada)
    services_basic_total = v_tx_basic_total + COALESCE(v_manual_basic_total, 0),
    services_extra_total = v_tx_extra_total + COALESCE(v_manual_extra_total, 0),
    products_total = v_tx_products_total + COALESCE(v_manual_products_total, 0),
    services_count = v_tx_services_count + COALESCE(v_manual_services_count, 0),
    products_count = v_tx_products_count + COALESCE(v_manual_products_count, 0),
    commission_earned = v_tx_commission_earned,
    updated_at = now()
  WHERE id = v_daily_production_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recriar o trigger (caso não exista ou para garantir que usa a função atualizada)
DROP TRIGGER IF EXISTS trigger_recalculate_production ON sale_transactions;

CREATE TRIGGER trigger_recalculate_production
AFTER INSERT OR UPDATE OR DELETE ON sale_transactions
FOR EACH ROW
EXECUTE FUNCTION recalculate_daily_production_from_transactions();