CREATE OR REPLACE FUNCTION public.get_unit_weekday_heatmap(
  p_period_start date,
  p_period_end date,
  p_unit_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  v_org := get_user_organization(auth.uid());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'User does not belong to any organization';
  END IF;

  RETURN (
    WITH by_date AS (
      SELECT b.unit_id, u.name AS unit_name, d.date, EXTRACT(DOW FROM d.date)::int AS weekday,
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
      LEFT JOIN units u ON u.id = b.unit_id
      WHERE d.organization_id = v_org
        AND d.date BETWEEN p_period_start AND p_period_end
        AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
      GROUP BY b.unit_id, u.name, d.date
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'unit_id', unit_id, 'unit_name', unit_name,
      'weekday', weekday, 'total_revenue', total_revenue, 'days_count', days_count,
      'avg_revenue', CASE WHEN days_count > 0 THEN ROUND(total_revenue/days_count, 2) ELSE 0 END
    ) ORDER BY unit_name, weekday), '[]'::jsonb)
    FROM (
      SELECT unit_id, unit_name, weekday, SUM(revenue) AS total_revenue, COUNT(DISTINCT date) AS days_count
      FROM by_date GROUP BY unit_id, unit_name, weekday
    ) x
  );
END;
$function$;
