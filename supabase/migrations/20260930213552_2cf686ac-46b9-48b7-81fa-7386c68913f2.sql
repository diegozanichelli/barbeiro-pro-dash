CREATE OR REPLACE FUNCTION public.get_clients_subscription_summary(p_organization_id uuid)
RETURNS TABLE(mobile_phone text, last_paid_at timestamptz, has_history boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT st.mobile_phone,
         max(st.created_at) FILTER (WHERE st.item_type = 'subscription'
           AND (st.subscription_action IS NULL OR st.subscription_action IN ('new','renew','upgrade','downgrade'))),
         true
  FROM sale_transactions st
  WHERE st.organization_id = p_organization_id
    AND st.mobile_phone IS NOT NULL
    AND (public.get_user_organization(auth.uid()) = p_organization_id OR public.has_role(auth.uid(),'super_admin'))
  GROUP BY st.mobile_phone
$$;

CREATE OR REPLACE FUNCTION public.save_subscription_plan(p_organization_id uuid, p_plan_id uuid, p_name text, p_price numeric, p_service_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := p_plan_id;
BEGIN
  IF NOT ((public.get_user_organization(auth.uid()) = p_organization_id AND public.has_role(auth.uid(),'manager'))
          OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO subscription_plans(name, price, organization_id) VALUES (p_name, p_price, p_organization_id) RETURNING id INTO v_id;
  ELSE
    UPDATE subscription_plans SET name = p_name, price = p_price WHERE id = v_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plano não encontrado'; END IF;
  END IF;
  DELETE FROM subscription_plan_services WHERE subscription_plan_id = v_id;
  INSERT INTO subscription_plan_services(organization_id, subscription_plan_id, catalog_service_id)
  SELECT p_organization_id, v_id, s FROM unnest(coalesce(p_service_ids, '{}'::uuid[])) s;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.get_clients_subscription_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_subscription_plan(uuid, uuid, text, numeric, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clients_subscription_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_subscription_plan(uuid, uuid, text, numeric, uuid[]) TO authenticated;