CREATE TABLE public.championship_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Campeonato Anual',
  validation_enabled boolean NOT NULL DEFAULT true,
  min_revenue numeric NOT NULL DEFAULT 15000,
  revenue_enabled boolean NOT NULL DEFAULT true,
  revenue_points_per_1000 numeric NOT NULL DEFAULT 10,
  ticket_enabled boolean NOT NULL DEFAULT true,
  ticket_tiers jsonb NOT NULL DEFAULT '[{"min":130,"points":25},{"min":110,"points":15},{"min":100,"points":5}]'::jsonb,
  products_enabled boolean NOT NULL DEFAULT true,
  product_points numeric NOT NULL DEFAULT 5,
  extras_enabled boolean NOT NULL DEFAULT true,
  extra_points numeric NOT NULL DEFAULT 3,
  extra_high_threshold numeric NOT NULL DEFAULT 100,
  extra_high_multiplier numeric NOT NULL DEFAULT 2,
  subscriptions_enabled boolean NOT NULL DEFAULT true,
  subscription_points numeric NOT NULL DEFAULT 10,
  plan_multipliers jsonb NOT NULL DEFAULT '{}'::jsonb,
  penalty_unconverted_enabled boolean NOT NULL DEFAULT false,
  penalty_unconverted_points numeric NOT NULL DEFAULT 2,
  penalty_dayoff_enabled boolean NOT NULL DEFAULT false,
  penalty_dayoff_points numeric NOT NULL DEFAULT 4,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT championship_configs_org_unique UNIQUE (organization_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.championship_configs TO authenticated;
GRANT ALL ON public.championship_configs TO service_role;

ALTER TABLE public.championship_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read championship config"
ON public.championship_configs FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "managers manage championship config"
ON public.championship_configs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR (public.has_role(auth.uid(), 'manager') AND organization_id = public.get_user_organization(auth.uid())))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.has_role(auth.uid(), 'manager') AND organization_id = public.get_user_organization(auth.uid())));

CREATE TRIGGER update_championship_configs_updated_at
BEFORE UPDATE ON public.championship_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_championship_details(
  p_start_date date,
  p_end_date date,
  p_unit_id uuid DEFAULT NULL,
  p_extra_threshold numeric DEFAULT 100
)
RETURNS TABLE(
  barber_id uuid,
  extras_high_count bigint,
  subs_by_plan jsonb,
  new_clients_unconverted bigint,
  days_off_count bigint
)
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

  RETURN QUERY
  WITH scoped AS (
    SELECT b.id AS bid
    FROM barbers b
    WHERE b.organization_id = v_org
      AND (p_unit_id IS NULL OR b.unit_id = p_unit_id)
  ),
  tx AS (
    SELECT st.*
    FROM sale_transactions st
    INNER JOIN daily_productions dp ON dp.id = st.daily_production_id
    WHERE st.organization_id = v_org
      AND dp.date >= p_start_date
      AND dp.date <= p_end_date
      AND st.barber_id IN (SELECT bid FROM scoped)
  ),
  extras AS (
    SELECT tx.barber_id AS bid, COUNT(*) AS c
    FROM tx
    WHERE tx.item_type = 'service'
      AND tx.service_category = 'extra'
      AND tx.price_sold > p_extra_threshold
    GROUP BY tx.barber_id
  ),
  subs AS (
    SELECT tx.barber_id AS bid,
           jsonb_object_agg(COALESCE(tx.subscription_plan_id::text, 'none'), cnt) AS by_plan
    FROM (
      SELECT tx.barber_id, tx.subscription_plan_id, COUNT(*) AS cnt
      FROM tx
      WHERE tx.item_type = 'subscription'
      GROUP BY tx.barber_id, tx.subscription_plan_id
    ) tx
    GROUP BY tx.barber_id
  ),
  unconverted AS (
    SELECT t.barber_id AS bid, COUNT(DISTINCT t.mobile_phone) AS c
    FROM tx t
    WHERE t.is_new_client IS TRUE
      AND t.mobile_phone IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sale_transactions s2
        WHERE s2.organization_id = v_org
          AND s2.item_type = 'subscription'
          AND s2.mobile_phone = t.mobile_phone
      )
    GROUP BY t.barber_id
  ),
  offs AS (
    SELECT dp.barber_id AS bid, COUNT(*) AS c
    FROM daily_productions dp
    WHERE dp.organization_id = v_org
      AND dp.date >= p_start_date
      AND dp.date <= p_end_date
      AND dp.presence_type IN ('day_off', 'absence')
      AND dp.barber_id IN (SELECT bid FROM scoped)
    GROUP BY dp.barber_id
  )
  SELECT s.bid,
         COALESCE(e.c, 0)::bigint,
         COALESCE(sb.by_plan, '{}'::jsonb),
         COALESCE(uc.c, 0)::bigint,
         COALESCE(o.c, 0)::bigint
  FROM scoped s
  LEFT JOIN extras e ON e.bid = s.bid
  LEFT JOIN subs sb ON sb.bid = s.bid
  LEFT JOIN unconverted uc ON uc.bid = s.bid
  LEFT JOIN offs o ON o.bid = s.bid;
END;
$function$;