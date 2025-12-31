-- Remove the overly permissive policy that exposes data publicly
DROP POLICY IF EXISTS "System can manage all alerts" ON public.performance_alerts;

-- Add proper policies for managers to manage alerts (not just view)
CREATE POLICY "Managers can manage alerts in their organization"
ON public.performance_alerts
FOR ALL
USING (
  (organization_id = get_user_organization(auth.uid())) 
  AND has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  (organization_id = get_user_organization(auth.uid())) 
  AND has_role(auth.uid(), 'manager'::app_role)
);

-- Add policy for super admins to manage all alerts
CREATE POLICY "Super admins can manage all alerts"
ON public.performance_alerts
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));