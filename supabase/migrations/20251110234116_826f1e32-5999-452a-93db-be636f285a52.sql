-- Add INSERT policy for managers to create monthly goals
CREATE POLICY "Managers can create goals for their barbers"
ON public.monthly_goals
FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'manager'::app_role)) 
  AND 
  (EXISTS (
    SELECT 1
    FROM public.barbers b
    WHERE b.id = barber_id
    AND b.organization_id = get_user_organization(auth.uid())
  ))
);