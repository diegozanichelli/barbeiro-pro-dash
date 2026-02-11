
-- =============================================
-- CORREÇÃO CRÍTICA: Triggers de Sincronização + Comissão
-- =============================================

-- 1. REMOVER triggers dependentes e depois a função redundante
DROP TRIGGER IF EXISTS sync_transactions_to_production ON public.sale_transactions;
DROP TRIGGER IF EXISTS after_sale_transaction_insert ON public.sale_transactions;
DROP TRIGGER IF EXISTS after_sale_transaction_delete ON public.sale_transactions;
DROP TRIGGER IF EXISTS sync_production_on_transaction ON public.sale_transactions;
DROP FUNCTION IF EXISTS public.sync_daily_production_from_transactions() CASCADE;

-- 2. CORRIGIR o trigger recalculate (fonte única de verdade)
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

  -- Totais do GESTOR (source = 'manager')
  SELECT 
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'service' THEN 1 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'product' THEN 1 END), 0),
    COALESCE(COUNT(DISTINCT CASE WHEN item_type = 'service' AND service_category = 'basic' THEN id END), 0),
    COALESCE(SUM(commission_amount), 0)
  INTO 
    v_tx_basic_total, v_tx_extra_total, v_tx_products_total,
    v_tx_services_count, v_tx_products_count, v_tx_clients_count,
    v_tx_commission_earned
  FROM sale_transactions
  WHERE daily_production_id = v_daily_production_id AND source = 'manager';

  -- Totais do BARBEIRO (source = 'barber')
  SELECT 
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'service' THEN 1 END), 0),
    COALESCE(COUNT(CASE WHEN item_type = 'product' THEN 1 END), 0),
    COALESCE(COUNT(DISTINCT CASE WHEN item_type = 'service' AND service_category = 'basic' THEN id END), 0),
    COALESCE(SUM(commission_amount), 0)
  INTO 
    v_manual_basic_total, v_manual_extra_total, v_manual_products_total,
    v_manual_services_count, v_manual_products_count, v_manual_clients_count,
    v_manual_commission_earned
  FROM sale_transactions
  WHERE daily_production_id = v_daily_production_id AND source = 'barber';

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
    services_count = v_manual_services_count,
    products_count = v_manual_products_count,
    updated_at = now()
  WHERE id = v_daily_production_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Recriar trigger único
DROP TRIGGER IF EXISTS recalculate_production_from_transactions ON public.sale_transactions;
CREATE TRIGGER recalculate_production_from_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.sale_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_daily_production_from_transactions();

-- 3. CORRIGIR calculate_commission: somar products_total + tx_products_total
CREATE OR REPLACE FUNCTION public.calculate_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  SELECT services_commission, products_commission
  INTO v_services_commission_rate, v_products_commission_rate
  FROM public.barbers WHERE id = NEW.barber_id;

  IF (NEW.services_basic_total IS NOT NULL) OR (NEW.services_extra_total IS NOT NULL) THEN
    v_services_total_to_calc := COALESCE(NEW.services_basic_total, 0) + COALESCE(NEW.services_extra_total, 0)
                              + COALESCE(NEW.tx_basic_total, 0) + COALESCE(NEW.tx_extra_total, 0);
  ELSE
    v_services_total_to_calc := COALESCE(NEW.services_total, 0);
  END IF;

  v_products_total_to_calc := COALESCE(NEW.products_total, 0) + COALESCE(NEW.tx_products_total, 0);

  v_commission_from_services := COALESCE(v_services_total_to_calc, 0) * COALESCE(v_services_commission_rate, 0) / 100;
  v_commission_from_products := COALESCE(v_products_total_to_calc, 0) * COALESCE(v_products_commission_rate, 0) / 100;

  NEW.commission_earned := COALESCE(v_commission_from_services, 0) + COALESCE(v_commission_from_products, 0);
  RETURN NEW;
END;
$function$;

