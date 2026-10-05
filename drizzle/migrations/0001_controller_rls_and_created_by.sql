ALTER TABLE public.sale_transactions ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

CREATE POLICY "Controllers can view clients in organization" ON public.clients FOR SELECT
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'controller'::app_role));

CREATE POLICY "Controllers can register clients in organization" ON public.clients FOR INSERT
WITH CHECK (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'controller'::app_role));

CREATE POLICY "Controllers can update clients in organization" ON public.clients FOR UPDATE
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'controller'::app_role))
WITH CHECK (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'controller'::app_role));

CREATE POLICY "Controllers can view sale transactions in organization" ON public.sale_transactions FOR SELECT
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'controller'::app_role) AND item_type = 'subscription');

CREATE POLICY "Controllers can insert subscription movements" ON public.sale_transactions FOR INSERT
WITH CHECK (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'controller'::app_role) AND item_type = 'subscription' AND attribution_source IN ('controller', 'online', 'auto_recurring'));

CREATE POLICY "Controllers can delete their subscription movements" ON public.sale_transactions FOR DELETE
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'controller'::app_role) AND item_type = 'subscription' AND attribution_source IN ('controller', 'online', 'auto_recurring') AND created_by = auth.uid());