
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
    -- services_total: prioridade manual > tx > legado
    SUM(
      CASE 
        WHEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0) + COALESCE(dp.manual_products_total, 0) > 0
        THEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0)
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0)
        WHEN dp.services_basic_total IS NOT NULL OR dp.services_extra_total IS NOT NULL
        THEN COALESCE(dp.services_basic_total, 0) + COALESCE(dp.services_extra_total, 0)
        ELSE COALESCE(dp.services_total, 0)
      END
    ) as services_total,
    -- services_basic_total
    SUM(
      CASE 
        WHEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0) + COALESCE(dp.manual_products_total, 0) > 0
        THEN COALESCE(dp.manual_basic_total, 0)
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_basic_total, 0)
        ELSE COALESCE(dp.services_basic_total, 0)
      END
    ) as services_basic_total,
    -- services_extra_total
    SUM(
      CASE 
        WHEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0) + COALESCE(dp.manual_products_total, 0) > 0
        THEN COALESCE(dp.manual_extra_total, 0)
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_extra_total, 0)
        ELSE COALESCE(dp.services_extra_total, 0)
      END
    ) as services_extra_total,
    -- products_total
    SUM(
      CASE 
        WHEN COALESCE(dp.manual_basic_total, 0) + COALESCE(dp.manual_extra_total, 0) + COALESCE(dp.manual_products_total, 0) > 0
        THEN COALESCE(dp.manual_products_total, 0)
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_products_total, 0)
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
