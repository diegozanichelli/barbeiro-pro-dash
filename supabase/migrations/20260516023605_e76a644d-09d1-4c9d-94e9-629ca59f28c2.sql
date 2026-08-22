-- A1. Rename fill trigger so it runs AFTER phone normalization (alphabetical order)
DROP TRIGGER IF EXISTS trg_fill_previous_subscription_plan ON public.sale_transactions;

-- A2. Update fill function: respect values provided by caller, fallback to clients table then history
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
  -- Only for upgrade/downgrade subscription rows
  IF NEW.item_type <> 'subscription'
     OR NEW.subscription_action NOT IN ('upgrade','downgrade') THEN
    RETURN NEW;
  END IF;

  -- Respect caller-provided values
  IF NEW.previous_plan_id IS NOT NULL AND NEW.previous_price IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Fallback 1: current plan on clients table (phone is already normalized at this point)
  IF NEW.mobile_phone IS NOT NULL AND NEW.mobile_phone <> '' THEN
    SELECT c.subscription_plan_id, sp.price
    INTO v_prev_plan_id, v_prev_price
    FROM clients c
    LEFT JOIN subscription_plans sp ON sp.id = c.subscription_plan_id
    WHERE c.organization_id = NEW.organization_id
      AND c.mobile_phone = NEW.mobile_phone
      AND c.subscription_plan_id IS NOT NULL
      AND c.subscription_plan_id <> COALESCE(NEW.subscription_plan_id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;
  END IF;

  -- Fallback 2: most recent prior subscription transaction for the same phone
  IF v_prev_plan_id IS NULL AND NEW.mobile_phone IS NOT NULL AND NEW.mobile_phone <> '' THEN
    SELECT subscription_plan_id, price_sold
    INTO v_prev_plan_id, v_prev_price
    FROM sale_transactions
    WHERE organization_id = NEW.organization_id
      AND item_type = 'subscription'
      AND mobile_phone = NEW.mobile_phone
      AND subscription_plan_id IS NOT NULL
      AND subscription_plan_id <> COALESCE(NEW.subscription_plan_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND created_at < COALESCE(NEW.created_at, now())
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF NEW.previous_plan_id IS NULL THEN NEW.previous_plan_id := v_prev_plan_id; END IF;
  IF NEW.previous_price   IS NULL THEN NEW.previous_price   := v_prev_price;   END IF;
  RETURN NEW;
END;
$$;

-- A3. Recreate trigger with new name so it runs after trg_normalize_phone_sale_transactions
CREATE TRIGGER trg_z_fill_previous_subscription_plan
BEFORE INSERT ON public.sale_transactions
FOR EACH ROW
EXECUTE FUNCTION public.fill_previous_subscription_plan();

-- A4. Backfill historical upgrades/downgrades
WITH candidates AS (
  SELECT st.id, st.organization_id, st.mobile_phone, st.subscription_plan_id, st.created_at
  FROM sale_transactions st
  WHERE st.item_type = 'subscription'
    AND st.subscription_action IN ('upgrade','downgrade')
    AND (st.previous_plan_id IS NULL OR st.previous_price IS NULL)
    AND st.mobile_phone IS NOT NULL AND st.mobile_phone <> ''
),
resolved AS (
  SELECT
    c.id,
    COALESCE(
      (SELECT cl.subscription_plan_id
         FROM clients cl
        WHERE cl.organization_id = c.organization_id
          AND cl.mobile_phone = c.mobile_phone
          AND cl.subscription_plan_id IS NOT NULL
          AND cl.subscription_plan_id <> c.subscription_plan_id
        LIMIT 1),
      (SELECT st2.subscription_plan_id
         FROM sale_transactions st2
        WHERE st2.organization_id = c.organization_id
          AND st2.item_type = 'subscription'
          AND st2.mobile_phone = c.mobile_phone
          AND st2.subscription_plan_id IS NOT NULL
          AND st2.subscription_plan_id <> c.subscription_plan_id
          AND st2.created_at < c.created_at
        ORDER BY st2.created_at DESC
        LIMIT 1)
    ) AS prev_plan_id,
    COALESCE(
      (SELECT sp.price FROM clients cl
         JOIN subscription_plans sp ON sp.id = cl.subscription_plan_id
        WHERE cl.organization_id = c.organization_id
          AND cl.mobile_phone = c.mobile_phone
          AND cl.subscription_plan_id IS NOT NULL
          AND cl.subscription_plan_id <> c.subscription_plan_id
        LIMIT 1),
      (SELECT st2.price_sold
         FROM sale_transactions st2
        WHERE st2.organization_id = c.organization_id
          AND st2.item_type = 'subscription'
          AND st2.mobile_phone = c.mobile_phone
          AND st2.subscription_plan_id IS NOT NULL
          AND st2.subscription_plan_id <> c.subscription_plan_id
          AND st2.created_at < c.created_at
        ORDER BY st2.created_at DESC
        LIMIT 1)
    ) AS prev_price
  FROM candidates c
)
UPDATE sale_transactions st
SET previous_plan_id = COALESCE(st.previous_plan_id, r.prev_plan_id),
    previous_price   = COALESCE(st.previous_price,   r.prev_price)
FROM resolved r
WHERE st.id = r.id
  AND (r.prev_plan_id IS NOT NULL OR r.prev_price IS NOT NULL);

-- D1. Extend RPC to expose known/unknown MRR delta counts
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

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t).created_at DESC), '[]'::jsonb)
  INTO v_transactions
  FROM (
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