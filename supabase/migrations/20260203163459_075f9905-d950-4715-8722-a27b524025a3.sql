-- Função RPC para replicar metas automaticamente
CREATE OR REPLACE FUNCTION public.auto_replicate_goals()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_organization_id uuid;
  v_current_month integer;
  v_current_year integer;
  v_previous_month integer;
  v_previous_year integer;
  v_barber record;
  v_previous_goal record;
  v_goals_created integer := 0;
  v_default_commission numeric := 3000.00;
  v_default_work_days integer := 22;
BEGIN
  -- Obter organization_id do usuário atual
  v_organization_id := get_user_organization(auth.uid());
  
  IF v_organization_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Organização não encontrada');
  END IF;

  -- Calcular mês/ano atual e anterior
  v_current_month := EXTRACT(MONTH FROM CURRENT_DATE)::integer;
  v_current_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  
  IF v_current_month = 1 THEN
    v_previous_month := 12;
    v_previous_year := v_current_year - 1;
  ELSE
    v_previous_month := v_current_month - 1;
    v_previous_year := v_current_year;
  END IF;

  -- Iterar sobre todos os barbeiros ativos da organização
  FOR v_barber IN 
    SELECT id, name 
    FROM barbers 
    WHERE organization_id = v_organization_id 
      AND status = 'active'
  LOOP
    -- Verificar se já existe meta para o mês atual
    IF NOT EXISTS (
      SELECT 1 FROM monthly_goals 
      WHERE barber_id = v_barber.id 
        AND month = v_current_month 
        AND year = v_current_year
    ) THEN
      -- Buscar meta do mês anterior
      SELECT target_commission, work_days 
      INTO v_previous_goal
      FROM monthly_goals 
      WHERE barber_id = v_barber.id 
        AND month = v_previous_month 
        AND year = v_previous_year
      LIMIT 1;

      -- Inserir nova meta (com valor do mês anterior ou padrão)
      INSERT INTO monthly_goals (
        barber_id,
        organization_id,
        month,
        year,
        target_commission,
        work_days
      ) VALUES (
        v_barber.id,
        v_organization_id,
        v_current_month,
        v_current_year,
        COALESCE(v_previous_goal.target_commission, v_default_commission),
        COALESCE(v_previous_goal.work_days, v_default_work_days)
      );

      v_goals_created := v_goals_created + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'success', true, 
    'goals_created', v_goals_created,
    'month', v_current_month,
    'year', v_current_year
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.auto_replicate_goals() TO authenticated;