CREATE OR REPLACE FUNCTION public.calc_expected_pacing(
  p_barber_id uuid,
  p_ref_date  date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  working_days_passed integer,
  working_days_total  integer,
  target_commission   numeric,
  expected_commission numeric,
  expected_percent    numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org    uuid;
  v_month  integer := EXTRACT(MONTH FROM p_ref_date)::integer;
  v_year   integer := EXTRACT(YEAR  FROM p_ref_date)::integer;
  v_first  date    := make_date(v_year, v_month, 1);
  v_last   date    := (make_date(v_year, v_month, 1) + interval '1 month - 1 day')::date;
  v_target numeric := 0;
  v_passed integer := 0;
  v_total  integer := 0;
BEGIN
  SELECT b.organization_id INTO v_org FROM barbers b WHERE b.id = p_barber_id;

  SELECT COALESCE(mg.target_commission, 0) INTO v_target
  FROM monthly_goals mg
  WHERE mg.barber_id = p_barber_id
    AND mg.month = v_month
    AND mg.year  = v_year
  LIMIT 1;

  SELECT COUNT(*)::int INTO v_passed
  FROM generate_series(v_first, p_ref_date, interval '1 day') AS d(day)
  WHERE NOT EXISTS (
          SELECT 1 FROM organization_holidays oh
          WHERE oh.organization_id = v_org AND oh.date = d.day::date
        )
    AND NOT EXISTS (
          SELECT 1 FROM daily_productions dp
          WHERE dp.barber_id = p_barber_id
            AND dp.date = d.day::date
            AND dp.presence_type IN ('day_off','absence','optional_sunday')
        );

  SELECT COUNT(*)::int INTO v_total
  FROM generate_series(v_first, v_last, interval '1 day') AS d(day)
  WHERE NOT EXISTS (
          SELECT 1 FROM organization_holidays oh
          WHERE oh.organization_id = v_org AND oh.date = d.day::date
        )
    AND NOT EXISTS (
          SELECT 1 FROM daily_productions dp
          WHERE dp.barber_id = p_barber_id
            AND dp.date = d.day::date
            AND dp.presence_type IN ('day_off','absence','optional_sunday')
        );

  IF v_total <= 0 THEN v_total := 1; END IF;

  working_days_passed := v_passed;
  working_days_total  := v_total;
  target_commission   := v_target;
  expected_commission := ROUND(v_target * v_passed::numeric / v_total::numeric, 2);
  expected_percent    := ROUND(v_passed::numeric * 100 / v_total::numeric, 2);
  RETURN NEXT;
END;
$$;