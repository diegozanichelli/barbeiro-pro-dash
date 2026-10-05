-- RLS para o papel "controller" (controlador).
--
-- O controlador precisa, dentro da sua própria organização:
--   * ler clientes (buscar por telefone/nome e resolver a unidade de origem
--     via clients.subscription_unit_id);
--   * cadastrar/atualizar clientes (vincular/zerar o plano numa adesão online
--     ou num cancelamento);
--   * ler os lançamentos de assinatura (para listar o que já lançou);
--   * inserir e remover APENAS movimentos de assinatura de responsabilidade
--     dele (cancelamento, venda online e renovação automática), nunca venda
--     operacional de barbeiro/balcão.
--
-- subscription_plans e units já têm SELECT liberado para qualquer usuário
-- autenticado da organização ("... view ... in organization"), então o
-- controlador já enxerga planos e unidades sem policy nova.
--
-- O escopo de escrita em sale_transactions é travado por item_type
-- = 'subscription' e attribution_source na lista do controlador, para que o
-- papel não consiga criar/apagar vendas operacionais.

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
CREATE POLICY "Controllers can view clients in organization"
ON public.clients
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'controller'::app_role)
);

CREATE POLICY "Controllers can register clients in organization"
ON public.clients
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'controller'::app_role)
);

CREATE POLICY "Controllers can update clients in organization"
ON public.clients
FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'controller'::app_role)
)
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'controller'::app_role)
);

-- ---------------------------------------------------------------------------
-- sale_transactions (somente movimentos de assinatura do controlador)
-- ---------------------------------------------------------------------------
CREATE POLICY "Controllers can view sale transactions in organization"
ON public.sale_transactions
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'controller'::app_role)
);

CREATE POLICY "Controllers can insert subscription movements"
ON public.sale_transactions
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'controller'::app_role)
  AND item_type = 'subscription'
  AND attribution_source IN ('controller', 'online', 'auto_recurring')
);

CREATE POLICY "Controllers can delete their subscription movements"
ON public.sale_transactions
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'controller'::app_role)
  AND item_type = 'subscription'
  AND attribution_source IN ('controller', 'online', 'auto_recurring')
);
