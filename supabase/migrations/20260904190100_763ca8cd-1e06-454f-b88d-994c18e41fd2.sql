-- Status de clube dos clientes que um barbeiro atendeu, por caminho seguro.
--
-- A tabela clients só tem RLS para gestor/super_admin, então o app do barbeiro
-- não consegue lê-la direto — sem isto, o painel do barbeiro trata todo cliente
-- como "sem clube". Esta função roda como definer e devolve apenas os telefones
-- ASSINANTES entre os clientes que AQUELE barbeiro atendeu no período. Um
-- barbeiro só pode consultar a si mesmo; gestor/super_admin, qualquer barbeiro
-- da sua organização.

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
  v_caller_barber uuid;
BEGIN
  v_org := public.get_user_organization(auth.uid());
  IF v_org IS NULL THEN
    RETURN;
  END IF;

  -- Barbeiro só enxerga os próprios dados; gestor/super_admin, toda a org.
  SELECT b.id INTO v_caller_barber
  FROM public.barbers b
  WHERE b.user_id = auth.uid();

  IF NOT (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin')) THEN
    IF v_caller_barber IS NULL OR v_caller_barber <> p_barber_id THEN
      RETURN;
    END IF;
  END IF;

  -- O barbeiro consultado tem de pertencer à organização do chamador.
  IF NOT EXISTS (
    SELECT 1 FROM public.barbers b
    WHERE b.id = p_barber_id AND b.organization_id = v_org
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT c.mobile_phone
  FROM public.clients c
  WHERE c.organization_id = v_org
    AND c.subscription_plan_id IS NOT NULL
    AND c.mobile_phone IN (
      SELECT DISTINCT st.mobile_phone
      FROM public.sale_transactions st
      WHERE st.barber_id = p_barber_id
        AND st.organization_id = v_org
        AND st.mobile_phone IS NOT NULL
        AND st.mobile_phone <> ''
        AND st.created_at >= p_start
        AND st.created_at < p_end
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_barber_subscriber_phones(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barber_subscriber_phones(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_barber_subscriber_phones(uuid, timestamptz, timestamptz) TO service_role;
