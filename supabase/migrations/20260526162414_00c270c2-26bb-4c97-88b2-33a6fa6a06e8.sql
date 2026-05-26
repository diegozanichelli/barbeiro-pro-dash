-- 1) Novo RPC: portfolio overview (foto da carteira)
CREATE OR REPLACE FUNCTION public.get_subscription_portfolio_overview(p_unit_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_result jsonb;
BEGIN
  v_org := get_user_organization(auth.uid());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'User does not belong to any organization';
  END IF;

  SELECT jsonb_build_object(
    'mrr_total',         COALESCE(SUM(sp.price), 0),
    'active_subscribers',COALESCE(COUNT(*), 0),
    'legacy_count',      COALESCE(COUNT(*) FILTER (WHERE c.migrated_from_legacy = true), 0),
    'legacy_mrr',        COALESCE(SUM(sp.price) FILTER (WHERE c.migrated_from_legacy = true), 0),
    'app_acquired_count',COALESCE(COUNT(*) FILTER (WHERE c.migrated_from_legacy = false), 0),
    'app_acquired_mrr',  COALESCE(SUM(sp.price) FILTER (WHERE c.migrated_from_legacy = false), 0)
  )
  INTO v_result
  FROM clients c
  JOIN subscription_plans sp ON sp.id = c.subscription_plan_id
  WHERE c.organization_id = v_org
    AND c.subscription_plan_id IS NOT NULL
    AND sp.active = true
    AND (p_unit_id IS NULL OR c.subscription_unit_id = p_unit_id);

  RETURN COALESCE(v_result, jsonb_build_object(
    'mrr_total', 0, 'active_subscribers', 0,
    'legacy_count', 0, 'legacy_mrr', 0,
    'app_acquired_count', 0, 'app_acquired_mrr', 0
  ));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_subscription_portfolio_overview(uuid) TO authenticated;

-- 2) Estender get_subscription_intelligence para anexar linhas legadas (migrated) só na tabela
CREATE OR REPLACE FUNCTION public.get_subscription_intelligence(p_start_date date, p_end_date date, p_unit_id uuid DEFAULT NULL::uuid, p_source_filter text DEFAULT 'manager'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_counts jsonb;
  v_revenue jsonb;
  v_downgrade jsonb;
  v_total_new_clients integer := 0;
  v_new_subs_to_new integer := 0;
  v_mrr_delta numeric := 0;
  v_mrr_known integer := 0;
  v_mrr_unknown integer := 0;
  v_transactions jsonb;
BEGIN
  v_org := get_user_organization(auth.uid());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'User does not belong to any organization';
  END IF;

  v_start_ts := (p_start_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Manaus';
  v_end_ts   := ((p_end_date + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Manaus';

  SELECT
    jsonb_build_object(
      'new',       COALESCE(COUNT(*) FILTER (WHERE subscription_action = 'new'), 0),
      'renew',     COALESCE(COUNT(*) FILTER (WHERE subscription_action = 'renew'), 0),
      'upgrade',   COALESCE(COUNT(*) FILTER (WHERE subscription_action = 'upgrade'), 0),
      'downgrade', COALESCE(COUNT(*) FILTER (WHERE subscription_action = 'downgrade'), 0)
    ),
    jsonb_build_object(
      'new',       COALESCE(SUM(price_sold) FILTER (WHERE subscription_action = 'new'), 0),
      'renew',     COALESCE(SUM(price_sold) FILTER (WHERE subscription_action = 'renew'), 0),
      'upgrade',   COALESCE(SUM(price_sold) FILTER (WHERE subscription_action = 'upgrade'), 0),
      'downgrade', COALESCE(SUM(price_sold) FILTER (WHERE subscription_action = 'downgrade'), 0)
    ),
    COALESCE(SUM(
      CASE
        WHEN subscription_action IN ('upgrade','downgrade') AND previous_price IS NOT NULL
        THEN price_sold - previous_price ELSE 0
      END
    ), 0),
    COALESCE(COUNT(*) FILTER (WHERE subscription_action IN ('upgrade','downgrade') AND previous_price IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE subscription_action IN ('upgrade','downgrade') AND previous_price IS NULL), 0)
  INTO v_counts, v_revenue, v_mrr_delta, v_mrr_known, v_mrr_unknown
  FROM sale_transactions
  WHERE organization_id = v_org
    AND item_type = 'subscription'
    AND created_at >= v_start_ts
    AND created_at <  v_end_ts
    AND (p_source_filter IS NULL OR source = p_source_filter)
    AND (p_unit_id IS NULL OR unit_id = p_unit_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC), '[]'::jsonb)
  INTO v_downgrade
  FROM (
    SELECT
      COALESCE(NULLIF(TRIM(downgrade_reason), ''), 'Sem motivo informado') AS name,
      COUNT(*) AS value
    FROM sale_transactions
    WHERE organization_id = v_org
      AND item_type = 'subscription'
      AND subscription_action = 'downgrade'
      AND created_at >= v_start_ts
      AND created_at <  v_end_ts
      AND (p_source_filter IS NULL OR source = p_source_filter)
      AND (p_unit_id IS NULL OR unit_id = p_unit_id)
    GROUP BY 1
  ) d;

  SELECT COALESCE(COUNT(DISTINCT mobile_phone), 0)
  INTO v_total_new_clients
  FROM sale_transactions
  WHERE organization_id = v_org
    AND is_new_client = true
    AND mobile_phone IS NOT NULL AND mobile_phone <> ''
    AND created_at >= v_start_ts AND created_at <  v_end_ts
    AND (p_source_filter IS NULL OR source = p_source_filter)
    AND (p_unit_id IS NULL OR unit_id = p_unit_id);

  SELECT COALESCE(COUNT(*), 0)
  INTO v_new_subs_to_new
  FROM sale_transactions
  WHERE organization_id = v_org
    AND item_type = 'subscription'
    AND subscription_action = 'new'
    AND is_new_client = true
    AND mobile_phone IS NOT NULL AND mobile_phone <> ''
    AND created_at >= v_start_ts AND created_at <  v_end_ts
    AND (p_source_filter IS NULL OR source = p_source_filter)
    AND (p_unit_id IS NULL OR unit_id = p_unit_id);

  -- Movimentações + linhas neutras de importação legada (mesmo período)
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t).created_at DESC), '[]'::jsonb)
  INTO v_transactions
  FROM (
    (
      SELECT
        st.id, st.created_at, st.subscription_action, st.downgrade_reason, st.is_new_client,
        st.item_name, st.client_name, st.mobile_phone, st.price_sold, st.previous_price,
        st.source, st.subscription_plan_id, sp.name AS plan_name,
        st.previous_plan_id, pp.name AS previous_plan_name,
        st.unit_id, u.name AS unit_name, b.name AS barber_name
      FROM sale_transactions st
      LEFT JOIN subscription_plans sp ON sp.id = st.subscription_plan_id
      LEFT JOIN subscription_plans pp ON pp.id = st.previous_plan_id
      LEFT JOIN units u ON u.id = st.unit_id
      LEFT JOIN barbers b ON b.id = st.barber_id
      WHERE st.organization_id = v_org
        AND st.item_type = 'subscription'
        AND st.created_at >= v_start_ts AND st.created_at <  v_end_ts
        AND (p_source_filter IS NULL OR st.source = p_source_filter)
        AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
      ORDER BY st.created_at DESC
      LIMIT 500
    )
    UNION ALL
    (
      SELECT
        c.id,
        (c.subscription_started_at::text || ' 12:00:00')::timestamp AT TIME ZONE 'America/Manaus' AS created_at,
        'legacy_import'::text AS subscription_action,
        NULL::text AS downgrade_reason,
        false AS is_new_client,
        sp.name AS item_name,
        c.name AS client_name,
        c.mobile_phone,
        sp.price AS price_sold,
        NULL::numeric AS previous_price,
        'manager'::text AS source,
        c.subscription_plan_id,
        sp.name AS plan_name,
        NULL::uuid AS previous_plan_id,
        NULL::text AS previous_plan_name,
        c.subscription_unit_id AS unit_id,
        u.name AS unit_name,
        NULL::text AS barber_name
      FROM clients c
      JOIN subscription_plans sp ON sp.id = c.subscription_plan_id
      LEFT JOIN units u ON u.id = c.subscription_unit_id
      WHERE c.organization_id = v_org
        AND c.migrated_from_legacy = true
        AND c.subscription_started_at IS NOT NULL
        AND c.subscription_started_at BETWEEN p_start_date AND p_end_date
        AND (p_unit_id IS NULL OR c.subscription_unit_id = p_unit_id)
      LIMIT 500
    )
  ) t;

  RETURN jsonb_build_object(
    'counts', v_counts,
    'revenue', v_revenue,
    'mrr_delta', v_mrr_delta,
    'mrr_delta_known_count', v_mrr_known,
    'mrr_delta_unknown_count', v_mrr_unknown,
    'downgrade_reasons', v_downgrade,
    'total_new_clients', v_total_new_clients,
    'new_subs_to_new', v_new_subs_to_new,
    'conversion_rate', CASE WHEN v_total_new_clients > 0
                            THEN ROUND((v_new_subs_to_new::numeric / v_total_new_clients) * 100, 1)
                            ELSE 0 END,
    'transactions', v_transactions,
    'window_start_manaus', p_start_date,
    'window_end_manaus', p_end_date
  );
END;
$function$;