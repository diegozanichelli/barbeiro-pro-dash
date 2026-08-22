
CREATE TABLE public.war_plan_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  barber_id uuid NOT NULL,
  date date NOT NULL,
  strategy_id text NOT NULL,
  strategy_name text NOT NULL,
  strategy_focus text,
  clients_in_agenda integer,
  plan_text text,
  result_clients integer,
  result_revenue numeric,
  result_avg_ticket numeric,
  result_extras_count integer,
  result_extras_ratio numeric,
  result_products_count integer,
  result_commission numeric,
  result_vs_target_pct numeric,
  result_calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barber_id, date)
);

CREATE INDEX idx_wpe_barber_date ON public.war_plan_executions (barber_id, date DESC);
CREATE INDEX idx_wpe_org_date ON public.war_plan_executions (organization_id, date DESC);

ALTER TABLE public.war_plan_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barbers can view their own war plan executions"
ON public.war_plan_executions FOR SELECT
USING (barber_id IN (SELECT id FROM public.barbers WHERE user_id = auth.uid()));

CREATE POLICY "Managers can manage org war plan executions"
ON public.war_plan_executions FOR ALL
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Super admins can manage all war plan executions"
ON public.war_plan_executions FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_wpe_updated_at
BEFORE UPDATE ON public.war_plan_executions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.recalc_war_plan_result(p_barber_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exists boolean;
  v_clients integer := 0;
  v_revenue numeric := 0;
  v_avg_ticket numeric := 0;
  v_extras_count integer := 0;
  v_extras_ratio numeric := 0;
  v_products_count integer := 0;
  v_commission numeric := 0;
  v_target numeric := 0;
  v_work_days integer := 0;
  v_daily_target numeric := 0;
  v_vs_target numeric := 0;
  v_month integer := EXTRACT(MONTH FROM p_date)::int;
  v_year integer := EXTRACT(YEAR FROM p_date)::int;
BEGIN
  SELECT EXISTS(SELECT 1 FROM war_plan_executions WHERE barber_id = p_barber_id AND date = p_date)
  INTO v_exists;
  IF NOT v_exists THEN RETURN; END IF;

  SELECT
    COALESCE(COUNT(DISTINCT created_at) FILTER (WHERE item_type IN ('service','product')), 0),
    COALESCE(SUM(price_sold) FILTER (WHERE item_type IN ('service','product')), 0),
    COALESCE(COUNT(*) FILTER (WHERE item_type = 'service' AND service_category = 'extra'), 0),
    COALESCE(COUNT(*) FILTER (WHERE item_type = 'product'), 0),
    COALESCE(SUM(commission_amount) FILTER (WHERE item_type IN ('service','product')), 0)
  INTO v_clients, v_revenue, v_extras_count, v_products_count, v_commission
  FROM sale_transactions
  WHERE barber_id = p_barber_id
    AND source = 'manager'
    AND (created_at AT TIME ZONE 'America/Manaus')::date = p_date;

  IF v_clients > 0 THEN
    v_avg_ticket := ROUND(v_revenue / v_clients, 2);
    v_extras_ratio := ROUND(v_extras_count::numeric / v_clients, 4);
  END IF;

  SELECT COALESCE(target_commission, 0), COALESCE(work_days, 0)
  INTO v_target, v_work_days
  FROM monthly_goals
  WHERE barber_id = p_barber_id AND month = v_month AND year = v_year
  LIMIT 1;

  IF v_work_days > 0 THEN
    v_daily_target := v_target / v_work_days;
    IF v_daily_target > 0 THEN
      v_vs_target := ROUND((v_commission / v_daily_target) * 100, 2);
    END IF;
  END IF;

  UPDATE war_plan_executions SET
    result_clients = v_clients,
    result_revenue = v_revenue,
    result_avg_ticket = v_avg_ticket,
    result_extras_count = v_extras_count,
    result_extras_ratio = v_extras_ratio,
    result_products_count = v_products_count,
    result_commission = v_commission,
    result_vs_target_pct = v_vs_target,
    result_calculated_at = now()
  WHERE barber_id = p_barber_id AND date = p_date;
END;
$$;
