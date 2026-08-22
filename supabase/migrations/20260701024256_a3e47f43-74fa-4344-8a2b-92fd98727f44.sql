-- Add 'manual' source and manual_weights column
ALTER TYPE public.seasonality_source ADD VALUE IF NOT EXISTS 'manual';

ALTER TABLE public.unit_seasonality_config
  ADD COLUMN IF NOT EXISTS manual_weights numeric[] DEFAULT NULL;

-- Update RPC to honor manual weights
CREATE OR REPLACE FUNCTION public.get_unit_weekly_weights(p_unit_id uuid, p_month integer, p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source public.seasonality_source;
  v_manual numeric[];
  v_weights numeric[] := ARRAY[0.2,0.2,0.2,0.2,0.2];
  v_has_history boolean := false;
  v_source_used text := 'linear';
  v_total numeric := 0;
  v_slice_totals numeric[] := ARRAY[0,0,0,0,0];
  v_min_total numeric := 5000;
  v_py_totals numeric[];
  v_t3_totals numeric[];
  v_py_total numeric := 0;
  v_t3_total numeric := 0;
  v_start date;
  v_end date;
  v_sum numeric;
  i int;
BEGIN
  SELECT source, manual_weights INTO v_source, v_manual
  FROM public.unit_seasonality_config WHERE unit_id = p_unit_id;
  IF v_source IS NULL THEN v_source := 'linear'; END IF;

  IF v_source = 'manual' THEN
    IF v_manual IS NOT NULL AND array_length(v_manual,1) = 5 THEN
      v_sum := COALESCE(v_manual[1],0)+COALESCE(v_manual[2],0)+COALESCE(v_manual[3],0)+COALESCE(v_manual[4],0)+COALESCE(v_manual[5],0);
      IF v_sum > 0 THEN
        FOR i IN 1..5 LOOP v_weights[i] := v_manual[i] / v_sum; END LOOP;
        RETURN jsonb_build_object('weights', to_jsonb(v_weights), 'source_used', 'manual', 'has_history', true);
      END IF;
    END IF;
    RETURN jsonb_build_object('weights', to_jsonb(v_weights), 'source_used', 'linear', 'has_history', false);
  END IF;

  IF v_source = 'linear' THEN
    RETURN jsonb_build_object('weights', to_jsonb(v_weights), 'source_used', 'linear', 'has_history', true);
  END IF;

  IF v_source IN ('previous_year','combined') THEN
    v_start := make_date(p_year - 1, p_month, 1);
    v_end := (v_start + interval '1 month - 1 day')::date;
    SELECT ARRAY[
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') BETWEEN 1 AND 7),0),
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') BETWEEN 8 AND 14),0),
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') BETWEEN 15 AND 21),0),
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') BETWEEN 22 AND 28),0),
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') >= 29),0)
    ]
    INTO v_py_totals
    FROM public.sale_transactions
    WHERE unit_id = p_unit_id
      AND created_at >= (v_start::timestamp AT TIME ZONE 'America/Manaus')
      AND created_at <= ((v_end + 1)::timestamp AT TIME ZONE 'America/Manaus');
    v_py_total := COALESCE(v_py_totals[1],0)+COALESCE(v_py_totals[2],0)+COALESCE(v_py_totals[3],0)+COALESCE(v_py_totals[4],0)+COALESCE(v_py_totals[5],0);
  END IF;

  IF v_source IN ('trailing_3m','combined') THEN
    v_start := (make_date(p_year, p_month, 1) - interval '3 months')::date;
    v_end := (make_date(p_year, p_month, 1) - interval '1 day')::date;
    SELECT ARRAY[
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') BETWEEN 1 AND 7),0),
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') BETWEEN 8 AND 14),0),
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') BETWEEN 15 AND 21),0),
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') BETWEEN 22 AND 28),0),
      COALESCE(SUM(amount) FILTER (WHERE EXTRACT(DAY FROM created_at AT TIME ZONE 'America/Manaus') >= 29),0)
    ]
    INTO v_t3_totals
    FROM public.sale_transactions
    WHERE unit_id = p_unit_id
      AND created_at >= (v_start::timestamp AT TIME ZONE 'America/Manaus')
      AND created_at <= ((v_end + 1)::timestamp AT TIME ZONE 'America/Manaus');
    v_t3_total := COALESCE(v_t3_totals[1],0)+COALESCE(v_t3_totals[2],0)+COALESCE(v_t3_totals[3],0)+COALESCE(v_t3_totals[4],0)+COALESCE(v_t3_totals[5],0);
  END IF;

  IF v_source = 'previous_year' THEN
    v_slice_totals := v_py_totals; v_total := v_py_total; v_source_used := 'previous_year';
  ELSIF v_source = 'trailing_3m' THEN
    v_slice_totals := v_t3_totals; v_total := v_t3_total; v_source_used := 'trailing_3m';
  ELSIF v_source = 'combined' THEN
    IF v_py_total >= v_min_total AND v_t3_total >= v_min_total THEN
      FOR i IN 1..5 LOOP
        v_weights[i] := ((v_py_totals[i]/v_py_total) + (v_t3_totals[i]/v_t3_total)) / 2.0;
      END LOOP;
      RETURN jsonb_build_object('weights', to_jsonb(v_weights), 'source_used', 'combined', 'has_history', true);
    ELSIF v_py_total >= v_min_total THEN
      v_slice_totals := v_py_totals; v_total := v_py_total; v_source_used := 'previous_year';
    ELSIF v_t3_total >= v_min_total THEN
      v_slice_totals := v_t3_totals; v_total := v_t3_total; v_source_used := 'trailing_3m';
    ELSE
      RETURN jsonb_build_object('weights', to_jsonb(v_weights), 'source_used', 'linear', 'has_history', false);
    END IF;
  END IF;

  IF v_total < v_min_total THEN
    RETURN jsonb_build_object('weights', to_jsonb(v_weights), 'source_used', 'linear', 'has_history', false);
  END IF;

  FOR i IN 1..5 LOOP
    v_weights[i] := v_slice_totals[i] / v_total;
  END LOOP;
  v_has_history := true;

  RETURN jsonb_build_object('weights', to_jsonb(v_weights), 'source_used', v_source_used, 'has_history', v_has_history);
END;
$function$;