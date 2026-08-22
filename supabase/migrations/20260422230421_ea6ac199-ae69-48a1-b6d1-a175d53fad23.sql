-- =========================================================
-- PASSO 1: Drop trigger duplicado em sale_transactions
-- =========================================================
DROP TRIGGER IF EXISTS trigger_recalculate_production ON public.sale_transactions;

-- =========================================================
-- PASSO 2: Reescrever recalculate_daily_production_from_transactions
-- com filtro explícito item_type IN ('service','product')
-- =========================================================
CREATE OR REPLACE FUNCTION public.recalculate_daily_production_from_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_barber_id uuid;
  v_daily_production_id uuid;
  v_date date;
  v_organization_id uuid;
  
  v_tx_basic_total numeric := 0;
  v_tx_extra_total numeric := 0;
  v_tx_products_total numeric := 0;
  v_tx_services_count integer := 0;
  v_tx_products_count integer := 0;
  v_tx_clients_count integer := 0;
  v_tx_commission_earned numeric := 0;
  
  v_manual_basic_total numeric := 0;
  v_manual_extra_total numeric := 0;
  v_manual_products_total numeric := 0;
  v_manual_services_count integer := 0;
  v_manual_products_count integer := 0;
  v_manual_clients_count integer := 0;
  v_manual_commission_earned numeric := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_daily_production_id := OLD.daily_production_id;
    v_barber_id := OLD.barber_id;
    v_organization_id := OLD.organization_id;
  ELSE
    v_daily_production_id := NEW.daily_production_id;
    v_barber_id := NEW.barber_id;
    v_organization_id := NEW.organization_id;
  END IF;

  IF v_daily_production_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT date INTO v_date FROM daily_productions WHERE id = v_daily_production_id;

  -- Totais do GESTOR (source = 'manager') — somente service/product
  SELECT 
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'service' THEN 1 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'product' THEN 1 END), 0),
    COALESCE((SELECT COUNT(DISTINCT sub.created_at) FROM sale_transactions sub 
              WHERE sub.daily_production_id = v_daily_production_id 
                AND sub.source = 'manager'
                AND sub.item_type IN ('service','product')), 0),
    COALESCE(SUM(CASE WHEN item_type IN ('service','product') THEN commission_amount ELSE 0 END), 0)
  INTO 
    v_tx_basic_total, v_tx_extra_total, v_tx_products_total,
    v_tx_services_count, v_tx_products_count, v_tx_clients_count,
    v_tx_commission_earned
  FROM sale_transactions
  WHERE daily_production_id = v_daily_production_id 
    AND source = 'manager'
    AND item_type IN ('service','product');

  -- Totais do BARBEIRO (source = 'barber') — somente service/product
  SELECT 
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'service' THEN 1 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'product' THEN 1 END), 0),
    COALESCE((SELECT COUNT(DISTINCT sub.created_at) FROM sale_transactions sub 
              WHERE sub.daily_production_id = v_daily_production_id 
                AND sub.source = 'barber'
                AND sub.item_type IN ('service','product')), 0),
    COALESCE(SUM(CASE WHEN item_type IN ('service','product') THEN commission_amount ELSE 0 END), 0)
  INTO 
    v_manual_basic_total, v_manual_extra_total, v_manual_products_total,
    v_manual_services_count, v_manual_products_count, v_manual_clients_count,
    v_manual_commission_earned
  FROM sale_transactions
  WHERE daily_production_id = v_daily_production_id 
    AND source = 'barber'
    AND item_type IN ('service','product');

  UPDATE daily_productions SET
    tx_basic_total = v_tx_basic_total,
    tx_extra_total = v_tx_extra_total,
    tx_products_total = v_tx_products_total,
    tx_services_count = v_tx_services_count,
    tx_products_count = v_tx_products_count,
    tx_clients_count = v_tx_clients_count,
    tx_commission_earned = v_tx_commission_earned,
    manual_basic_total = v_manual_basic_total,
    manual_extra_total = v_manual_extra_total,
    manual_products_total = v_manual_products_total,
    manual_services_count = v_manual_services_count,
    manual_products_count = v_manual_products_count,
    manual_clients_count = v_manual_clients_count,
    services_basic_total = v_manual_basic_total,
    services_extra_total = v_manual_extra_total,
    products_total = v_manual_products_total,
    -- PRIORIDADE: gestor (tx) > barbeiro (manual)
    clients_count = CASE WHEN v_tx_clients_count > 0 THEN v_tx_clients_count ELSE v_manual_clients_count END,
    services_count = CASE WHEN v_tx_services_count > 0 THEN v_tx_services_count ELSE v_manual_services_count END,
    products_count = CASE WHEN v_tx_products_count > 0 THEN v_tx_products_count ELSE v_manual_products_count END,
    updated_at = now()
  WHERE id = v_daily_production_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- =========================================================
-- PASSO 3: calculate_commission prioriza tx_commission_earned (verdade itemizada)
-- =========================================================
CREATE OR REPLACE FUNCTION public.calculate_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_services_commission_rate DECIMAL(5,2);
  v_products_commission_rate DECIMAL(5,2);
  v_services_total_to_calc NUMERIC;
  v_products_total_to_calc NUMERIC;
  v_commission_from_services NUMERIC;
  v_commission_from_products NUMERIC;
