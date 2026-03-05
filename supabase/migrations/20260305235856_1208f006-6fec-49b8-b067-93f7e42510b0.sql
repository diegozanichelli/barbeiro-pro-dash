
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

-- Also update get_organization_rankings to prioritize tx > manual
CREATE OR REPLACE FUNCTION public.get_organization_rankings(p_start_date date, p_end_date date, p_unit_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(barber_id uuid, barber_name text, unit_name text, services_total numeric, services_basic_total numeric, services_extra_total numeric, products_total numeric, clients_count bigint, commission_earned numeric, products_count bigint, extras_count bigint, subscriptions_count bigint)
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
    -- services_total: prioridade tx (gestor) > manual (barbeiro) > legado
    SUM(
      CASE 
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0)
        WHEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0) + COALESCE(dp.manual_products_total, 0) > 0
        THEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0)
        WHEN dp.services_basic_total IS NOT NULL OR dp.services_extra_total IS NOT NULL
        THEN COALESCE(dp.services_basic_total, 0) + COALESCE(dp.services_extra_total, 0)
        ELSE COALESCE(dp.services_total, 0)
      END
    ) as services_total,
    -- services_basic_total
    SUM(
      CASE 
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_basic_total, 0)
        WHEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0) + COALESCE(dp.manual_products_total, 0) > 0
        THEN COALESCE(dp.manual_basic_total, 0)
        ELSE COALESCE(dp.services_basic_total, 0)
      END
    ) as services_basic_total,
    -- services_extra_total
    SUM(
      CASE 
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_extra_total, 0)
        WHEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0) + COALESCE(dp.manual_products_total, 0) > 0
        THEN COALESCE(dp.manual_extra_total, 0)
        ELSE COALESCE(dp.services_extra_total, 0)
      END
    ) as services_extra_total,
    -- products_total
    SUM(
      CASE 
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_products_total, 0)
        WHEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0) + COALESCE(dp.manual_products_total, 0) > 0
        THEN COALESCE(dp.manual_products_total, 0)
        ELSE COALESCE(dp.products_total, 0)
      END
    ) as products_total,
    SUM(dp.clients_count) as clients_count,
    SUM(dp.commission_earned) as commission_earned,
    COALESCE(SUM(st_agg.p_count), 0)::bigint as products_count,
    COALESCE(SUM(st_agg.e_count), 0)::bigint as extras_count,
    COALESCE(SUM(st_agg.s_count), 0)::bigint as subscriptions_count
  FROM daily_productions dp
  INNER JOIN barbers b ON dp.barber_id = b.id
  INNER JOIN units u ON b.unit_id = u.id
  LEFT JOIN LATERAL (
    SELECT 
      COUNT(*) FILTER (WHERE st.item_type = 'product') as p_count,
      COUNT(*) FILTER (WHERE st.item_type = 'service' AND st.service_category = 'extra') as e_count,
      COUNT(*) FILTER (WHERE st.item_type = 'subscription') as s_count
    FROM sale_transactions st
    WHERE st.daily_production_id = dp.id
  ) st_agg ON true
  WHERE dp.organization_id = v_organization_id
    AND dp.date >= p_start_date
    AND dp.date <= p_end_date
    AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
  GROUP BY dp.barber_id, b.name, u.name;
END;
$function$;

-- Also update get_manager_report_stats to prioritize tx > manual
CREATE OR REPLACE FUNCTION public.get_manager_report_stats(p_date_from date, p_date_to date, p_unit_id uuid DEFAULT NULL::uuid, p_barber_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_revenue numeric, total_commission numeric, total_clients bigint, average_ticket numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
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
    COALESCE(SUM(
      CASE
        -- Prioridade: tx (gestor) > manual (barbeiro) > legado
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0)
        WHEN dp.services_basic_total IS NOT NULL OR dp.services_extra_total IS NOT NULL
        THEN COALESCE(dp.services_basic_total, 0) + COALESCE(dp.services_extra_total, 0) + COALESCE(dp.products_total, 0)
        ELSE COALESCE(dp.services_total, 0) + COALESCE(dp.products_total, 0)
      END
    ), 0)::numeric as total_revenue,
    COALESCE(SUM(dp.commission_earned), 0)::numeric as total_commission,
    COALESCE(SUM(dp.clients_count), 0)::bigint as total_clients,
    CASE 
      WHEN COALESCE(SUM(dp.clients_count), 0) > 0 
      THEN (COALESCE(SUM(
        CASE
          WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
          THEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0)
          WHEN dp.services_basic_total IS NOT NULL OR dp.services_extra_total IS NOT NULL
          THEN COALESCE(dp.services_basic_total, 0) + COALESCE(dp.services_extra_total, 0) + COALESCE(dp.products_total, 0)
          ELSE COALESCE(dp.services_total, 0) + COALESCE(dp.products_total, 0)
        END
      ), 0) / SUM(dp.clients_count))::numeric
      ELSE 0::numeric
    END as average_ticket
  FROM daily_productions dp
  INNER JOIN barbers b ON dp.barber_id = b.id
  WHERE dp.organization_id = v_organization_id
    AND dp.date >= p_date_from
    AND dp.date <= p_date_to
    AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    AND (p_barber_id IS NULL OR dp.barber_id = p_barber_id);
END;
$function$;
