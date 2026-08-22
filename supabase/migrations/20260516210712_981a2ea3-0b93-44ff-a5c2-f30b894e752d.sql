
CREATE OR REPLACE FUNCTION public.get_monthly_presentation(
  p_month integer,
  p_year integer,
  p_unit_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_first date := make_date(p_year, p_month, 1);
  v_last date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_prev_first date := (v_first - interval '1 month')::date;
  v_prev_last date := (v_first - interval '1 day')::date;

  v_kpis jsonb;
  v_kpis_prev jsonb;
  v_goals jsonb;
  v_ranking jsonb;
  v_units jsonb;
  v_new_clients jsonb;
  v_sub_funnel jsonb;
  v_sub_health jsonb;
  v_revenue_mix jsonb;
  v_top_extras jsonb;
  v_top_products jsonb;
  v_best_day jsonb;
  v_alerts jsonb;
  v_next_target numeric := 0;
  v_org_name text;

  v_individual_evolution jsonb;
  v_weekday_heatmap jsonb;
  v_month_comparison jsonb;
  v_top_services_sold jsonb;
  v_top_products_sold jsonb;
  v_extras_penetration jsonb;
  v_product_sellers_ranking jsonb;
  v_reception_sales jsonb;
  v_clients_new_vs_returning jsonb;
  v_visit_frequency jsonb;
  v_top_subscription_sellers jsonb;
  v_previous_month_goals jsonb;
  v_monthly_records jsonb;
BEGIN
  v_org := get_user_organization(auth.uid());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'User does not belong to any organization';
  END IF;

  SELECT name INTO v_org_name FROM organizations WHERE id = v_org;

  -- ============ KPIs do mês (e mês anterior) ============
  WITH dp AS (
    SELECT
      CASE
        WHEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0) > 0
          THEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0)
        WHEN d.services_basic_total IS NOT NULL OR d.services_extra_total IS NOT NULL
          THEN COALESCE(d.services_basic_total,0)+COALESCE(d.services_extra_total,0)+COALESCE(d.products_total,0)
        ELSE COALESCE(d.services_total,0)+COALESCE(d.products_total,0)
      END AS revenue,
      d.commission_earned, d.clients_count, d.barber_id
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
  )
  SELECT jsonb_build_object(
    'revenue', COALESCE(SUM(revenue),0),
    'commission', COALESCE(SUM(commission_earned),0),
    'clients', COALESCE(SUM(clients_count),0),
    'avg_ticket', CASE WHEN COALESCE(SUM(clients_count),0) > 0 THEN ROUND(SUM(revenue)/SUM(clients_count),2) ELSE 0 END
  ) INTO v_kpis FROM dp;

  WITH dp AS (
    SELECT
      CASE
        WHEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0) > 0
          THEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0)
        WHEN d.services_basic_total IS NOT NULL OR d.services_extra_total IS NOT NULL
          THEN COALESCE(d.services_basic_total,0)+COALESCE(d.services_extra_total,0)+COALESCE(d.products_total,0)
        ELSE COALESCE(d.services_total,0)+COALESCE(d.products_total,0)
      END AS revenue,
      d.commission_earned, d.clients_count
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_prev_first AND v_prev_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
  )
  SELECT jsonb_build_object(
    'revenue', COALESCE(SUM(revenue),0),
    'commission', COALESCE(SUM(commission_earned),0),
    'clients', COALESCE(SUM(clients_count),0),
    'avg_ticket', CASE WHEN COALESCE(SUM(clients_count),0) > 0 THEN ROUND(SUM(revenue)/SUM(clients_count),2) ELSE 0 END
  ) INTO v_kpis_prev FROM dp;

  -- ============ Metas batidas ============
  WITH comms AS (
    SELECT d.barber_id, SUM(d.commission_earned) AS earned
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY d.barber_id
  ),
  goals AS (
    SELECT mg.barber_id, mg.target_commission, b.name, u.name AS unit_name
    FROM monthly_goals mg
    INNER JOIN barbers b ON b.id = mg.barber_id
    LEFT JOIN units u ON u.id = b.unit_id
    WHERE mg.organization_id = v_org
      AND mg.month = p_month AND mg.year = p_year
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
      AND b.status = 'active'
  ),
  joined AS (
    SELECT g.barber_id, g.name, g.unit_name, g.target_commission,
           COALESCE(c.earned,0) AS earned,
           CASE WHEN g.target_commission > 0
                THEN ROUND(COALESCE(c.earned,0)*100/g.target_commission,1)
                ELSE 0 END AS percent
    FROM goals g LEFT JOIN comms c ON c.barber_id = g.barber_id
  )
  SELECT jsonb_build_object(
    'total_barbers', (SELECT COUNT(*) FROM joined),
    'hit_count', (SELECT COUNT(*) FROM joined WHERE earned >= target_commission AND target_commission > 0),
    'champions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', name, 'unit', unit_name, 'percent', percent, 'earned', earned, 'target', target_commission
      ) ORDER BY percent DESC)
      FROM joined WHERE earned >= target_commission AND target_commission > 0
    ), '[]'::jsonb)
  ) INTO v_goals;

  -- ============ Ranking top 10 ============
  WITH dp AS (
    SELECT d.barber_id, b.name, u.name AS unit_name,
      SUM(
        CASE
          WHEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0) > 0
            THEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0)
          WHEN d.services_basic_total IS NOT NULL OR d.services_extra_total IS NOT NULL
            THEN COALESCE(d.services_basic_total,0)+COALESCE(d.services_extra_total,0)+COALESCE(d.products_total,0)
          ELSE COALESCE(d.services_total,0)+COALESCE(d.products_total,0)
        END
      ) AS revenue,
      SUM(d.commission_earned) AS commission,
      SUM(d.clients_count) AS clients
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    LEFT JOIN units u ON u.id = b.unit_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY d.barber_id, b.name, u.name
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'barber_id', dp.barber_id, 'name', dp.name, 'unit', dp.unit_name,
    'revenue', dp.revenue, 'commission', dp.commission, 'clients', dp.clients,
    'target', COALESCE(mg.target_commission, 0),
    'percent', CASE WHEN COALESCE(mg.target_commission,0) > 0
                    THEN ROUND(dp.commission*100/mg.target_commission,1) ELSE 0 END
  ) ORDER BY dp.revenue DESC), '[]'::jsonb)
  INTO v_ranking
  FROM (SELECT * FROM dp ORDER BY revenue DESC LIMIT 10) dp
  LEFT JOIN monthly_goals mg ON mg.barber_id = dp.barber_id
    AND mg.month = p_month AND mg.year = p_year;

  -- ============ Performance por unidade ============
  WITH dp AS (
    SELECT b.unit_id, u.name AS unit_name,
      SUM(
        CASE
          WHEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0) > 0
            THEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0)
          WHEN d.services_basic_total IS NOT NULL OR d.services_extra_total IS NOT NULL
            THEN COALESCE(d.services_basic_total,0)+COALESCE(d.services_extra_total,0)+COALESCE(d.products_total,0)
          ELSE COALESCE(d.services_total,0)+COALESCE(d.products_total,0)
        END
      ) AS revenue,
      SUM(d.commission_earned) AS commission,
      SUM(d.clients_count) AS clients
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    LEFT JOIN units u ON u.id = b.unit_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY b.unit_id, u.name
  ),
  targets AS (
    SELECT b.unit_id, SUM(mg.target_commission) AS unit_target
    FROM monthly_goals mg INNER JOIN barbers b ON b.id = mg.barber_id
    WHERE mg.organization_id = v_org
      AND mg.month = p_month AND mg.year = p_year
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY b.unit_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'unit_id', dp.unit_id, 'name', dp.unit_name,
    'revenue', dp.revenue, 'commission', dp.commission, 'clients', dp.clients,
    'avg_ticket', CASE WHEN dp.clients > 0 THEN ROUND(dp.revenue/dp.clients,2) ELSE 0 END,
    'target', COALESCE(t.unit_target,0),
    'percent', CASE WHEN COALESCE(t.unit_target,0) > 0
                    THEN ROUND(dp.commission*100/t.unit_target,1) ELSE 0 END
  ) ORDER BY dp.revenue DESC), '[]'::jsonb)
  INTO v_units
  FROM dp LEFT JOIN targets t ON t.unit_id = dp.unit_id;

  -- ============ Clientes novos ============
  WITH cur AS (
    SELECT COUNT(DISTINCT st.mobile_phone) AS total,
      u.name AS unit_name, b.unit_id
    FROM sale_transactions st
    LEFT JOIN barbers b ON b.id = st.barber_id
    LEFT JOIN units u ON u.id = COALESCE(st.unit_id, b.unit_id)
    WHERE st.organization_id = v_org
      AND st.is_new_client = true
      AND st.mobile_phone IS NOT NULL AND st.mobile_phone <> ''
      AND st.source = 'manager'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR COALESCE(st.unit_id, b.unit_id) = p_unit_id)
    GROUP BY u.name, b.unit_id
  ),
  cur_total AS (
    SELECT COUNT(DISTINCT st.mobile_phone) AS total
    FROM sale_transactions st
    LEFT JOIN barbers b ON b.id = st.barber_id
    WHERE st.organization_id = v_org
      AND st.is_new_client = true
      AND st.mobile_phone IS NOT NULL AND st.mobile_phone <> ''
      AND st.source = 'manager'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR COALESCE(st.unit_id, b.unit_id) = p_unit_id)
  ),
  prev_total AS (
    SELECT COUNT(DISTINCT st.mobile_phone) AS total
    FROM sale_transactions st
    LEFT JOIN barbers b ON b.id = st.barber_id
    WHERE st.organization_id = v_org
      AND st.is_new_client = true
      AND st.mobile_phone IS NOT NULL AND st.mobile_phone <> ''
      AND st.source = 'manager'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_prev_first AND v_prev_last
      AND (p_unit_id IS NULL OR COALESCE(st.unit_id, b.unit_id) = p_unit_id)
  )
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT total FROM cur_total),0),
    'previous_total', COALESCE((SELECT total FROM prev_total),0),
    'by_unit', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('unit', COALESCE(unit_name,'Sem unidade'), 'value', total) ORDER BY total DESC)
      FROM cur
    ), '[]'::jsonb)
  ) INTO v_new_clients;

  -- ============ Funil de conversão de novos em assinantes ============
  WITH new_clients AS (
    SELECT COUNT(DISTINCT mobile_phone) AS total
    FROM sale_transactions
    WHERE organization_id = v_org
      AND is_new_client = true
      AND mobile_phone IS NOT NULL AND mobile_phone <> ''
      AND source = 'manager'
      AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR unit_id = p_unit_id)
  ),
  new_subs AS (
    SELECT COUNT(*) AS total
    FROM sale_transactions
    WHERE organization_id = v_org
      AND item_type = 'subscription'
      AND subscription_action = 'new'
      AND is_new_client = true
      AND mobile_phone IS NOT NULL AND mobile_phone <> ''
      AND source = 'manager'
      AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR unit_id = p_unit_id)
  )
  SELECT jsonb_build_object(
    'new_clients', COALESCE((SELECT total FROM new_clients),0),
    'new_subscriptions', COALESCE((SELECT total FROM new_subs),0),
    'conversion_rate', CASE WHEN COALESCE((SELECT total FROM new_clients),0) > 0
                            THEN ROUND((SELECT total FROM new_subs)::numeric*100/(SELECT total FROM new_clients),1)
                            ELSE 0 END
  ) INTO v_sub_funnel;

  -- ============ Saúde de assinaturas ============
  SELECT jsonb_build_object(
    'new', COALESCE(COUNT(*) FILTER (WHERE subscription_action='new'),0),
    'renew', COALESCE(COUNT(*) FILTER (WHERE subscription_action='renew'),0),
    'upgrade', COALESCE(COUNT(*) FILTER (WHERE subscription_action='upgrade'),0),
    'downgrade', COALESCE(COUNT(*) FILTER (WHERE subscription_action='downgrade'),0),
    'mrr_delta', COALESCE(SUM(
      CASE WHEN subscription_action IN ('upgrade','downgrade') AND previous_price IS NOT NULL
           THEN price_sold - previous_price ELSE 0 END
    ),0),
    'top_downgrade_reasons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('reason', reason, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT COALESCE(NULLIF(TRIM(downgrade_reason),''),'Sem motivo informado') AS reason, COUNT(*) AS cnt
        FROM sale_transactions
        WHERE organization_id = v_org
          AND item_type = 'subscription'
          AND subscription_action = 'downgrade'
          AND source = 'manager'
          AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
          AND (p_unit_id IS NULL OR unit_id = p_unit_id)
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5
      ) x
    ), '[]'::jsonb)
  ) INTO v_sub_health
  FROM sale_transactions
  WHERE organization_id = v_org
    AND item_type = 'subscription'
    AND source = 'manager'
    AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
    AND (p_unit_id IS NULL OR unit_id = p_unit_id);

  -- ============ Mix de receita ============
  SELECT jsonb_build_object(
    'basic', COALESCE(SUM(price_sold) FILTER (WHERE item_type='service' AND service_category='basic'),0),
    'extra', COALESCE(SUM(price_sold) FILTER (WHERE item_type='service' AND service_category='extra'),0),
    'products', COALESCE(SUM(price_sold) FILTER (WHERE item_type='product'),0)
  ) INTO v_revenue_mix
  FROM sale_transactions
  WHERE organization_id = v_org
    AND source = 'manager'
    AND item_type IN ('service','product')
    AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
    AND (p_unit_id IS NULL OR unit_id = p_unit_id);

  -- ============ Top vendedores de extras ============
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t).total DESC), '[]'::jsonb)
  INTO v_top_extras
  FROM (
    SELECT b.name, COUNT(*) AS qty, COALESCE(SUM(st.price_sold),0) AS total
    FROM sale_transactions st
    INNER JOIN barbers b ON b.id = st.barber_id
    WHERE st.organization_id = v_org
      AND st.source = 'manager'
      AND st.item_type = 'service' AND st.service_category = 'extra'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
    GROUP BY b.name
    ORDER BY total DESC LIMIT 3
  ) t;

  -- ============ Top vendedores de produtos ============
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t).total DESC), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT b.name, COUNT(*) AS qty, COALESCE(SUM(st.price_sold),0) AS total
    FROM sale_transactions st
    INNER JOIN barbers b ON b.id = st.barber_id
    WHERE st.organization_id = v_org
      AND st.source = 'manager'
      AND st.item_type = 'product'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
    GROUP BY b.name
    ORDER BY total DESC LIMIT 3
  ) t;

  -- ============ Melhor dia do mês ============
  WITH by_day AS (
    SELECT d.date,
      SUM(
        CASE
          WHEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0) > 0
            THEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0)
          WHEN d.services_basic_total IS NOT NULL OR d.services_extra_total IS NOT NULL
            THEN COALESCE(d.services_basic_total,0)+COALESCE(d.services_extra_total,0)+COALESCE(d.products_total,0)
          ELSE COALESCE(d.services_total,0)+COALESCE(d.products_total,0)
        END
      ) AS revenue,
      SUM(d.clients_count) AS clients
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY d.date
    ORDER BY revenue DESC LIMIT 1
  ),
  star AS (
    SELECT b.name, SUM(d.commission_earned) AS commission
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date = (SELECT date FROM by_day)
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY b.name
    ORDER BY commission DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'date', (SELECT date FROM by_day),
    'revenue', COALESCE((SELECT revenue FROM by_day),0),
    'clients', COALESCE((SELECT clients FROM by_day),0),
    'star_barber', (SELECT name FROM star),
    'star_commission', COALESCE((SELECT commission FROM star),0)
  ) INTO v_best_day;

  -- ============ Alertas (barbeiros < 85% pacing) ============
  WITH comms AS (
    SELECT d.barber_id, SUM(d.commission_earned) AS earned
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY d.barber_id
  ),
  underperf AS (
    SELECT b.name, u.name AS unit_name, COALESCE(c.earned,0) AS earned, mg.target_commission,
      ROUND(COALESCE(c.earned,0)*100/NULLIF(mg.target_commission,0),1) AS percent
    FROM monthly_goals mg
    INNER JOIN barbers b ON b.id = mg.barber_id
    LEFT JOIN units u ON u.id = b.unit_id
    LEFT JOIN comms c ON c.barber_id = mg.barber_id
    WHERE mg.organization_id = v_org
      AND mg.month = p_month AND mg.year = p_year
      AND b.status = 'active'
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
      AND mg.target_commission > 0
      AND COALESCE(c.earned,0) < mg.target_commission * 0.85
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t).percent ASC), '[]'::jsonb)
  INTO v_alerts FROM underperf t;

  -- ============ Meta total do próximo mês ============
  SELECT COALESCE(SUM(mg.target_commission), 0)
  INTO v_next_target
  FROM monthly_goals mg
  INNER JOIN barbers b ON b.id = mg.barber_id
  WHERE mg.organization_id = v_org
    AND ((mg.month = p_month + 1 AND mg.year = p_year AND p_month < 12)
      OR (mg.month = 1 AND mg.year = p_year + 1 AND p_month = 12))
    AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    AND b.status = 'active';

  -- ============================================================
  -- NOVOS BLOCOS
  -- ============================================================

  -- ============ Evolução individual (mês vs mês anterior) ============
  WITH cur AS (
    SELECT d.barber_id, b.name,
      SUM(
        CASE
          WHEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0) > 0
            THEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0)
          WHEN d.services_basic_total IS NOT NULL OR d.services_extra_total IS NOT NULL
            THEN COALESCE(d.services_basic_total,0)+COALESCE(d.services_extra_total,0)+COALESCE(d.products_total,0)
          ELSE COALESCE(d.services_total,0)+COALESCE(d.products_total,0)
        END
      ) AS revenue,
      SUM(d.clients_count) AS clients
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY d.barber_id, b.name
  ),
  prev AS (
    SELECT d.barber_id,
      SUM(
        CASE
          WHEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0) > 0
            THEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0)
          WHEN d.services_basic_total IS NOT NULL OR d.services_extra_total IS NOT NULL
            THEN COALESCE(d.services_basic_total,0)+COALESCE(d.services_extra_total,0)+COALESCE(d.products_total,0)
          ELSE COALESCE(d.services_total,0)+COALESCE(d.products_total,0)
        END
      ) AS revenue,
      SUM(d.clients_count) AS clients
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_prev_first AND v_prev_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY d.barber_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'barber_id', c.barber_id,
    'name', c.name,
    'revenue_curr', c.revenue,
    'revenue_prev', COALESCE(p.revenue, 0),
    'delta_pct', CASE WHEN COALESCE(p.revenue,0) > 0
                      THEN ROUND((c.revenue - p.revenue) * 100.0 / p.revenue, 1)
                      ELSE NULL END,
    'clients_curr', c.clients,
    'clients_prev', COALESCE(p.clients, 0),
    'ticket_curr', CASE WHEN c.clients > 0 THEN ROUND(c.revenue/c.clients, 2) ELSE 0 END,
    'ticket_prev', CASE WHEN COALESCE(p.clients,0) > 0 THEN ROUND(p.revenue/p.clients, 2) ELSE 0 END
  ) ORDER BY c.revenue DESC), '[]'::jsonb)
  INTO v_individual_evolution
  FROM cur c LEFT JOIN prev p ON p.barber_id = c.barber_id;

  -- ============ Heatmap por dia da semana ============
  WITH by_date AS (
    SELECT d.date, EXTRACT(DOW FROM d.date)::int AS weekday,
      SUM(
        CASE
          WHEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0) > 0
            THEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0)
          WHEN d.services_basic_total IS NOT NULL OR d.services_extra_total IS NOT NULL
            THEN COALESCE(d.services_basic_total,0)+COALESCE(d.services_extra_total,0)+COALESCE(d.products_total,0)
          ELSE COALESCE(d.services_total,0)+COALESCE(d.products_total,0)
        END
      ) AS revenue
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY d.date
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'weekday', weekday,
    'total_revenue', total_revenue,
    'days_count', days_count,
    'avg_revenue', CASE WHEN days_count > 0 THEN ROUND(total_revenue/days_count, 2) ELSE 0 END
  ) ORDER BY weekday), '[]'::jsonb)
  INTO v_weekday_heatmap
  FROM (
    SELECT weekday, SUM(revenue) AS total_revenue, COUNT(DISTINCT date) AS days_count
    FROM by_date GROUP BY weekday
  ) x;

  -- ============ Comparativo M vs M-1 ============
  v_month_comparison := jsonb_build_object(
    'revenue', jsonb_build_object(
      'current', (v_kpis->>'revenue')::numeric,
      'previous', (v_kpis_prev->>'revenue')::numeric,
      'delta_pct', CASE WHEN (v_kpis_prev->>'revenue')::numeric > 0
                        THEN ROUND(((v_kpis->>'revenue')::numeric - (v_kpis_prev->>'revenue')::numeric) * 100.0 / (v_kpis_prev->>'revenue')::numeric, 1)
                        ELSE NULL END
    ),
    'clients', jsonb_build_object(
      'current', (v_kpis->>'clients')::numeric,
      'previous', (v_kpis_prev->>'clients')::numeric,
      'delta_pct', CASE WHEN (v_kpis_prev->>'clients')::numeric > 0
                        THEN ROUND(((v_kpis->>'clients')::numeric - (v_kpis_prev->>'clients')::numeric) * 100.0 / (v_kpis_prev->>'clients')::numeric, 1)
                        ELSE NULL END
    ),
    'ticket', jsonb_build_object(
      'current', (v_kpis->>'avg_ticket')::numeric,
      'previous', (v_kpis_prev->>'avg_ticket')::numeric,
      'delta_pct', CASE WHEN (v_kpis_prev->>'avg_ticket')::numeric > 0
                        THEN ROUND(((v_kpis->>'avg_ticket')::numeric - (v_kpis_prev->>'avg_ticket')::numeric) * 100.0 / (v_kpis_prev->>'avg_ticket')::numeric, 1)
                        ELSE NULL END
    ),
    'commission', jsonb_build_object(
      'current', (v_kpis->>'commission')::numeric,
      'previous', (v_kpis_prev->>'commission')::numeric,
      'delta_pct', CASE WHEN (v_kpis_prev->>'commission')::numeric > 0
                        THEN ROUND(((v_kpis->>'commission')::numeric - (v_kpis_prev->>'commission')::numeric) * 100.0 / (v_kpis_prev->>'commission')::numeric, 1)
                        ELSE NULL END
    )
  );

  -- ============ Top serviços vendidos ============
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', name, 'qty', qty, 'revenue', revenue
  ) ORDER BY qty DESC), '[]'::jsonb)
  INTO v_top_services_sold
  FROM (
    SELECT st.item_name AS name, COUNT(*) AS qty, COALESCE(SUM(st.price_sold),0) AS revenue
    FROM sale_transactions st
    WHERE st.organization_id = v_org
      AND st.source = 'manager'
      AND st.item_type = 'service'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
    GROUP BY st.item_name
    ORDER BY qty DESC LIMIT 5
  ) t;

  -- ============ Top produtos vendidos ============
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', name, 'qty', qty, 'revenue', revenue
  ) ORDER BY qty DESC), '[]'::jsonb)
  INTO v_top_products_sold
  FROM (
    SELECT st.item_name AS name, COUNT(*) AS qty, COALESCE(SUM(st.price_sold),0) AS revenue
    FROM sale_transactions st
    WHERE st.organization_id = v_org
      AND st.source = 'manager'
      AND st.item_type = 'product'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
    GROUP BY st.item_name
    ORDER BY qty DESC LIMIT 5
  ) t;

  -- ============ Penetração de extras ============
  WITH cur_clients AS (
    SELECT DISTINCT (st.created_at AT TIME ZONE 'America/Manaus')::date AS d, st.mobile_phone
    FROM sale_transactions st
    WHERE st.organization_id = v_org AND st.source='manager'
      AND st.item_type = 'service'
      AND st.mobile_phone IS NOT NULL AND st.mobile_phone <> ''
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
  ),
  cur_with_extra AS (
    SELECT DISTINCT (st.created_at AT TIME ZONE 'America/Manaus')::date AS d, st.mobile_phone
    FROM sale_transactions st
    WHERE st.organization_id = v_org AND st.source='manager'
      AND st.item_type = 'service' AND st.service_category = 'extra'
      AND st.mobile_phone IS NOT NULL AND st.mobile_phone <> ''
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
  ),
  prev_clients AS (
    SELECT DISTINCT (st.created_at AT TIME ZONE 'America/Manaus')::date AS d, st.mobile_phone
    FROM sale_transactions st
    WHERE st.organization_id = v_org AND st.source='manager'
      AND st.item_type = 'service'
      AND st.mobile_phone IS NOT NULL AND st.mobile_phone <> ''
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_prev_first AND v_prev_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
  ),
  prev_with_extra AS (
    SELECT DISTINCT (st.created_at AT TIME ZONE 'America/Manaus')::date AS d, st.mobile_phone
    FROM sale_transactions st
    WHERE st.organization_id = v_org AND st.source='manager'
      AND st.item_type = 'service' AND st.service_category = 'extra'
      AND st.mobile_phone IS NOT NULL AND st.mobile_phone <> ''
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_prev_first AND v_prev_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
  )
  SELECT jsonb_build_object(
    'clients_with_extra', (SELECT COUNT(*) FROM cur_with_extra),
    'total_clients', (SELECT COUNT(*) FROM cur_clients),
    'pct_curr', CASE WHEN (SELECT COUNT(*) FROM cur_clients) > 0
                     THEN ROUND((SELECT COUNT(*) FROM cur_with_extra)::numeric * 100 / (SELECT COUNT(*) FROM cur_clients), 1)
                     ELSE 0 END,
    'pct_prev', CASE WHEN (SELECT COUNT(*) FROM prev_clients) > 0
                     THEN ROUND((SELECT COUNT(*) FROM prev_with_extra)::numeric * 100 / (SELECT COUNT(*) FROM prev_clients), 1)
                     ELSE 0 END
  ) INTO v_extras_penetration;

  -- ============ Ranking de venda de produtos (barbeiros) ============
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'barber_name', name, 'qty', qty, 'revenue', revenue
  ) ORDER BY revenue DESC), '[]'::jsonb)
  INTO v_product_sellers_ranking
  FROM (
    SELECT b.name, COUNT(*) AS qty, COALESCE(SUM(st.price_sold),0) AS revenue
    FROM sale_transactions st
    INNER JOIN barbers b ON b.id = st.barber_id
    WHERE st.organization_id = v_org
      AND st.source = 'manager'
      AND st.item_type = 'product'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
    GROUP BY b.name
    ORDER BY revenue DESC LIMIT 5
  ) t;

  -- ============ Vendas da recepção (sem barber_id) por unidade ============
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'unit_name', unit_name, 'revenue', revenue, 'count', cnt
  ) ORDER BY revenue DESC), '[]'::jsonb)
  INTO v_reception_sales
  FROM (
    SELECT COALESCE(u.name, 'Sem unidade') AS unit_name,
           COUNT(*) AS cnt,
           COALESCE(SUM(st.price_sold), 0) AS revenue
    FROM sale_transactions st
    LEFT JOIN units u ON u.id = st.unit_id
    WHERE st.organization_id = v_org
      AND st.source = 'manager'
      AND st.barber_id IS NULL
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
    GROUP BY u.name
  ) t;

  -- ============ Novos vs Recorrentes ============
  WITH cur_new AS (
    SELECT COUNT(DISTINCT mobile_phone) AS total FROM sale_transactions
    WHERE organization_id = v_org AND source='manager'
      AND is_new_client = true
      AND mobile_phone IS NOT NULL AND mobile_phone <> ''
      AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR unit_id = p_unit_id)
  ),
  cur_ret AS (
    SELECT COUNT(DISTINCT mobile_phone) AS total FROM sale_transactions
    WHERE organization_id = v_org AND source='manager'
      AND COALESCE(is_new_client, false) = false
      AND item_type = 'service'
      AND mobile_phone IS NOT NULL AND mobile_phone <> ''
      AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR unit_id = p_unit_id)
  ),
  prev_new AS (
    SELECT COUNT(DISTINCT mobile_phone) AS total FROM sale_transactions
    WHERE organization_id = v_org AND source='manager'
      AND is_new_client = true
      AND mobile_phone IS NOT NULL AND mobile_phone <> ''
      AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_prev_first AND v_prev_last
      AND (p_unit_id IS NULL OR unit_id = p_unit_id)
  ),
  prev_ret AS (
    SELECT COUNT(DISTINCT mobile_phone) AS total FROM sale_transactions
    WHERE organization_id = v_org AND source='manager'
      AND COALESCE(is_new_client, false) = false
      AND item_type = 'service'
      AND mobile_phone IS NOT NULL AND mobile_phone <> ''
      AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_prev_first AND v_prev_last
      AND (p_unit_id IS NULL OR unit_id = p_unit_id)
  )
  SELECT jsonb_build_object(
    'new_curr', (SELECT total FROM cur_new),
    'returning_curr', (SELECT total FROM cur_ret),
    'new_prev', (SELECT total FROM prev_new),
    'returning_prev', (SELECT total FROM prev_ret)
  ) INTO v_clients_new_vs_returning;

  -- ============ Frequência ============
  WITH visits AS (
    SELECT mobile_phone, (created_at AT TIME ZONE 'America/Manaus')::date AS d
    FROM sale_transactions
    WHERE organization_id = v_org AND source='manager'
      AND item_type = 'service'
      AND mobile_phone IS NOT NULL AND mobile_phone <> ''
      AND (created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR unit_id = p_unit_id)
    GROUP BY mobile_phone, (created_at AT TIME ZONE 'America/Manaus')::date
  )
  SELECT jsonb_build_object(
    'unique_clients', COUNT(DISTINCT mobile_phone),
    'total_visits', COUNT(*),
    'avg_visits_per_client', CASE WHEN COUNT(DISTINCT mobile_phone) > 0
                                  THEN ROUND(COUNT(*)::numeric / COUNT(DISTINCT mobile_phone), 2)
                                  ELSE 0 END
  ) INTO v_visit_frequency
  FROM visits;

  -- ============ Top vendedores de assinatura ============
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'barber_name', name, 'new_subs_qty', qty, 'mrr_generated', mrr
  ) ORDER BY qty DESC), '[]'::jsonb)
  INTO v_top_subscription_sellers
  FROM (
    SELECT b.name, COUNT(*) AS qty, COALESCE(SUM(st.price_sold), 0) AS mrr
    FROM sale_transactions st
    INNER JOIN barbers b ON b.id = st.barber_id
    WHERE st.organization_id = v_org
      AND st.source = 'manager'
      AND st.item_type = 'subscription'
      AND st.subscription_action = 'new'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
    GROUP BY b.name
    ORDER BY qty DESC LIMIT 5
  ) t;

  -- ============ Metas do mês anterior (bateu vs não bateu) ============
  WITH comms_prev AS (
    SELECT d.barber_id, SUM(d.commission_earned) AS earned
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_prev_first AND v_prev_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY d.barber_id
  ),
  goals_prev AS (
    SELECT mg.barber_id, mg.target_commission, b.name, u.name AS unit_name
    FROM monthly_goals mg
    INNER JOIN barbers b ON b.id = mg.barber_id
    LEFT JOIN units u ON u.id = b.unit_id
    WHERE mg.organization_id = v_org
      AND mg.month = EXTRACT(MONTH FROM v_prev_first)::int
      AND mg.year = EXTRACT(YEAR FROM v_prev_first)::int
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
      AND b.status = 'active'
      AND mg.target_commission > 0
  ),
  joined AS (
    SELECT g.barber_id, g.name, g.unit_name, g.target_commission,
           COALESCE(c.earned, 0) AS earned,
           ROUND(COALESCE(c.earned,0) * 100 / g.target_commission, 1) AS pct
    FROM goals_prev g LEFT JOIN comms_prev c ON c.barber_id = g.barber_id
  )
  SELECT jsonb_build_object(
    'hit', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'barber', name, 'unit', unit_name, 'pct', pct, 'earned', earned, 'target', target_commission
      ) ORDER BY pct DESC)
      FROM joined WHERE earned >= target_commission
    ), '[]'::jsonb),
    'missed', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'barber', name, 'unit', unit_name, 'pct', pct, 'earned', earned, 'target', target_commission
      ) ORDER BY pct ASC)
      FROM joined WHERE earned < target_commission
    ), '[]'::jsonb)
  ) INTO v_previous_month_goals;

  -- ============ Recordes do mês ============
  WITH big_ticket AS (
    SELECT st.price_sold AS value, b.name AS barber, st.client_name AS client
    FROM sale_transactions st
    LEFT JOIN barbers b ON b.id = st.barber_id
    WHERE st.organization_id = v_org
      AND st.source = 'manager'
      AND (st.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
    ORDER BY st.price_sold DESC NULLS LAST LIMIT 1
  ),
  top_barber AS (
    SELECT b.name,
      SUM(
        CASE
          WHEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0) > 0
            THEN COALESCE(d.tx_basic_total,0)+COALESCE(d.tx_extra_total,0)+COALESCE(d.tx_products_total,0)
          WHEN d.services_basic_total IS NOT NULL OR d.services_extra_total IS NOT NULL
            THEN COALESCE(d.services_basic_total,0)+COALESCE(d.services_extra_total,0)+COALESCE(d.products_total,0)
          ELSE COALESCE(d.services_total,0)+COALESCE(d.products_total,0)
        END
      ) AS revenue
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
    GROUP BY b.name
    ORDER BY revenue DESC LIMIT 1
  ),
  best_streak_calc AS (
    SELECT b.name AS barber,
           d.date,
           ROW_NUMBER() OVER (PARTITION BY d.barber_id ORDER BY d.date)
             - (d.date - v_first) AS grp
    FROM daily_productions d
    INNER JOIN barbers b ON b.id = d.barber_id
    WHERE d.organization_id = v_org
      AND d.date BETWEEN v_first AND v_last
      AND d.commission_earned > 0
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
  ),
  best_streak AS (
    SELECT barber, COUNT(*) AS days
    FROM best_streak_calc
    GROUP BY barber, grp
    ORDER BY days DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'best_day', jsonb_build_object(
      'date', v_best_day->>'date',
      'revenue', (v_best_day->>'revenue')::numeric
    ),
    'biggest_ticket', jsonb_build_object(
      'value', COALESCE((SELECT value FROM big_ticket), 0),
      'barber', (SELECT barber FROM big_ticket),
      'client', (SELECT client FROM big_ticket)
    ),
    'best_streak', jsonb_build_object(
      'barber', (SELECT barber FROM best_streak),
      'days', COALESCE((SELECT days FROM best_streak), 0)
    ),
    'top_barber', jsonb_build_object(
      'name', (SELECT name FROM top_barber),
      'revenue', COALESCE((SELECT revenue FROM top_barber), 0)
    )
  ) INTO v_monthly_records;

  RETURN jsonb_build_object(
    'org_name', v_org_name,
    'month', p_month, 'year', p_year,
    'period_start', v_first, 'period_end', v_last,
    'kpis', v_kpis,
    'kpis_previous', v_kpis_prev,
    'goals', v_goals,
    'ranking', v_ranking,
    'units_performance', v_units,
    'new_clients', v_new_clients,
    'subscription_funnel', v_sub_funnel,
    'subscription_health', v_sub_health,
    'revenue_mix', v_revenue_mix,
    'top_extras', v_top_extras,
    'top_products', v_top_products,
    'best_day', v_best_day,
    'alerts', v_alerts,
    'next_month_target', v_next_target,
    'individual_evolution', v_individual_evolution,
    'weekday_heatmap', v_weekday_heatmap,
    'month_comparison', v_month_comparison,
    'top_services_sold', v_top_services_sold,
    'top_products_sold', v_top_products_sold,
    'extras_penetration', v_extras_penetration,
    'product_sellers_ranking', v_product_sellers_ranking,
    'reception_sales', v_reception_sales,
    'clients_new_vs_returning', v_clients_new_vs_returning,
    'visit_frequency', v_visit_frequency,
    'top_subscription_sellers', v_top_subscription_sellers,
    'previous_month_goals', v_previous_month_goals,
    'monthly_records', v_monthly_records
  );
END;
$$;
