-- Corrigir recursão infinita nas políticas RLS da tabela profiles

-- 1. Dropar as políticas problemáticas
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- 2. Dropar políticas que dependem de profiles em outras tabelas
DROP POLICY IF EXISTS "Managers can manage barbers" ON public.barbers;
DROP POLICY IF EXISTS "Managers can manage goals" ON public.monthly_goals;
DROP POLICY IF EXISTS "Managers can manage all productions" ON public.daily_productions;
DROP POLICY IF EXISTS "Managers can manage units" ON public.units;

-- 3. Criar função security definer para verificar se o usuário é manager
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'manager'
  )
$$;

-- 4. Recriar políticas da tabela profiles usando a função
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Managers can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_manager());

-- 5. Recriar políticas de outras tabelas usando a função
CREATE POLICY "Managers can manage units" ON public.units
  FOR ALL USING (public.is_manager());

CREATE POLICY "Managers can manage barbers" ON public.barbers
  FOR ALL USING (public.is_manager());

CREATE POLICY "Managers can manage goals" ON public.monthly_goals
  FOR ALL USING (public.is_manager());

CREATE POLICY "Managers can manage all productions" ON public.daily_productions
  FOR ALL USING (public.is_manager());