-- Harden barber SELECT on sale_transactions to enforce same-organization scope.

DROP POLICY IF EXISTS "Barbers can view their own sale transactions" ON public.sale_transactions;

CREATE POLICY "Barbers can view their own sale transactions"
ON public.sale_transactions
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND barber_id IS NOT NULL
  AND barber_id IN (
    SELECT b.id
    FROM public.barbers b
    WHERE b.user_id = auth.uid()
      AND b.organization_id = get_user_organization(auth.uid())
  )
);
