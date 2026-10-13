-- Fix: o controlador precisa inserir movimentos de assinatura de BALCÃO
-- (attribution_source = 'reception') ao importar o CSV — linhas "Pago fora do
-- sistema". A policy de INSERT do controlador só permitia
-- ('controller','online','auto_recurring'), então a importação inteira falhava
-- com "new row violates row-level security policy for table sale_transactions".
--
-- Adiciona 'reception' à lista permitida (pagamento de balcão registrado pelo
-- controlador é propriedade da própria organização e continua item_type =
-- 'subscription').

DROP POLICY IF EXISTS "Controllers can insert subscription movements" ON public.sale_transactions;

CREATE POLICY "Controllers can insert subscription movements"
ON public.sale_transactions
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'controller'::app_role)
  AND item_type = 'subscription'
  AND attribution_source = ANY (ARRAY['controller'::text, 'online'::text, 'auto_recurring'::text, 'reception'::text])
);

-- Mesma correção para o DELETE: quando o controlador exclui um lote importado
-- (undo), as linhas de balcão ('reception') precisam cair na policy de DELETE,
-- senão o lote some mas as transações financeiras ficam órfãs (FK do batch vira
-- null e as vendas permanecem). Mantém o escopo por org, papel, item_type,
-- created_by e só acrescenta 'reception' à lista.

DROP POLICY IF EXISTS "Controllers can delete their subscription movements" ON public.sale_transactions;

CREATE POLICY "Controllers can delete their subscription movements"
ON public.sale_transactions
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'controller'::app_role)
  AND item_type = 'subscription'
  AND attribution_source = ANY (ARRAY['controller'::text, 'online'::text, 'auto_recurring'::text, 'reception'::text])
  AND created_by = auth.uid()
);
