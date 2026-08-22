
-- ============================================================
-- Inteligência de Assinaturas: schema-ready + RPC agregadora
-- ============================================================

-- 1. Colunas para registrar plano anterior em upgrade/downgrade
ALTER TABLE public.sale_transactions
  ADD COLUMN IF NOT EXISTS previous_plan_id uuid,
  ADD COLUMN IF NOT EXISTS previous_price numeric;

-- 2. Índice para acelerar queries da Inteligência (subs por org + período)
CREATE INDEX IF NOT EXISTS idx_sale_tx_subscription_intel
  ON public.sale_transactions (organization_id, item_type, created_at)
  WHERE item_type = 'subscription';

CREATE INDEX IF NOT EXISTS idx_sale_tx_new_clients_intel
  ON public.sale_transactions (organization_id, is_new_client, created_at)
  WHERE is_new_client = true;

-- 3. RPC agregadora — janela em America/Manaus, opcional por unidade
CREATE OR REPLACE FUNCTION public.get_subscription_intelligence(
  p_start_date date,
  p_end_date date,
  p_unit_id uuid DEFAULT NULL,
  p_source_filter text DEFAULT 'manager'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
  v_transactions jsonb;
BEGIN
  v_org := get_user_organization(auth.uid());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'User does not belong to any organization';
  END IF;

  -- Janela em Manaus convertida para timestamptz
  v_start_ts := (p_start_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Manaus';
  v_end_ts   := ((p_end_date + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Manaus';

  -- Contagens e receita por ação
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
        WHEN subscription_action IN ('upgrade','downgrade')
         AND previous_price IS NOT NULL
        THEN price_sold - previous_price
        ELSE 0
      END
    ), 0)
  INTO v_counts, v_revenue, v_mrr_delta
  FROM sale_transactions
  WHERE organization_id = v_org
    AND item_type = 'subscription'
    AND created_at >= v_start_ts
    AND created_at <  v_end_ts
    AND (p_source_filter IS NULL OR source = p_source_filter)
    AND (p_unit_id IS NULL OR unit_id = p_unit_id);

  -- Motivos de downgrade agrupados
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

  -- Funil: clientes novos únicos (por celular válido)
  SELECT COALESCE(COUNT(DISTINCT mobile_phone), 0)
  INTO v_total_new_clients
  FROM sale_transactions
  WHERE organization_id = v_org
    AND is_new_client = true
    AND mobile_phone IS NOT NULL
    AND mobile_phone <> ''
    AND created_at >= v_start_ts
    AND created_at <  v_end_ts
    AND (p_source_filter IS NULL OR source = p_source_filter)
    AND (p_unit_id IS NULL OR unit_id = p_unit_id);

  -- Numerador do funil: assinaturas para clientes novos
  -- (mesma definição estrita: precisa de mobile_phone para entrar)
  SELECT COALESCE(COUNT(*), 0)
  INTO v_new_subs_to_new
  FROM sale_transactions
  WHERE organization_id = v_org
    AND item_type = 'subscription'
    AND subscription_action = 'new'
    AND is_new_client = true
    AND mobile_phone IS NOT NULL
    AND mobile_phone <> ''
    AND created_at >= v_start_ts
    AND created_at <  v_end_ts
    AND (p_source_filter IS NULL OR source = p_source_filter)
    AND (p_unit_id IS NULL OR unit_id = p_unit_id);

  -- Lista de transações (limitada a 500 para a tabela de auditoria)
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t).created_at DESC), '[]'::jsonb)
  INTO v_transactions
  FROM (
    SELECT
      st.id,
      st.created_at,
      st.subscription_action,
      st.downgrade_reason,
      st.is_new_client,
      st.item_name,
      st.client_name,
      st.mobile_phone,
      st.price_sold,
      st.previous_price,
      st.source,
      st.subscription_plan_id,
      sp.name AS plan_name,
      st.previous_plan_id,
      pp.name AS previous_plan_name,
      st.unit_id,
      u.name AS unit_name,
      b.name AS barber_name
    FROM sale_transactions st
    LEFT JOIN subscription_plans sp ON sp.id = st.subscription_plan_id
    LEFT JOIN subscription_plans pp ON pp.id = st.previous_plan_id
    LEFT JOIN units u ON u.id = st.unit_id
    LEFT JOIN barbers b ON b.id = st.barber_id
    WHERE st.organization_id = v_org
      AND st.item_type = 'subscription'
      AND st.created_at >= v_start_ts
      AND st.created_at <  v_end_ts
      AND (p_source_filter IS NULL OR st.source = p_source_filter)
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
    ORDER BY st.created_at DESC
    LIMIT 500
  ) t;

  RETURN jsonb_build_object(
    'counts',                v_counts,
    'revenue',               v_revenue,
    'mrr_delta',             v_mrr_delta,
    'downgrade_reasons',     v_downgrade,
    'total_new_clients',     v_total_new_clients,
    'new_subs_to_new',       v_new_subs_to_new,
    'conversion_rate',       CASE WHEN v_total_new_clients > 0
                                  THEN ROUND((v_new_subs_to_new::numeric / v_total_new_clients) * 100, 1)
                                  ELSE 0 END,
    'transactions',          v_transactions,
    'window_start_manaus',   p_start_date,
    'window_end_manaus',     p_end_date
  );
END;
$$;

-- 4. Trigger para auto-popular previous_plan_id/previous_price em upgrade/downgrade
--    Olha a última assinatura ativa do mesmo celular naquele org.
CREATE OR REPLACE FUNCTION public.fill_previous_subscription_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_plan_id uuid;
  v_prev_price numeric;
BEGIN
  IF NEW.item_type <> 'subscription'
     OR NEW.subscription_action NOT IN ('upgrade','downgrade')
     OR NEW.mobile_phone IS NULL
     OR NEW.previous_plan_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT subscription_plan_id, price_sold
  INTO v_prev_plan_id, v_prev_price
  FROM sale_transactions
  WHERE organization_id = NEW.organization_id
    AND item_type = 'subscription'
    AND mobile_phone = NEW.mobile_phone
    AND subscription_plan_id IS NOT NULL
    AND created_at < COALESCE(NEW.created_at, now())
  ORDER BY created_at DESC
  LIMIT 1;

  NEW.previous_plan_id := v_prev_plan_id;
  NEW.previous_price   := v_prev_price;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_previous_subscription_plan ON public.sale_transactions;
CREATE TRIGGER trg_fill_previous_subscription_plan
  BEFORE INSERT ON public.sale_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_previous_subscription_plan();
