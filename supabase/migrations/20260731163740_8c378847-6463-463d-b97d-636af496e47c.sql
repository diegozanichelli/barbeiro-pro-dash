
CREATE OR REPLACE FUNCTION public.get_report_audit_findings(
  p_start date,
  p_end date,
  p_unit_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_today date := (now() AT TIME ZONE 'America/Manaus')::date;
  v_last date;
  v_dup_phone int;
  v_dup_name int;
  v_missing int;
  v_sub_com int;
  v_sub_com_val numeric;
  v_orphan int;
  v_orphan_val numeric;
  v_no_phone int;
  v_mismatch int;
BEGIN
  v_org := public.get_user_organization(auth.uid());
  IF p_organization_id IS NOT NULL AND public.has_role(auth.uid(), 'super_admin') THEN
    v_org := p_organization_id;
  END IF;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('findings', '[]'::jsonb);
  END IF;

  v_last := LEAST(p_end, v_today - 1);

  SELECT count(*) INTO v_dup_phone FROM (
    SELECT 1 FROM public.clients c
    WHERE c.organization_id = v_org
      AND coalesce(c.mobile_phone, '') <> ''
    GROUP BY c.mobile_phone
    HAVING count(*) > 1
  ) q;

  SELECT count(*) INTO v_dup_name FROM (
    SELECT 1 FROM public.clients c
    WHERE c.organization_id = v_org
      AND coalesce(c.normalized_name, '') <> ''
    GROUP BY c.normalized_name
    HAVING count(*) > 1
  ) q;

  SELECT count(*) INTO v_missing
  FROM public.barbers b
  CROSS JOIN generate_series(p_start, COALESCE(v_last, p_start - 1), interval '1 day') AS g(d)
  WHERE b.organization_id = v_org
    AND b.status = 'active'
    AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    AND g.d::date >= (b.created_at AT TIME ZONE 'America/Manaus')::date
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_holidays h
      WHERE h.organization_id = v_org AND h.date = g.d::date
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.daily_productions dp
      WHERE dp.barber_id = b.id AND dp.date = g.d::date
    );

  SELECT count(*), COALESCE(sum(st.commission_amount), 0)
    INTO v_sub_com, v_sub_com_val
  FROM public.sale_transactions st
  LEFT JOIN public.barbers b ON b.id = st.barber_id
  WHERE st.organization_id = v_org
    AND st.item_type = 'subscription'
    AND COALESCE(st.commission_amount, 0) <> 0
    AND st.created_at >= (p_start::text || 'T00:00:00-04:00')::timestamptz
    AND st.created_at <= (p_end::text || 'T23:59:59.999-04:00')::timestamptz
    AND (p_unit_id IS NULL OR st.unit_id = p_unit_id OR b.unit_id = p_unit_id);

  SELECT count(*), COALESCE(sum(st.price_sold), 0)
    INTO v_orphan, v_orphan_val
  FROM public.sale_transactions st
  LEFT JOIN public.barbers b ON b.id = st.barber_id
  WHERE st.organization_id = v_org
    AND st.barber_id IS NOT NULL
    AND st.daily_production_id IS NULL
    AND st.created_at >= (p_start::text || 'T00:00:00-04:00')::timestamptz
    AND st.created_at <= (p_end::text || 'T23:59:59.999-04:00')::timestamptz
    AND (p_unit_id IS NULL OR st.unit_id = p_unit_id OR b.unit_id = p_unit_id);

  SELECT count(*) INTO v_no_phone
  FROM public.sale_transactions st
  LEFT JOIN public.barbers b ON b.id = st.barber_id
  WHERE st.organization_id = v_org
    AND st.item_type = 'subscription'
    AND st.subscription_action IN ('new', 'new_member')
    AND COALESCE(st.mobile_phone, '') = ''
    AND st.created_at >= (p_start::text || 'T00:00:00-04:00')::timestamptz
    AND st.created_at <= (p_end::text || 'T23:59:59.999-04:00')::timestamptz
    AND (p_unit_id IS NULL OR st.unit_id = p_unit_id OR b.unit_id = p_unit_id);

  SELECT count(*) INTO v_mismatch
  FROM public.daily_productions dp
  JOIN public.barbers b ON b.id = dp.barber_id
  LEFT JOIN (
    SELECT daily_production_id, sum(price_sold) AS s
    FROM public.sale_transactions
    WHERE item_type <> 'subscription' AND daily_production_id IS NOT NULL
    GROUP BY daily_production_id
  ) t ON t.daily_production_id = dp.id
  WHERE dp.organization_id = v_org
    AND dp.date BETWEEN p_start AND p_end
    AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    AND abs(
      COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0)
      - COALESCE(t.s, 0)
    ) > 0.01;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'findings', jsonb_build_array(
      jsonb_build_object('check_key', 'dup_clients_phone', 'count', v_dup_phone, 'total_value', NULL, 'severity',
        CASE WHEN v_dup_phone > 0 THEN 'critical' ELSE 'ok' END),
      jsonb_build_object('check_key', 'dup_clients_name', 'count', v_dup_name, 'total_value', NULL, 'severity',
        CASE WHEN v_dup_name > 0 THEN 'warning' ELSE 'ok' END),
      jsonb_build_object('check_key', 'missing_days', 'count', v_missing, 'total_value', NULL, 'severity',
        CASE WHEN v_missing > 0 THEN 'warning' ELSE 'ok' END),
      jsonb_build_object('check_key', 'subscription_commission', 'count', v_sub_com, 'total_value', v_sub_com_val, 'severity',
        CASE WHEN v_sub_com > 0 THEN 'critical' ELSE 'ok' END),
      jsonb_build_object('check_key', 'orphan_sales', 'count', v_orphan, 'total_value', v_orphan_val, 'severity',
        CASE WHEN v_orphan > 0 THEN 'critical' ELSE 'ok' END),
      jsonb_build_object('check_key', 'subscription_no_phone', 'count', v_no_phone, 'total_value', NULL, 'severity',
        CASE WHEN v_no_phone > 0 THEN 'warning' ELSE 'ok' END),
      jsonb_build_object('check_key', 'production_mismatch', 'count', v_mismatch, 'total_value', NULL, 'severity',
        CASE WHEN v_mismatch > 0 THEN 'critical' ELSE 'ok' END)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_audit_finding_rows(
  p_check_key text,
  p_start date,
  p_end date,
  p_unit_id uuid DEFAULT NULL,
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_today date := (now() AT TIME ZONE 'America/Manaus')::date;
  v_last date;
  v_rows jsonb := '[]'::jsonb;
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  v_org := public.get_user_organization(auth.uid());
  IF p_organization_id IS NOT NULL AND public.has_role(auth.uid(), 'super_admin') THEN
    v_org := p_organization_id;
  END IF;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb);
  END IF;

  v_last := LEAST(p_end, v_today - 1);
  v_from := (p_start::text || 'T00:00:00-04:00')::timestamptz;
  v_to := (p_end::text || 'T23:59:59.999-04:00')::timestamptz;

  IF p_check_key = 'dup_clients_phone' THEN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'group_key', c.mobile_phone,
               'label', c.mobile_phone,
               'count', count(*),
               'clients', jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.mobile_phone,
                 'created_at', c.created_at, 'plan_id', c.subscription_plan_id) ORDER BY c.created_at)
             ) AS r
      FROM public.clients c
      WHERE c.organization_id = v_org AND COALESCE(c.mobile_phone, '') <> ''
      GROUP BY c.mobile_phone
      HAVING count(*) > 1
      ORDER BY count(*) DESC, c.mobile_phone
      LIMIT p_limit OFFSET p_offset
    ) q;

  ELSIF p_check_key = 'dup_clients_name' THEN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'group_key', c.normalized_name,
               'label', min(c.name),
               'count', count(*),
               'clients', jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.mobile_phone,
                 'created_at', c.created_at, 'plan_id', c.subscription_plan_id) ORDER BY c.created_at)
             ) AS r
      FROM public.clients c
      WHERE c.organization_id = v_org AND COALESCE(c.normalized_name, '') <> ''
      GROUP BY c.normalized_name
      HAVING count(*) > 1
      ORDER BY count(*) DESC, c.normalized_name
      LIMIT p_limit OFFSET p_offset
    ) q;

  ELSIF p_check_key = 'missing_days' THEN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'barber_id', b.id, 'barber_name', b.name,
               'unit_name', u.name, 'date', g.d::date
             ) AS r
      FROM public.barbers b
      JOIN public.units u ON u.id = b.unit_id
      CROSS JOIN generate_series(p_start, COALESCE(v_last, p_start - 1), interval '1 day') AS g(d)
      WHERE b.organization_id = v_org
        AND b.status = 'active'
        AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
        AND g.d::date >= (b.created_at AT TIME ZONE 'America/Manaus')::date
        AND NOT EXISTS (
          SELECT 1 FROM public.organization_holidays h
          WHERE h.organization_id = v_org AND h.date = g.d::date
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.daily_productions dp
          WHERE dp.barber_id = b.id AND dp.date = g.d::date
        )
      ORDER BY g.d::date DESC, b.name
      LIMIT p_limit OFFSET p_offset
    ) q;

  ELSIF p_check_key = 'subscription_commission' THEN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'transaction_id', st.id, 'barber_id', st.barber_id,
               'barber_name', COALESCE(b.name, 'Recepção'),
               'unit_name', u.name, 'created_at', st.created_at,
               'item_name', st.item_name, 'client_name', st.client_name,
               'price_sold', st.price_sold, 'commission_amount', st.commission_amount,
               'daily_production_id', st.daily_production_id,
               'subscription_action', st.subscription_action
             ) AS r
      FROM public.sale_transactions st
      LEFT JOIN public.barbers b ON b.id = st.barber_id
      LEFT JOIN public.units u ON u.id = COALESCE(st.unit_id, b.unit_id)
      WHERE st.organization_id = v_org
        AND st.item_type = 'subscription'
        AND COALESCE(st.commission_amount, 0) <> 0
        AND st.created_at >= v_from AND st.created_at <= v_to
        AND (p_unit_id IS NULL OR st.unit_id = p_unit_id OR b.unit_id = p_unit_id)
      ORDER BY st.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) q;

  ELSIF p_check_key = 'orphan_sales' THEN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'transaction_id', st.id, 'barber_id', st.barber_id,
               'barber_name', COALESCE(b.name, 'Recepção'),
               'unit_name', u.name, 'created_at', st.created_at,
               'item_name', st.item_name, 'item_type', st.item_type,
               'client_name', st.client_name, 'price_sold', st.price_sold,
               'commission_amount', st.commission_amount, 'source', st.source
             ) AS r
      FROM public.sale_transactions st
      LEFT JOIN public.barbers b ON b.id = st.barber_id
      LEFT JOIN public.units u ON u.id = COALESCE(st.unit_id, b.unit_id)
      WHERE st.organization_id = v_org
        AND st.barber_id IS NOT NULL
        AND st.daily_production_id IS NULL
        AND st.created_at >= v_from AND st.created_at <= v_to
        AND (p_unit_id IS NULL OR st.unit_id = p_unit_id OR b.unit_id = p_unit_id)
      ORDER BY st.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) q;

  ELSIF p_check_key = 'subscription_no_phone' THEN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'transaction_id', st.id, 'barber_id', st.barber_id,
               'barber_name', COALESCE(b.name, 'Recepção'),
               'unit_name', u.name, 'created_at', st.created_at,
               'item_name', st.item_name, 'client_name', st.client_name,
               'price_sold', st.price_sold, 'attribution_source', st.attribution_source,
               'daily_production_id', st.daily_production_id
             ) AS r
      FROM public.sale_transactions st
      LEFT JOIN public.barbers b ON b.id = st.barber_id
      LEFT JOIN public.units u ON u.id = COALESCE(st.unit_id, b.unit_id)
      WHERE st.organization_id = v_org
        AND st.item_type = 'subscription'
        AND st.subscription_action IN ('new', 'new_member')
        AND COALESCE(st.mobile_phone, '') = ''
        AND st.created_at >= v_from AND st.created_at <= v_to
        AND (p_unit_id IS NULL OR st.unit_id = p_unit_id OR b.unit_id = p_unit_id)
      ORDER BY st.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) q;

  ELSIF p_check_key = 'production_mismatch' THEN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
               'daily_production_id', dp.id, 'barber_id', dp.barber_id,
               'barber_name', b.name, 'unit_name', u.name, 'date', dp.date,
               'tx_total', COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0),
               'sales_total', COALESCE(t.s, 0),
               'diff', (COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0)) - COALESCE(t.s, 0)
             ) AS r
      FROM public.daily_productions dp
      JOIN public.barbers b ON b.id = dp.barber_id
      JOIN public.units u ON u.id = b.unit_id
      LEFT JOIN (
        SELECT daily_production_id, sum(price_sold) AS s
        FROM public.sale_transactions
        WHERE item_type <> 'subscription' AND daily_production_id IS NOT NULL
        GROUP BY daily_production_id
      ) t ON t.daily_production_id = dp.id
      WHERE dp.organization_id = v_org
        AND dp.date BETWEEN p_start AND p_end
        AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
        AND abs(
          COALESCE(dp.tx_basic_total, 0) + COALESCE(dp.tx_extra_total, 0) + COALESCE(dp.tx_products_total, 0)
          - COALESCE(t.s, 0)
        ) > 0.01
      ORDER BY dp.date DESC, b.name
      LIMIT p_limit OFFSET p_offset
    ) q;
  END IF;

  RETURN jsonb_build_object('check_key', p_check_key, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.get_report_audit_findings(date, date, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_audit_finding_rows(text, date, date, uuid, int, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_report_audit_findings(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_finding_rows(text, date, date, uuid, int, int, uuid) TO authenticated;
