-- Suggest and apply origin units for clients without subscription_unit_id

CREATE OR REPLACE FUNCTION public.suggest_client_origin_units(p_organization_id uuid)
RETURNS TABLE (
  client_id uuid,
  suggested_unit_id uuid,
  suggested_unit_name text,
  basis_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH targets AS (
    SELECT c.id, c.mobile_phone
    FROM clients c
    WHERE c.organization_id = p_organization_id
      AND c.subscription_unit_id IS NULL
      AND c.mobile_phone IS NOT NULL
      AND length(c.mobile_phone) > 0
  ),
  ranked AS (
    SELECT
      t.id AS client_id,
      st.unit_id,
      COUNT(*) AS cnt,
      ROW_NUMBER() OVER (PARTITION BY t.id ORDER BY COUNT(*) DESC, MAX(st.created_at) DESC) AS rn
    FROM targets t
    JOIN sale_transactions st
      ON st.organization_id = p_organization_id
     AND st.mobile_phone = t.mobile_phone
     AND st.unit_id IS NOT NULL
    GROUP BY t.id, st.unit_id
  )
  SELECT r.client_id, r.unit_id, u.name, r.cnt::int
  FROM ranked r
  JOIN units u ON u.id = r.unit_id
  WHERE r.rn = 1;
$$;

CREATE OR REPLACE FUNCTION public.apply_auto_origin_units(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
  v_skipped int := 0;
BEGIN
  -- Authorization: caller must be manager/admin of the org
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = p_organization_id
      AND ur.role IN ('admin','manager','owner')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH s AS (
    SELECT * FROM public.suggest_client_origin_units(p_organization_id)
  ), upd AS (
    UPDATE clients c
       SET subscription_unit_id = s.suggested_unit_id,
           updated_at = now()
      FROM s
     WHERE c.id = s.client_id
       AND c.subscription_unit_id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  SELECT count(*) INTO v_skipped
  FROM clients c
  WHERE c.organization_id = p_organization_id
    AND c.subscription_unit_id IS NULL;

  RETURN jsonb_build_object('updated_count', v_updated, 'skipped_count', v_skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_client_origin_units(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_auto_origin_units(uuid) TO authenticated;