-- 4. CORRIGIR RPC get_organization_rankings
CREATE OR REPLACE FUNCTION public.get_organization_rankings(p_start_date date, p_end_date date, p_unit_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(barber_id uuid, barber_name text, unit_name text, services_total numeric, services_basic_total numeric, services_extra_total numeric, products_total numeric, clients_count bigint, commission_earned numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  v_organization_id := get_user_organization(auth.uid());
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to any organization';
  END IF;

  RETURN QUERY
  SELECT 
    dp.barber_id,
    b.name as barber_name,
    u.name as unit_name,
    SUM(
      CASE 
        WHEN dp.services_basic_total IS NOT NULL OR dp.services_extra_total IS NOT NULL 
        THEN COALESCE(dp.services_basic_total, 0) + COALESCE(dp.services_extra_total, 0)
             + COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0)
        ELSE COALESCE(dp.services_total, 0)
      END
    ) as services_total,
    SUM(COALESCE(dp.services_basic_total, 0) + COALESCE(dp.tx_basic_total, 0)) as services_basic_total,
    SUM(COALESCE(dp.services_extra_total, 0) + COALESCE(dp.tx_extra_total, 0)) as services_extra_total,
    SUM(COALESCE(dp.products_total, 0) + COALESCE(dp.tx_products_total, 0)) as products_total,
    SUM(dp.clients_count) as clients_count,
    SUM(dp.commission_earned) as commission_earned
  FROM daily_productions dp
  INNER JOIN barbers b ON dp.barber_id = b.id
  INNER JOIN units u ON b.unit_id = u.id
  WHERE dp.organization_id = v_organization_id
    AND dp.date >= p_start_date
    AND dp.date <= p_end_date
    AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
  GROUP BY dp.barber_id, b.name, u.name;
END;
$function$;

-- 5. RECALCULAR RETROATIVAMENTE: tx_* (gestor)
UPDATE daily_productions dp SET
  tx_basic_total = COALESCE(sub.basic_total, 0),
  tx_extra_total = COALESCE(sub.extra_total, 0),
  tx_products_total = COALESCE(sub.products_total, 0),
  tx_services_count = COALESCE(sub.services_count, 0),
  tx_products_count = COALESCE(sub.products_count, 0),
  tx_commission_earned = COALESCE(sub.commission_total, 0)
FROM (
  SELECT daily_production_id,
    SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END) as basic_total,
    SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END) as extra_total,
    SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END) as products_total,
    COUNT(CASE WHEN item_type = 'service' THEN 1 END) as services_count,
    COUNT(CASE WHEN item_type = 'product' THEN 1 END) as products_count,
    SUM(commission_amount) as commission_total
  FROM sale_transactions WHERE source = 'manager' AND daily_production_id IS NOT NULL
  GROUP BY daily_production_id
) sub
WHERE dp.id = sub.daily_production_id AND dp.date >= '2026-02-01';

-- 6. RECALCULAR RETROATIVAMENTE: manual_* e campos oficiais (barbeiro)
UPDATE daily_productions dp SET
  manual_basic_total = COALESCE(sub.basic_total, 0),
  manual_extra_total = COALESCE(sub.extra_total, 0),
  manual_products_total = COALESCE(sub.products_total, 0),
  manual_services_count = COALESCE(sub.services_count, 0),
  manual_products_count = COALESCE(sub.products_count, 0),
  services_basic_total = COALESCE(sub.basic_total, 0),
  services_extra_total = COALESCE(sub.extra_total, 0),
  products_total = COALESCE(sub.products_total, 0),
  services_count = COALESCE(sub.services_count, 0),
  products_count = COALESCE(sub.products_count, 0)
FROM (
  SELECT daily_production_id,
    SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END) as basic_total,
    SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END) as extra_total,
    SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END) as products_total,
    COUNT(CASE WHEN item_type = 'service' THEN 1 END) as services_count,
    COUNT(CASE WHEN item_type = 'product' THEN 1 END) as products_count
  FROM sale_transactions WHERE source = 'barber' AND daily_production_id IS NOT NULL
  GROUP BY daily_production_id
) sub
WHERE dp.id = sub.daily_production_id AND dp.date >= '2026-02-01';

-- 7. FORÇAR RECÁLCULO DE COMISSÕES (trigger calculate_commission dispara via UPDATE)
UPDATE daily_productions SET updated_at = now()
WHERE date >= '2026-02-01' AND date <= '2026-02-28';
