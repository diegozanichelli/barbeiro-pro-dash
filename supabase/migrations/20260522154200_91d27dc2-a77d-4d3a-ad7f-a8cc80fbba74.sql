
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
    SELECT client_id, unit_id, cnt,
           ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY cnt DESC) AS rn
    FROM barber_counts
  ),
  primary_barber AS (
    SELECT client_id, unit_id, cnt FROM ranked_barber WHERE rn = 1
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
    SELECT client_id, unit_id, cnt, 'barber_frequency'::text AS basis FROM primary_barber
    UNION ALL
    SELECT client_id, unit_id, cnt, 'last_sale'::text AS basis FROM last_sale
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

CREATE OR REPLACE FUNCTION public.apply_auto_origin_units(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
  v_total_no_origin int := 0;
BEGIN
  IF NOT (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF has_role(auth.uid(), 'manager'::app_role) AND get_user_organization(auth.uid()) <> p_organization_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*) INTO v_total_no_origin
  FROM clients
  WHERE organization_id = p_organization_id AND subscription_unit_id IS NULL;

  WITH suggestions AS (
    SELECT * FROM public.suggest_client_origin_units(p_organization_id)
  ),
  upd AS (
    UPDATE clients c
       SET subscription_unit_id = s.suggested_unit_id,
           updated_at = now()
      FROM suggestions s
     WHERE c.id = s.client_id
       AND c.organization_id = p_organization_id
       AND c.subscription_unit_id IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM upd;

  RETURN jsonb_build_object(
    'updated_count', v_updated,
    'skipped_count', GREATEST(v_total_no_origin - v_updated, 0),
    'total_no_origin', v_total_no_origin
  );
END;
$$;
