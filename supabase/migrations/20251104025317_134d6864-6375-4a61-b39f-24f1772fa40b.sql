-- Add INSERT policy to barbers table for defense-in-depth
-- This policy won't affect the create-barber Edge Function (which uses service role)
-- but provides an additional security layer if the service role key is compromised

CREATE POLICY "Managers can insert barbers in their organization"
ON barbers
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'manager'::app_role)
);