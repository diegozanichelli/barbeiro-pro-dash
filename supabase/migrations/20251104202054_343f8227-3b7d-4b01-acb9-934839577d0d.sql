-- Create a security definer function to get rankings for all barbers in the user's organization
CREATE OR REPLACE FUNCTION public.get_organization_rankings(
  p_start_date date,
  p_end_date date,
  p_unit_id uuid DEFAULT NULL
)
RETURNS TABLE (
  barber_id uuid,
  barber_name text,
  unit_name text,
  services_total numeric,
  services_basic_total numeric,
  services_extra_total numeric,
  products_total numeric,
  clients_count bigint,
  commission_earned numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  -- Get the organization_id of the current user
  v_organization_id := get_user_organization(auth.uid());
  
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to any organization';
  END IF;

  -- Return aggregated data for all barbers in the organization
  RETURN QUERY
  SELECT 
    dp.barber_id,
    b.name as barber_name,
    u.name as unit_name,
    -- Aggregate services_total with retrocompatibility logic
    SUM(
      CASE 
        WHEN dp.services_basic_total IS NOT NULL OR dp.services_extra_total IS NOT NULL 
        THEN COALESCE(dp.services_basic_total, 0) + COALESCE(dp.services_extra_total, 0)
        ELSE COALESCE(dp.services_total, 0)
      END
    ) as services_total,
    SUM(COALESCE(dp.services_basic_total, 0)) as services_basic_total,
    SUM(COALESCE(dp.services_extra_total, 0)) as services_extra_total,
    SUM(dp.products_total) as products_total,
    SUM(dp.clients_count) as clients_count,
    SUM(dp.commission_earned) as commission_earned
  FROM daily_productions dp
  INNER JOIN barbers b ON dp.barber_id = b.id
  INNER JOIN units u ON b.unit_id = u.id
  WHERE dp.organization_id = v_organization_id
    AND dp.date >= p_start_date
    AND dp.date <= p_end_date
    AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
  GROUP BY dp.barber_id, b.name, u.name;
END;
$$;