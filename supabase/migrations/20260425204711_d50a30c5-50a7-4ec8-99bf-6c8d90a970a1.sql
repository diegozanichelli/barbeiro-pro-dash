-- Revoga permissão de barbeiro modificar transações de venda.
-- Defesa em profundidade: app do barbeiro vira read-only.
DROP POLICY IF EXISTS "Barbers can insert their own sale transactions" ON public.sale_transactions;
DROP POLICY IF EXISTS "Barbers can update their own barber transactions" ON public.sale_transactions;
DROP POLICY IF EXISTS "Barbers can delete their own barber transactions" ON public.sale_transactions;