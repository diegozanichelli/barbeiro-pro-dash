
CREATE OR REPLACE FUNCTION public.get_manager_report_stats(
  p_date_from date,
  p_date_to date,
  p_unit_id uuid DEFAULT NULL,
  p_barber_id uuid DEFAULT NULL
)
RETURNS TABLE(
  total_revenue numeric,
  total_commission numeric,
  total_clients bigint,
  average_ticket numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        -- Se tx_* tem valores, usar tx_* como fonte (gestor já lançou)
        WHEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0) > 0
        THEN COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0)
        -- Senão, usar campos manuais/legados
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
$$;
