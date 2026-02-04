-- Atualizar a constraint de item_type para incluir 'subscription'
ALTER TABLE public.sale_transactions DROP CONSTRAINT IF EXISTS sale_transactions_item_type_check;
ALTER TABLE public.sale_transactions ADD CONSTRAINT sale_transactions_item_type_check CHECK (item_type IN ('service', 'product', 'subscription'));

-- Garantir que gestores possam inserir assinaturas (com ou sem barber_id)
DROP POLICY IF EXISTS "Managers can insert reception sales" ON public.sale_transactions;
DROP POLICY IF EXISTS "Managers can insert sales" ON public.sale_transactions;

CREATE POLICY "Managers can insert sales"
ON public.sale_transactions FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid()) AND
  has_role(auth.uid(), 'manager'::app_role)
);