
-- Precisa dropar antes porque o retorno mudou
DROP FUNCTION IF EXISTS public.apply_auto_origin_units(uuid);
DROP FUNCTION IF EXISTS public.suggest_client_origin_units(uuid);

CREATE OR REPLACE FUNCTION public.suggest_client_origin_units(p_organization_id uuid)
RETURNS TABLE (
  client_id uuid,
  suggested_unit_id uuid,
  suggested_unit_name text,
  suggested_barber_id uuid,
  suggested_barber_name text,
  basis text,
  recent_visits int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH client_phones AS (
    SELECT c.id AS cid, c.mobile_phone
    FROM public.clients c
    WHERE c.organization_id = p_organization_id
      AND c.mobile_phone IS NOT NULL
      AND length(btrim(c.mobile_phone)) > 0
  ),
  recent_services AS (
    SELECT
      cp.cid,
      st.barber_id,
      st.created_at,
      ROW_NUMBER() OVER (PARTITION BY cp.cid ORDER BY st.created_at DESC) AS rn
    FROM client_phones cp
    JOIN public.sale_transactions st
      ON st.organization_id = p_organization_id
     AND st.mobile_phone = cp.mobile_phone
     AND st.item_type = 'service'
     AND st.barber_id IS NOT NULL
  ),
  last3 AS (
    SELECT * FROM recent_services WHERE rn <= 3
  ),
  totals AS (
    SELECT cid, COUNT(*)::int AS visits FROM last3 GROUP BY cid
  ),
  per_barber AS (
    SELECT
      l.cid,
      l.barber_id,
      COUNT(*)::int AS cnt,
      MAX(l.created_at) AS last_seen
    FROM last3 l
    GROUP BY l.cid, l.barber_id
  ),
  ranked AS (
    SELECT
      pb.cid,
      pb.barber_id,
      pb.cnt,
      pb.last_seen,
      t.visits,
      ROW_NUMBER() OVER (
        PARTITION BY pb.cid
        ORDER BY pb.cnt DESC, pb.last_seen DESC
      ) AS pos
    FROM per_barber pb
    JOIN totals t ON t.cid = pb.cid
  )
  SELECT
    r.cid AS client_id,
    b.unit_id AS suggested_unit_id,
    u.name AS suggested_unit_name,
    b.id AS suggested_barber_id,
    b.name AS suggested_barber_name,
    CASE
      WHEN r.visits = 1 THEN 'single_visit'
      WHEN r.cnt >= 2 THEN 'last3_majority'
      ELSE 'last3_tiebreak_recent'
    END AS basis,
    r.visits AS recent_visits
  FROM ranked r
  JOIN public.barbers b ON b.id = r.barber_id
  LEFT JOIN public.units u ON u.id = b.unit_id
  WHERE r.pos = 1
    AND b.unit_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_client_origin_units(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recompute_all_client_origins(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scanned int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
  v_no_history int := 0;
  v_total_clients int := 0;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'p_organization_id é obrigatório';
  END IF;

  SELECT COUNT(*) INTO v_total_clients
  FROM public.clients
  WHERE organization_id = p_organization_id;

  WITH suggestions AS (
    SELECT s.client_id, s.suggested_unit_id
    FROM public.suggest_client_origin_units(p_organization_id) s
  ),
  upd AS (
    UPDATE public.clients c
       SET subscription_unit_id = s.suggested_unit_id,
           updated_at = now()
      FROM suggestions s
     WHERE c.id = s.client_id
       AND c.organization_id = p_organization_id
       AND c.subscription_unit_id IS DISTINCT FROM s.suggested_unit_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM upd;

  SELECT COUNT(*) INTO v_scanned FROM public.suggest_client_origin_units(p_organization_id);
  v_unchanged := GREATEST(v_scanned - v_updated, 0);
  v_no_history := GREATEST(v_total_clients - v_scanned, 0);

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'no_history', v_no_history,
    'total_clients', v_total_clients
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_all_client_origins(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_auto_origin_units(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.recompute_all_client_origins(p_organization_id);
  RETURN jsonb_build_object(
    'updated_count', COALESCE((v_result->>'updated')::int, 0),
    'skipped_count', COALESCE((v_result->>'no_history')::int, 0),
    'scanned', COALESCE((v_result->>'scanned')::int, 0),
    'unchanged', COALESCE((v_result->>'unchanged')::int, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_auto_origin_units(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.client_origin_recompute_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid,
  scanned int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  unchanged int NOT NULL DEFAULT 0,
  no_history int NOT NULL DEFAULT 0,
  duration_ms int,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.client_origin_recompute_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage origin recompute logs" ON public.client_origin_recompute_logs;
CREATE POLICY "Super admins manage origin recompute logs"
  ON public.client_origin_recompute_logs
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Managers view own org origin recompute logs" ON public.client_origin_recompute_logs;
CREATE POLICY "Managers view own org origin recompute logs"
  ON public.client_origin_recompute_logs
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id = get_user_organization(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_origin_recompute_logs_ran_at
  ON public.client_origin_recompute_logs (ran_at DESC);
