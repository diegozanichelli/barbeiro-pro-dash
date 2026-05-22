-- Adjust origin inference rule:
-- 1) Prefer barber unit only when client has a barber unit with frequency > 2.
-- 2) Otherwise fallback to the unit of the last sale.

CREATE OR REPLACE FUNCTION public.suggest_client_origin_units(p_organization_id uuid)
RETURNS TABLE (
  client_id uuid,
  suggested_unit_id uuid,
  suggested_unit_name text,
  confidence_count integer,
  basis text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF has_role(auth.uid(), 'manager'::app_role) AND get_user_organization(auth.uid()) <> p_organization_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT c.id, c.mobile_phone
    FROM clients c
    WHERE c.organization_id = p_organization_id
      AND c.subscription_unit_id IS NULL
      AND c.mobile_phone IS NOT NULL
      AND c.mobile_phone <> ''
  ),
  barber_counts AS (
    SELECT t.id AS client_id, b.unit_id, COUNT(*)::int AS cnt
    FROM targets t
    JOIN sale_transactions st
      ON st.organization_id = p_organization_id
     AND st.mobile_phone = t.mobile_phone
     AND st.barber_id IS NOT NULL
    JOIN barbers b ON b.id = st.barber_id
    WHERE b.unit_id IS NOT NULL
    GROUP BY t.id, b.unit_id
  ),
  ranked_barber AS (
    SELECT bc.client_id, bc.unit_id, bc.cnt,
           ROW_NUMBER() OVER (PARTITION BY bc.client_id ORDER BY bc.cnt DESC, bc.unit_id) AS rn
    FROM barber_counts bc
    WHERE bc.cnt > 2
  ),
  primary_barber AS (
    SELECT rb.client_id, rb.unit_id, rb.cnt
    FROM ranked_barber rb
    WHERE rb.rn = 1
  ),
  last_sale AS (
    SELECT DISTINCT ON (t.id) t.id AS client_id, st.unit_id, 1 AS cnt
    FROM targets t
    JOIN sale_transactions st
      ON st.organization_id = p_organization_id
     AND st.mobile_phone = t.mobile_phone
     AND st.unit_id IS NOT NULL
    LEFT JOIN primary_barber pb ON pb.client_id = t.id
    WHERE pb.client_id IS NULL
    ORDER BY t.id, st.created_at DESC
  ),
  combined AS (
    SELECT pb.client_id, pb.unit_id, pb.cnt, 'barber_frequency'::text AS basis FROM primary_barber pb
    UNION ALL
    SELECT ls.client_id, ls.unit_id, ls.cnt, 'last_sale'::text AS basis FROM last_sale ls
  )
  SELECT
    cb.client_id,
    cb.unit_id AS suggested_unit_id,
    u.name AS suggested_unit_name,
    cb.cnt AS confidence_count,
    cb.basis
  FROM combined cb
  JOIN units u ON u.id = cb.unit_id;
END;
$$;
