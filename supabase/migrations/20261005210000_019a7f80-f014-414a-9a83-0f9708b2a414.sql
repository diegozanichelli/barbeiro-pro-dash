-- Inferência de unidade por cliente, a partir do histórico de atendimentos.
--
-- A importação do controlador precisa descobrir a unidade de cada cliente
-- lançado cruzando os dados: olhar os últimos atendimentos (serviço) daquele
-- cliente, achar o barbeiro dominante e, dele, a unidade. É a mesma lógica que
-- o sistema já usa para origem de cliente (suggest_client_origin_units).
--
-- A RLS do controlador não permite ler transações de serviço (só assinatura),
-- então a inferência roda por esta função SECURITY DEFINER, que recebe a lista
-- de telefones e devolve a unidade de cada um — sem expor as vendas operacionais.
-- Autorização: super_admin, ou manager/controller da própria organização.

CREATE OR REPLACE FUNCTION public.get_client_units_by_phones(
  p_organization_id uuid,
  p_phones text[]
)
RETURNS TABLE(mobile_phone text, unit_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH authz AS (
    SELECT
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        get_user_organization(auth.uid()) = p_organization_id
        AND (
          has_role(auth.uid(), 'manager'::app_role)
          OR has_role(auth.uid(), 'controller'::app_role)
        )
      ) AS ok
  ),
  recent AS (
    SELECT
      st.mobile_phone,
      st.barber_id,
      st.created_at,
      row_number() OVER (PARTITION BY st.mobile_phone ORDER BY st.created_at DESC) AS rn
    FROM sale_transactions st
    WHERE st.organization_id = p_organization_id
      AND st.item_type = 'service'
      AND st.barber_id IS NOT NULL
      AND st.mobile_phone = ANY (p_phones)
      AND (SELECT ok FROM authz)
  ),
  last_visits AS (
    SELECT mobile_phone, barber_id, created_at
    FROM recent
    WHERE rn <= 3
  ),
  dominant AS (
    SELECT
      mobile_phone,
      barber_id,
      row_number() OVER (
        PARTITION BY mobile_phone
        ORDER BY count(*) DESC, max(created_at) DESC
      ) AS pick
    FROM last_visits
    GROUP BY mobile_phone, barber_id
  )
  SELECT d.mobile_phone, b.unit_id
  FROM dominant d
  JOIN barbers b ON b.id = d.barber_id
  WHERE d.pick = 1;
$$;

REVOKE ALL ON FUNCTION public.get_client_units_by_phones(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_units_by_phones(uuid, text[]) TO authenticated;
