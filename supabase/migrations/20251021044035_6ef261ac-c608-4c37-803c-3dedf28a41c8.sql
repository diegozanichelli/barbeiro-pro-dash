-- Remove the insecure policy that allows everyone to view all barbers
DROP POLICY IF EXISTS "Barbers can view all barbers" ON public.barbers;

-- Create secure policy: Managers can view all barbers
CREATE POLICY "Managers can view all barbers"
ON public.barbers
FOR SELECT
TO authenticated
USING (is_manager());

-- Create secure policy: Barbers can only view their own data
CREATE POLICY "Barbers can view their own data"
ON public.barbers
FOR SELECT
TO authenticated
USING (user_id = auth.uid());