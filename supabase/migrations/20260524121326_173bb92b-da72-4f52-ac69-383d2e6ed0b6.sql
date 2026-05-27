
CREATE OR REPLACE FUNCTION public.get_barber_deep_analysis(
  p_organization_id uuid,
  p_barber_id uuid,
  p_start date,
  p_end date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := (p_start || ' 00:00:00')::timestamp AT TIME ZONE 'America/Manaus';
  v_end timestamptz := ((p_end + 1) || ' 00:00:00')::timestamp AT TIME ZONE 'America/Manaus';
  v_result jsonb;
BEGIN
  IF NOT (
    (has_role(auth.uid(), 'manager'::app_role) AND get_user_organization(auth.uid()) = p_organization_id)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  WITH tx AS (
    SELECT
      st.barber_id,
      st.created_at,
      (st.created_at AT TIME ZONE 'America/Manaus')::date AS dia,
      st.item_type,
      st.price_sold,
      NULLIF(regexp_replace(COALESCE(st.mobile_phone,''),'\D','','g'),'') AS phone_norm
    FROM sale_transactions st
    WHERE st.organization_id = p_organization_id
      AND st.created_at >= v_start
      AND st.created_at < v_end
      AND st.barber_id IS NOT NULL
  ),
  tx2 AS (
    SELECT *,
      (phone_norm IS NOT NULL AND length(phone_norm) >= 8) AS has_phone,
      CASE
        WHEN phone_norm IS NOT NULL AND length(phone_norm) >= 8
          THEN 'p:'||phone_norm||':'||dia::text
        ELSE 'a:'||extract(epoch from created_at)::text
      END AS visit_key
    FROM tx
  ),
  per_barber AS (
    SELECT
      barber_id,
      COUNT(DISTINCT visit_key) AS atendimentos,
      COUNT(DISTINCT phone_norm) FILTER (WHERE has_phone) AS unique_clients,
      COUNT(DISTINCT visit_key) FILTER (WHERE NOT has_phone) AS anon_visits,
      COUNT(*) FILTER (WHERE item_type='service') AS service_lines,
      COUNT(*) FILTER (WHERE item_type='product') AS product_lines,
      COUNT(*) FILTER (WHERE item_type='subscription') AS sub_count,
      COALESCE(SUM(price_sold) FILTER (WHERE item_type='service'),0)::numeric AS service_revenue,
      COALESCE(SUM(price_sold) FILTER (WHERE item_type='product'),0)::numeric AS product_revenue,
      COALESCE(SUM(price_sold) FILTER (WHERE item_type='subscription'),0)::numeric AS sub_mrr,
      COUNT(DISTINCT visit_key) FILTER (WHERE has_phone) AS visits_with_phone,
      COUNT(DISTINCT visit_key) FILTER (WHERE item_type='product') AS visits_with_product
    FROM tx2
    GROUP BY barber_id
  ),
  self_pb AS (SELECT * FROM per_barber WHERE barber_id = p_barber_id),
  house AS (
    SELECT
      COALESCE(AVG(atendimentos),0)::numeric AS atend_avg,
      COALESCE(AVG(unique_clients),0)::numeric AS unique_avg,
      COALESCE(AVG(sub_count),0)::numeric AS sub_avg,
      COALESCE(AVG(CASE WHEN atendimentos>0 THEN (service_revenue+product_revenue)/atendimentos END),0)::numeric AS ticket_op_avg
    FROM per_barber
    WHERE barber_id <> p_barber_id AND atendimentos > 0
  ),
  self_phones AS (
    SELECT DISTINCT phone_norm FROM tx2 WHERE barber_id = p_barber_id AND has_phone
  ),
  network_recurring AS (
    SELECT COUNT(*)::int AS c FROM self_phones sp
    WHERE EXISTS (
      SELECT 1 FROM sale_transactions st2
      WHERE st2.organization_id = p_organization_id
        AND st2.created_at < v_start
        AND NULLIF(regexp_replace(COALESCE(st2.mobile_phone,''),'\D','','g'),'') = sp.phone_norm
      LIMIT 1
    ) OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.organization_id = p_organization_id
        AND NULLIF(regexp_replace(COALESCE(c.mobile_phone,''),'\D','','g'),'') = sp.phone_norm
        AND (c.created_at < v_start OR c.subscription_started_at < p_start)
      LIMIT 1
    )
  ),
  barber_recurring AS (
    SELECT COUNT(*)::int AS c FROM self_phones sp
    WHERE EXISTS (
      SELECT 1 FROM sale_transactions st2
      WHERE st2.organization_id = p_organization_id
        AND st2.barber_id = p_barber_id
        AND st2.created_at < v_start
        AND NULLIF(regexp_replace(COALESCE(st2.mobile_phone,''),'\D','','g'),'') = sp.phone_norm
      LIMIT 1
    )
  ),
  daily AS (
    SELECT
      dia AS date,
      COALESCE(SUM(price_sold),0)::numeric AS revenue,
      COUNT(DISTINCT visit_key)::int AS atendimentos,
      COUNT(*) FILTER (WHERE item_type='service')::int AS services
    FROM tx2 WHERE barber_id = p_barber_id
    GROUP BY dia
    ORDER BY dia DESC
    LIMIT 7
  )
  SELECT jsonb_build_object(
    'volume', jsonb_build_object(
      'atendimentos', COALESCE((SELECT atendimentos FROM self_pb),0),
      'unique_clients', COALESCE((SELECT unique_clients FROM self_pb),0),
      'anonymous_visits', COALESCE((SELECT anon_visits FROM self_pb),0),
      'service_lines', COALESCE((SELECT service_lines FROM self_pb),0),
      'product_lines', COALESCE((SELECT product_lines FROM self_pb),0)
    ),
    'services', jsonb_build_object('revenue', COALESCE((SELECT service_revenue FROM self_pb),0)),
    'products', jsonb_build_object('revenue', COALESCE((SELECT product_revenue FROM self_pb),0)),
    'subscriptions', jsonb_build_object(
      'count', COALESCE((SELECT sub_count FROM self_pb),0),
      'mrr', COALESCE((SELECT sub_mrr FROM self_pb),0)
    ),
    'ticket_operacional', CASE WHEN COALESCE((SELECT atendimentos FROM self_pb),0) > 0
      THEN COALESCE((SELECT (service_revenue+product_revenue)/atendimentos FROM self_pb),0)
      ELSE 0 END,
    'ticket_assinatura', CASE WHEN COALESCE((SELECT sub_count FROM self_pb),0) > 0
      THEN COALESCE((SELECT sub_mrr/sub_count FROM self_pb),0)
      ELSE 0 END,
    'retention', jsonb_build_object(
      'total_with_phone', (SELECT COUNT(*) FROM self_phones),
      'network_count', COALESCE((SELECT c FROM network_recurring),0),
      'barber_count', COALESCE((SELECT c FROM barber_recurring),0),
      'network_pct', CASE WHEN (SELECT COUNT(*) FROM self_phones)>0
        THEN (SELECT c FROM network_recurring)::numeric*100/(SELECT COUNT(*) FROM self_phones) ELSE 0 END,
      'barber_pct', CASE WHEN (SELECT COUNT(*) FROM self_phones)>0
        THEN (SELECT c FROM barber_recurring)::numeric*100/(SELECT COUNT(*) FROM self_phones) ELSE 0 END
    ),
    'portfolio', jsonb_build_object(
      'phone_coverage_pct', CASE WHEN COALESCE((SELECT atendimentos FROM self_pb),0)>0
        THEN COALESCE((SELECT visits_with_phone::numeric*100/atendimentos FROM self_pb),0) ELSE 0 END,
      'visits_per_client', CASE WHEN COALESCE((SELECT unique_clients FROM self_pb),0)>0
        THEN COALESCE((SELECT visits_with_phone::numeric/unique_clients FROM self_pb),0) ELSE 0 END,
      'product_penetration_pct', CASE WHEN COALESCE((SELECT atendimentos FROM self_pb),0)>0
        THEN COALESCE((SELECT visits_with_product::numeric*100/atendimentos FROM self_pb),0) ELSE 0 END
    ),
    'house', jsonb_build_object(
      'atendimentos_avg', COALESCE((SELECT atend_avg FROM house),0),
      'unique_clients_avg', COALESCE((SELECT unique_avg FROM house),0),
      'sub_count_avg', COALESCE((SELECT sub_avg FROM house),0),
      'ticket_operacional_avg', COALESCE((SELECT ticket_op_avg FROM house),0)
    ),
    'daily_breakdown', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'date', date, 'revenue', revenue, 'atendimentos', atendimentos, 'services', services
    ) ORDER BY date DESC) FROM daily), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_barber_deep_analysis(uuid,uuid,date,date) TO authenticated;