BEGIN
  -- 1ª PRIORIDADE: usar soma itemizada das transações (verdade do gestor)
  IF COALESCE(NEW.tx_commission_earned, 0) > 0 THEN
    NEW.commission_earned := NEW.tx_commission_earned;
    RETURN NEW;
  END IF;

  SELECT services_commission, products_commission
  INTO v_services_commission_rate, v_products_commission_rate
  FROM public.barbers WHERE id = NEW.barber_id;

  -- 2ª PRIORIDADE: tx (gestor) > manual (barbeiro) > legado (cálculo por percentual)
  IF COALESCE(NEW.tx_basic_total, 0) + COALESCE(NEW.tx_extra_total, 0) + COALESCE(NEW.tx_products_total, 0) > 0 THEN
    v_services_total_to_calc := COALESCE(NEW.tx_basic_total, 0) + COALESCE(NEW.tx_extra_total, 0);
    v_products_total_to_calc := COALESCE(NEW.tx_products_total, 0);
  ELSIF (NEW.services_basic_total IS NOT NULL) OR (NEW.services_extra_total IS NOT NULL) THEN
    v_services_total_to_calc := COALESCE(NEW.services_basic_total, 0) + COALESCE(NEW.services_extra_total, 0);
    v_products_total_to_calc := COALESCE(NEW.products_total, 0);
  ELSE
    v_services_total_to_calc := COALESCE(NEW.services_total, 0);
    v_products_total_to_calc := COALESCE(NEW.products_total, 0);
  END IF;

  v_commission_from_services := COALESCE(v_services_total_to_calc, 0) * COALESCE(v_services_commission_rate, 0) / 100;
  v_commission_from_products := COALESCE(v_products_total_to_calc, 0) * COALESCE(v_products_commission_rate, 0) / 100;

  NEW.commission_earned := COALESCE(v_commission_from_services, 0) + COALESCE(v_commission_from_products, 0);
  RETURN NEW;
END;
$function$;

-- =========================================================
-- PASSO 4: Deduplicação retroativa
-- Para cada DP que tem ambos sources, com totais ~equivalentes,
-- deletar as transações source='barber' (manter manager como verdade).
-- =========================================================
WITH dp_with_both AS (
  SELECT 
    daily_production_id,
    SUM(CASE WHEN source='manager' AND item_type IN ('service','product') THEN price_sold ELSE 0 END) AS mgr_total,
    SUM(CASE WHEN source='barber'  AND item_type IN ('service','product') THEN price_sold ELSE 0 END) AS bar_total,
    COUNT(*) FILTER (WHERE source='manager') AS mgr_count,
    COUNT(*) FILTER (WHERE source='barber')  AS bar_count
  FROM public.sale_transactions
  WHERE daily_production_id IS NOT NULL
  GROUP BY daily_production_id
),
duplicated_dps AS (
  SELECT daily_production_id
  FROM dp_with_both
  WHERE mgr_count > 0 
    AND bar_count > 0
    AND mgr_total > 0
    -- considera duplicação se totais batem em até 5% OU exatamente iguais
    AND (
      ABS(mgr_total - bar_total) < 0.01
      OR (bar_total > 0 AND ABS(mgr_total - bar_total) / mgr_total <= 0.05)
    )
)
DELETE FROM public.sale_transactions st
USING duplicated_dps d
WHERE st.daily_production_id = d.daily_production_id
  AND st.source = 'barber';

-- =========================================================
-- PASSO 5: Re-backfill idempotente de is_new_client em abril/2026
-- =========================================================
-- 5.1 Resetar
UPDATE public.sale_transactions
SET is_new_client = false
WHERE created_at >= '2026-04-01T00:00:00-04:00'
  AND created_at <  '2026-05-01T00:00:00-04:00'
  AND item_type IN ('service','product');

-- 5.2 Marcar primeira aparição (DISTINCT ON) por (org, mobile_phone)
WITH first_appearance AS (
  SELECT DISTINCT ON (organization_id, mobile_phone) id
  FROM public.sale_transactions
  WHERE created_at >= '2026-04-01T00:00:00-04:00'
    AND created_at <  '2026-05-01T00:00:00-04:00'
    AND item_type IN ('service','product')
    AND mobile_phone IS NOT NULL
    AND mobile_phone <> ''
    -- Só marca como "novo" se não existir registro anterior do mesmo celular na mesma org
    AND NOT EXISTS (
      SELECT 1 FROM public.sale_transactions prev
      WHERE prev.organization_id = sale_transactions.organization_id
        AND prev.mobile_phone = sale_transactions.mobile_phone
        AND prev.created_at < '2026-04-01T00:00:00-04:00'
        AND prev.item_type IN ('service','product')
    )
  ORDER BY organization_id, mobile_phone, created_at ASC
)
UPDATE public.sale_transactions st
SET is_new_client = true
FROM first_appearance fa
WHERE st.id = fa.id;

-- =========================================================
-- PASSO 6: Recalcular daily_productions afetadas (dispara trigger calculate_commission)
-- Touch leve para forçar recomputo de commission_earned baseado em tx_commission_earned
-- =========================================================
UPDATE public.daily_productions
SET updated_at = now()
WHERE date >= '2026-04-01' AND date < '2026-05-01';
