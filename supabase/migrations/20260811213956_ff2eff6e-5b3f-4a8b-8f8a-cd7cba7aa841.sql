CREATE OR REPLACE FUNCTION public.get_inactive_clients(
  p_unit_id uuid DEFAULT NULL,
  p_barber_id uuid DEFAULT NULL,
  p_ref_date date DEFAULT NULL
)
RETURNS TABLE(
  mobile_phone text,
  client_name text,
  is_subscriber boolean,
  last_visit date,
  previous_visit date,
  days_inactive integer,
  bucket text,
  last_barber_name text,
  last_unit_name text,
  visits integer,
  total_spent numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_ref date;
BEGIN
  v_org := public.get_user_organization(auth.uid());
  IF v_org IS NULL THEN
    RETURN;
  END IF;
  IF NOT (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RETURN;
  END IF;

  v_ref := COALESCE(p_ref_date, (now() AT TIME ZONE 'America/Manaus')::date);

  RETURN QUERY
  WITH tx AS (
    SELECT
      st.mobile_phone,
      st.client_name,
      st.barber_id,
      st.unit_id,
      st.price_sold,
      (st.created_at AT TIME ZONE 'America/Manaus')::date AS visit_date,
      st.created_at
    FROM public.sale_transactions st
    WHERE st.organization_id = v_org
      AND st.mobile_phone IS NOT NULL
      AND st.mobile_phone <> ''
      AND (p_unit_id IS NULL OR st.unit_id = p_unit_id)
      AND (p_barber_id IS NULL OR st.barber_id = p_barber_id)
  ),
  agg AS (
    SELECT
      t.mobile_phone,
      SUM(t.price_sold) AS total_spent,
      COUNT(DISTINCT t.visit_date) AS visits,
      MAX(t.visit_date) AS last_visit,
      (ARRAY_AGG(DISTINCT t.visit_date ORDER BY t.visit_date DESC))[2] AS previous_visit,
      (ARRAY_AGG(t.client_name ORDER BY t.created_at DESC))[1] AS client_name,
      (ARRAY_AGG(t.barber_id ORDER BY t.created_at DESC))[1] AS last_barber_id,
      (ARRAY_AGG(t.unit_id ORDER BY t.created_at DESC))[1] AS last_unit_id
    FROM tx t
    GROUP BY t.mobile_phone
  )
  SELECT
    a.mobile_phone,
    COALESCE(c.name, a.client_name, 'Sem nome') AS client_name,
    (c.subscription_plan_id IS NOT NULL) AS is_subscriber,
    a.last_visit,
    a.previous_visit,
    (v_ref - a.last_visit)::int AS days_inactive,
    CASE
      WHEN (v_ref - a.last_visit) >= 90 THEN '90_plus'
      WHEN (v_ref - a.last_visit) >= 60 THEN '60_89'
      ELSE '30_59'
    END AS bucket,
    b.name AS last_barber_name,
    u.name AS last_unit_name,
    a.visits::int,
    ROUND(COALESCE(a.total_spent, 0), 2) AS total_spent
  FROM agg a
  LEFT JOIN public.clients c
    ON c.organization_id = v_org AND c.mobile_phone = a.mobile_phone
  LEFT JOIN public.barbers b ON b.id = a.last_barber_id
  LEFT JOIN public.units u ON u.id = a.last_unit_id
  WHERE (v_ref - a.last_visit) >= 30
  ORDER BY a.total_spent DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inactive_clients(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inactive_clients(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inactive_clients(uuid, uuid, date) TO service_role;