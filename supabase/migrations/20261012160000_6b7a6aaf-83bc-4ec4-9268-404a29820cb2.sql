-- Criação rápida de plano de assinatura pelo CONTROLADOR (durante a importação
-- do CSV, quando chega um plano que ainda não existe no cadastro).
--
-- A RPC existente save_subscription_plan é manager-only e também mexe nos
-- serviços vinculados. Aqui criamos uma função MÍNIMA (só cria o plano: nome +
-- preço) liberada para MANAGER e CONTROLLER da própria organização (e super_admin).
-- O gestor pode depois completar o plano (serviços, preço) na tela de Planos.

CREATE OR REPLACE FUNCTION public.controller_create_subscription_plan(
  p_organization_id uuid,
  p_name text,
  p_price numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (
    (public.get_user_organization(auth.uid()) = p_organization_id
      AND (public.has_role(auth.uid(), 'manager'::app_role)
        OR public.has_role(auth.uid(), 'controller'::app_role)))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF coalesce(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Nome do plano obrigatório';
  END IF;

  INSERT INTO public.subscription_plans (name, price, organization_id)
  VALUES (btrim(p_name), coalesce(p_price, 0), p_organization_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.controller_create_subscription_plan(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.controller_create_subscription_plan(uuid, text, numeric) TO authenticated;
