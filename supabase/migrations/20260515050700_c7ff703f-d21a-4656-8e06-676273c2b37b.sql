
DROP POLICY IF EXISTS "Managers can manage roles in their organization" ON public.user_roles;

CREATE POLICY "Managers can view roles in their organization"
  ON public.user_roles FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()) AND public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can insert non-admin roles in their organization"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'super_admin'::app_role
  );

CREATE POLICY "Managers can update non-admin roles in their organization"
  ON public.user_roles FOR UPDATE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'super_admin'::app_role
  )
  WITH CHECK (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'super_admin'::app_role
  );

CREATE POLICY "Managers can delete non-admin roles in their organization"
  ON public.user_roles FOR DELETE
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'super_admin'::app_role
  );
