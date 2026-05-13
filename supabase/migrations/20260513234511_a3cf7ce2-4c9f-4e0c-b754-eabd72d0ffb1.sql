-- Índices de apoio (idempotentes)
CREATE INDEX IF NOT EXISTS idx_org_holidays_org_date
  ON public.organization_holidays (organization_id, date);

CREATE INDEX IF NOT EXISTS idx_daily_productions_barber_date_presence
  ON public.daily_productions (barber_id, date)
  WHERE presence_type IN ('day_off','absence','optional_sunday');

-- Reescrita: substitui generate_series + NOT EXISTS por contagem set-based
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
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org              uuid;
  v_month            integer := EXTRACT(MONTH FROM p_ref_date)::integer;
  v_year             integer := EXTRACT(YEAR  FROM p_ref_date)::integer;
  v_first            date    := make_date(v_year, v_month, 1);
  v_last             date    := (make_date(v_year, v_month, 1) + interval '1 month - 1 day')::date;
  v_ref              date    := LEAST(p_ref_date, v_last);
  v_target           numeric := 0;
  v_calendar_passed  integer;
  v_calendar_total   integer;
  v_excluded_passed  integer := 0;
  v_excluded_total   integer := 0;
  v_passed           integer;
  v_total            integer;
BEGIN
  SELECT b.organization_id INTO v_org FROM barbers b WHERE b.id = p_barber_id;

  SELECT COALESCE(mg.target_commission, 0) INTO v_target
  FROM monthly_goals mg
  WHERE mg.barber_id = p_barber_id
    AND mg.month     = v_month
    AND mg.year      = v_year
  LIMIT 1;

  -- Dias de calendário (sem loop)
  v_calendar_passed := GREATEST(0, (v_ref - v_first) + 1);
  v_calendar_total  := (v_last - v_first) + 1;

  -- Dias excluídos = feriados ∪ ausências (UNION elimina sobreposição)
  IF v_org IS NOT NULL THEN
    SELECT COUNT(*) INTO v_excluded_passed
    FROM (
      SELECT oh.date FROM organization_holidays oh
        WHERE oh.organization_id = v_org
          AND oh.date BETWEEN v_first AND v_ref
      UNION
      SELECT dp.date FROM daily_productions dp
        WHERE dp.barber_id = p_barber_id
          AND dp.date BETWEEN v_first AND v_ref
          AND dp.presence_type IN ('day_off','absence','optional_sunday')
    ) x;

    SELECT COUNT(*) INTO v_excluded_total
    FROM (
      SELECT oh.date FROM organization_holidays oh
        WHERE oh.organization_id = v_org
          AND oh.date BETWEEN v_first AND v_last
      UNION
      SELECT dp.date FROM daily_productions dp
        WHERE dp.barber_id = p_barber_id
          AND dp.date BETWEEN v_first AND v_last
          AND dp.presence_type IN ('day_off','absence','optional_sunday')
    ) x;
  END IF;

  v_passed := GREATEST(0, v_calendar_passed - v_excluded_passed);
  v_total  := GREATEST(1, v_calendar_total  - v_excluded_total);

  working_days_passed := v_passed;
  working_days_total  := v_total;
  target_commission   := v_target;
  expected_commission := ROUND(v_target * v_passed::numeric / v_total::numeric, 2);
  expected_percent    := ROUND(v_passed::numeric * 100 / v_total::numeric, 2);
  RETURN NEXT;
END;
$$;