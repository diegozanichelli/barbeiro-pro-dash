-- Update manager policy to be resilient to NULL organization_id in daily_productions
DO $$ BEGIN
  DROP POLICY IF EXISTS "Managers can manage productions in their organization" ON public.daily_productions;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE POLICY "Managers can manage productions in their organization"
ON public.daily_productions
FOR ALL
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND barber_id IN (
    SELECT b.id
    FROM public.barbers b
    WHERE b.organization_id = get_user_organization(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND barber_id IN (
    SELECT b.id
    FROM public.barbers b
    WHERE b.organization_id = get_user_organization(auth.uid())
  )
);