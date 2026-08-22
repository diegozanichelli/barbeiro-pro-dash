
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
  
  v_final_clients_count integer := 0;
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
    COALESCE((SELECT COUNT(DISTINCT sub.created_at) FROM sale_transactions sub WHERE sub.daily_production_id = v_daily_production_id AND sub.source = 'manager'), 0),
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
    COALESCE((SELECT COUNT(DISTINCT sub.created_at) FROM sale_transactions sub WHERE sub.daily_production_id = v_daily_production_id AND sub.source = 'barber'), 0),
    COALESCE(SUM(commission_amount), 0)
  INTO 
    v_manual_basic_total, v_manual_extra_total, v_manual_products_total,
    v_manual_services_count, v_manual_products_count, v_manual_clients_count,
    v_manual_commission_earned
  FROM sale_transactions
  WHERE daily_production_id = v_daily_production_id AND source = 'barber';

  -- Definir clients_count com fallback: manual > tx
  IF v_manual_clients_count > 0 THEN
    v_final_clients_count := v_manual_clients_count;
  ELSE
    v_final_clients_count := v_tx_clients_count;
  END IF;

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
    -- FIX: atualizar clients_count com fallback manual > tx
    clients_count = v_final_clients_count,
    -- FIX: atualizar services_count com fallback manual > tx
    services_count = CASE WHEN v_manual_services_count > 0 THEN v_manual_services_count ELSE v_tx_services_count END,
    -- FIX: atualizar products_count com fallback manual > tx
    products_count = CASE WHEN v_manual_products_count > 0 THEN v_manual_products_count ELSE v_tx_products_count END,
    updated_at = now()
  WHERE id = v_daily_production_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
