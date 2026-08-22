CREATE OR REPLACE FUNCTION public.calc_expected_pacing_batch(
  p_organization_id uuid,
  p_ref_date        date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  barber_id           uuid,
  working_days_passed integer,
  working_days_total  integer,
  target_commission   numeric,
  expected_commission numeric,
  expected_percent    numeric,
  comissao_acumulada  numeric
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_month integer := EXTRACT(MONTH FROM p_ref_date)::integer;
  v_year  integer := EXTRACT(YEAR  FROM p_ref_date)::integer;
  v_first date    := make_date(v_year, v_month, 1);
  v_last  date    := (make_date(v_year, v_month, 1) + interval '1 month - 1 day')::date;
  v_ref   date    := LEAST(p_ref_date, v_last);
  v_cal_passed integer := GREATEST(0, (v_ref - v_first) + 1);
  v_cal_total  integer := (v_last - v_first) + 1;
BEGIN
  RETURN QUERY
  WITH org_barbers AS (
    SELECT b.id FROM barbers b
    WHERE b.organization_id = p_organization_id
      AND b.status = 'active'
  ),
  hol_passed AS (
    SELECT oh.date FROM organization_holidays oh
    WHERE oh.organization_id = p_organization_id
      AND oh.date BETWEEN v_first AND v_ref
  ),
  hol_total AS (
    SELECT oh.date FROM organization_holidays oh
    WHERE oh.organization_id = p_organization_id
      AND oh.date BETWEEN v_first AND v_last
  ),
  abs_passed AS (
    SELECT dp.barber_id, dp.date
    FROM daily_productions dp
    WHERE dp.barber_id IN (SELECT id FROM org_barbers)
      AND dp.date BETWEEN v_first AND v_ref
      AND dp.presence_type IN ('day_off','absence','optional_sunday')
  ),
  abs_total AS (
    SELECT dp.barber_id, dp.date
    FROM daily_productions dp
    WHERE dp.barber_id IN (SELECT id FROM org_barbers)
      AND dp.date BETWEEN v_first AND v_last
      AND dp.presence_type IN ('day_off','absence','optional_sunday')
  ),
  excluded_passed AS (
    SELECT ob.id AS barber_id, COUNT(*)::int AS cnt
    FROM org_barbers ob
    LEFT JOIN LATERAL (
      SELECT date FROM hol_passed
      UNION
      SELECT ap.date FROM abs_passed ap WHERE ap.barber_id = ob.id
    ) x ON true
    GROUP BY ob.id
  ),
  excluded_total AS (
    SELECT ob.id AS barber_id, COUNT(*)::int AS cnt
    FROM org_barbers ob
    LEFT JOIN LATERAL (
      SELECT date FROM hol_total
      UNION
      SELECT at2.date FROM abs_total at2 WHERE at2.barber_id = ob.id
    ) x ON true
    GROUP BY ob.id
  ),
  goals AS (
    SELECT mg.barber_id, COALESCE(mg.target_commission, 0) AS target_commission
    FROM monthly_goals mg
    WHERE mg.barber_id IN (SELECT id FROM org_barbers)
      AND mg.month = v_month
      AND mg.year  = v_year
  ),
  comissao AS (
    SELECT dp.barber_id, COALESCE(SUM(dp.commission_earned), 0)::numeric AS total
    FROM daily_productions dp
    WHERE dp.barber_id IN (SELECT id FROM org_barbers)
      AND dp.date BETWEEN v_first AND v_last
    GROUP BY dp.barber_id
  )
  SELECT
    ob.id AS barber_id,
    GREATEST(0, v_cal_passed - COALESCE(ep.cnt, 0))::int AS working_days_passed,
    GREATEST(1, v_cal_total  - COALESCE(et.cnt, 0))::int AS working_days_total,
    COALESCE(g.target_commission, 0)::numeric AS target_commission,
    ROUND(
      COALESCE(g.target_commission, 0)
      * GREATEST(0, v_cal_passed - COALESCE(ep.cnt, 0))::numeric
      / NULLIF(GREATEST(1, v_cal_total - COALESCE(et.cnt, 0)), 0)::numeric,
    2)::numeric AS expected_commission,
    ROUND(
      GREATEST(0, v_cal_passed - COALESCE(ep.cnt, 0))::numeric * 100
      / NULLIF(GREATEST(1, v_cal_total - COALESCE(et.cnt, 0)), 0)::numeric,
    2)::numeric AS expected_percent,
    COALESCE(c.total, 0)::numeric AS comissao_acumulada
  FROM org_barbers ob
  LEFT JOIN excluded_passed ep ON ep.barber_id = ob.id
  LEFT JOIN excluded_total  et ON et.barber_id = ob.id
  LEFT JOIN goals g  ON g.barber_id  = ob.id
  LEFT JOIN comissao c ON c.barber_id = ob.id;
END;
$$;