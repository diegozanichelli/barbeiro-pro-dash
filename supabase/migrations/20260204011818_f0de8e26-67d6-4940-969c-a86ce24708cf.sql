-- Update RLS policies to handle reception sales (barber_id = NULL)

-- Drop existing policies that won't work with NULL barber_id
DROP POLICY IF EXISTS "Barbers can insert their own sale transactions" ON public.sale_transactions;
DROP POLICY IF EXISTS "Barbers can view their own sale transactions" ON public.sale_transactions;

-- Create updated policies that allow barbers to view and insert their own transactions
CREATE POLICY "Barbers can view their own sale transactions"
ON public.sale_transactions FOR SELECT
USING (
  barber_id IS NOT NULL AND
  barber_id IN (
    SELECT barbers.id FROM barbers WHERE barbers.user_id = auth.uid()
  )
);

CREATE POLICY "Barbers can insert their own sale transactions"
ON public.sale_transactions FOR INSERT
WITH CHECK (
  barber_id IS NOT NULL AND
  barber_id IN (
    SELECT barbers.id FROM barbers WHERE barbers.user_id = auth.uid()
  )
);

-- Add policy for managers to insert reception sales (barber_id = NULL)
CREATE POLICY "Managers can insert reception sales"
ON public.sale_transactions FOR INSERT
WITH CHECK (
  barber_id IS NULL AND
  organization_id = get_user_organization(auth.uid()) AND
  has_role(auth.uid(), 'manager'::app_role)
);