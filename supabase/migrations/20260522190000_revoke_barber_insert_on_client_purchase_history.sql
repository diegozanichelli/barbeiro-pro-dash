-- Security hardening: barbers no longer create purchase history records.
-- They only confirm visibility/awareness of daily transactions in UI.

DROP POLICY IF EXISTS "Barbers can insert purchase history in their organization"
ON public.client_purchase_history;
