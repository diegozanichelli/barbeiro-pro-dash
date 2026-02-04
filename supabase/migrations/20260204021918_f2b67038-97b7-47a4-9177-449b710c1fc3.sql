-- =====================================================
-- SEPARAÇÃO DE LANÇAMENTOS: GESTOR (tx_) vs BARBEIRO (manual_)
-- =====================================================

-- 1. Adicionar colunas para dados do GESTOR (vindos de transações/Ao Vivo)
ALTER TABLE daily_productions 
ADD COLUMN IF NOT EXISTS tx_basic_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tx_extra_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tx_products_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tx_clients_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tx_services_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tx_products_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tx_commission_earned numeric DEFAULT 0;

-- 2. Adicionar colunas para dados MANUAIS do BARBEIRO
ALTER TABLE daily_productions 
ADD COLUMN IF NOT EXISTS manual_basic_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS manual_extra_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS manual_products_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS manual_clients_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS manual_services_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS manual_products_count integer DEFAULT 0;

-- 3. Migrar dados existentes
-- Registros COM transações → valores vão para tx_*
UPDATE daily_productions dp SET
  tx_basic_total = COALESCE(dp.services_basic_total, 0),
  tx_extra_total = COALESCE(dp.services_extra_total, 0),
  tx_products_total = COALESCE(dp.products_total, 0),
  tx_clients_count = COALESCE(dp.clients_count, 0),
  tx_services_count = COALESCE(dp.services_count, 0),
  tx_products_count = COALESCE(dp.products_count, 0),
  tx_commission_earned = COALESCE(dp.commission_earned, 0)
WHERE EXISTS (
  SELECT 1 FROM sale_transactions st 
  WHERE st.daily_production_id = dp.id
);

-- Registros SEM transações → valores vão para manual_* (lançamento do barbeiro)
UPDATE daily_productions dp SET
  manual_basic_total = COALESCE(dp.services_basic_total, 0),
  manual_extra_total = COALESCE(dp.services_extra_total, 0),
  manual_products_total = COALESCE(dp.products_total, 0),
  manual_clients_count = COALESCE(dp.clients_count, 0),
  manual_services_count = COALESCE(dp.services_count, 0),
  manual_products_count = COALESCE(dp.products_count, 0)
WHERE NOT EXISTS (
  SELECT 1 FROM sale_transactions st 
  WHERE st.daily_production_id = dp.id
);

-- 4. Atualizar trigger para gravar APENAS em tx_* e usar manual_* como valor OFICIAL
CREATE OR REPLACE FUNCTION sync_daily_production_from_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_barber_id uuid;
  v_organization_id uuid;
  v_date date;
  v_production_id uuid;
  v_services_commission numeric;
  v_products_commission numeric;
  v_transactions_basic numeric := 0;
  v_transactions_extra numeric := 0;
  v_transactions_products numeric := 0;
  v_commission_total numeric := 0;
  v_clients_count integer := 0;
  v_services_count integer := 0;
  v_products_count integer := 0;
BEGIN
  -- Determinar barber_id e organization_id baseado na operação
  IF TG_OP = 'DELETE' THEN
    v_barber_id := OLD.barber_id;
    v_organization_id := OLD.organization_id;
    v_production_id := OLD.daily_production_id;
  ELSE
    v_barber_id := NEW.barber_id;
    v_organization_id := NEW.organization_id;
    v_production_id := NEW.daily_production_id;
  END IF;

  -- Se não tem barber_id (venda de recepção), ignorar
  IF v_barber_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Se não tem production_id, não podemos sincronizar
  IF v_production_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Buscar a data da produção
  SELECT date INTO v_date
  FROM daily_productions
  WHERE id = v_production_id;

  IF v_date IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Buscar comissões do barbeiro
  SELECT services_commission, products_commission 
  INTO v_services_commission, v_products_commission
  FROM barbers 
  WHERE id = v_barber_id;

  -- Calcular totais APENAS das transações (Ao Vivo / Gestor)
  SELECT 
    COALESCE(SUM(CASE WHEN service_category = 'basic' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN service_category = 'extra' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(commission_amount), 0),
    COUNT(DISTINCT CASE WHEN item_type = 'service' THEN id END),
    COUNT(CASE WHEN service_category = 'extra' THEN 1 END),
    COUNT(CASE WHEN item_type = 'product' THEN 1 END)
  INTO 
    v_transactions_basic,
    v_transactions_extra,
    v_transactions_products,
    v_commission_total,
    v_clients_count,
    v_services_count,
    v_products_count
  FROM sale_transactions
  WHERE daily_production_id = v_production_id
    AND barber_id = v_barber_id;

  -- Atualizar APENAS as colunas tx_* (dados do Gestor/Ao Vivo)
  -- Os campos legados (services_basic_total, etc.) usam o valor MANUAL do barbeiro
  UPDATE daily_productions SET 
    -- Colunas do GESTOR (Ao Vivo)
    tx_basic_total = v_transactions_basic,
    tx_extra_total = v_transactions_extra,
    tx_products_total = v_transactions_products,
    tx_clients_count = v_clients_count,
    tx_services_count = v_services_count,
    tx_products_count = v_products_count,
    tx_commission_earned = v_commission_total,
    -- Campos legados mantêm o valor MANUAL (oficial para comissão)
    -- Não alteramos services_basic_total, products_total, etc.
    updated_at = now()
  WHERE id = v_production_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;