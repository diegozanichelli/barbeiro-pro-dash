
-- Enum para fonte de sazonalidade
DO $$ BEGIN
  CREATE TYPE public.seasonality_source AS ENUM ('linear','previous_year','trailing_3m','combined');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tabela de configuração
CREATE TABLE IF NOT EXISTS public.unit_seasonality_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL UNIQUE REFERENCES public.units(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source public.seasonality_source NOT NULL DEFAULT 'linear',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_seasonality_config TO authenticated;
GRANT ALL ON public.unit_seasonality_config TO service_role;

ALTER TABLE public.unit_seasonality_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers read seasonality config"
  ON public.unit_seasonality_config FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR (public.has_role(auth.uid(), 'manager')
        AND organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  );

CREATE POLICY "managers write seasonality config"
  ON public.unit_seasonality_config FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR (public.has_role(auth.uid(), 'manager')
        AND organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR (public.has_role(auth.uid(), 'manager')
        AND organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  );

CREATE TRIGGER trg_unit_seasonality_config_updated_at
  BEFORE UPDATE ON public.unit_seasonality_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função utilitária: retorna pesos das 5 fatias semanais
-- Fatias: 1=dias 1-7, 2=8-14, 3=15-21, 4=22-28, 5=29-fim do mês
CREATE OR REPLACE FUNCTION public.get_unit_weekly_weights(
  p_unit_id uuid,
  p_month int,
  p_year int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.seasonality_source;
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
  i int;
BEGIN
  -- Carrega config
  SELECT source INTO v_source FROM public.unit_seasonality_config WHERE unit_id = p_unit_id;
  IF v_source IS NULL THEN v_source := 'linear'; END IF;

  IF v_source = 'linear' THEN
    RETURN jsonb_build_object(
      'weights', to_jsonb(v_weights),
      'source_used', 'linear',
      'has_history', true
    );
  END IF;

  -- previous_year: agrega o mesmo mês do ano anterior
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

  -- trailing_3m: agrega últimos 3 meses anteriores ao mês alvo
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

  -- Escolhe agregado conforme fonte
  IF v_source = 'previous_year' THEN
    v_slice_totals := v_py_totals; v_total := v_py_total; v_source_used := 'previous_year';
  ELSIF v_source = 'trailing_3m' THEN
    v_slice_totals := v_t3_totals; v_total := v_t3_total; v_source_used := 'trailing_3m';
  ELSIF v_source = 'combined' THEN
    -- Média simples dos pesos quando ambos têm histórico; caso contrário usa o disponível
    IF v_py_total >= v_min_total AND v_t3_total >= v_min_total THEN
      FOR i IN 1..5 LOOP
        v_weights[i] := ((v_py_totals[i]/v_py_total) + (v_t3_totals[i]/v_t3_total)) / 2.0;
      END LOOP;
      v_has_history := true;
      v_source_used := 'combined';
      RETURN jsonb_build_object(
        'weights', to_jsonb(v_weights),
        'source_used', v_source_used,
        'has_history', v_has_history
      );
    ELSIF v_py_total >= v_min_total THEN
      v_slice_totals := v_py_totals; v_total := v_py_total; v_source_used := 'previous_year';
    ELSIF v_t3_total >= v_min_total THEN
      v_slice_totals := v_t3_totals; v_total := v_t3_total; v_source_used := 'trailing_3m';
    ELSE
      v_total := 0;
    END IF;
  END IF;

  IF v_total >= v_min_total THEN
    FOR i IN 1..5 LOOP
      v_weights[i] := v_slice_totals[i] / v_total;
    END LOOP;
    v_has_history := true;
  ELSE
    -- fallback linear
    v_weights := ARRAY[0.2,0.2,0.2,0.2,0.2];
    v_has_history := false;
    v_source_used := 'linear';
  END IF;

  RETURN jsonb_build_object(
    'weights', to_jsonb(v_weights),
    'source_used', v_source_used,
    'has_history', v_has_history
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unit_weekly_weights(uuid, int, int) TO authenticated, service_role;
