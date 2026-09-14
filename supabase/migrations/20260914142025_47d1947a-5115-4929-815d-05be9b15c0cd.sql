CREATE OR REPLACE FUNCTION public.get_barber_subscriber_phones(
  p_barber_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(mobile_phone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.barbers WHERE id = p_barber_id;
  IF v_org IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = p_barber_id AND b.user_id = auth.uid())
    OR (public.has_role(auth.uid(), 'manager') AND public.get_user_organization(auth.uid()) = v_org)
    OR public.has_role(auth.uid(), 'super_admin')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT c.mobile_phone
  FROM public.sale_transactions st
  JOIN public.clients c
    ON c.organization_id = st.organization_id
   AND c.mobile_phone = st.mobile_phone
  WHERE st.barber_id = p_barber_id
    AND st.organization_id = v_org
    AND st.created_at >= p_start
    AND st.created_at < p_end
    AND st.mobile_phone IS NOT NULL
    AND c.subscription_plan_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_barber_subscriber_phones(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_barber_subscriber_phones(uuid, timestamptz, timestamptz) TO authenticated;