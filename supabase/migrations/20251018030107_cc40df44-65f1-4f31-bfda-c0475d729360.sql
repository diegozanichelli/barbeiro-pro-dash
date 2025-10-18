-- Sistema SAS de Performance para Barbearias

-- Tabela de Unidades (Filiais)
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Barbeiros
CREATE TABLE public.barbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  services_commission DECIMAL(5,2) NOT NULL DEFAULT 50.00 CHECK (services_commission >= 0 AND services_commission <= 100),
  products_commission DECIMAL(5,2) NOT NULL DEFAULT 15.00 CHECK (products_commission >= 0 AND products_commission <= 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Metas Mensais
CREATE TABLE public.monthly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  target_commission DECIMAL(10,2) NOT NULL CHECK (target_commission >= 0),
  work_days INTEGER NOT NULL CHECK (work_days > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(barber_id, month, year)
);

-- Tabela de Lançamentos Diários
CREATE TABLE public.daily_productions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  barber_id UUID NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  services_total DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (services_total >= 0),
  products_total DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (products_total >= 0),
  clients_count INTEGER NOT NULL DEFAULT 0 CHECK (clients_count >= 0),
  services_count INTEGER NOT NULL DEFAULT 0 CHECK (services_count >= 0),
  products_count INTEGER NOT NULL DEFAULT 0 CHECK (products_count >= 0),
  commission_earned DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date, barber_id)
);

-- Tabela de Perfis (para autenticação)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'barber' CHECK (role IN ('manager', 'barber')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies para Units
CREATE POLICY "Managers can manage units" ON public.units
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'manager'
    )
  );

CREATE POLICY "Barbers can view units" ON public.units
  FOR SELECT USING (true);

-- RLS Policies para Barbers
CREATE POLICY "Managers can manage barbers" ON public.barbers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'manager'
    )
  );

CREATE POLICY "Barbers can view all barbers" ON public.barbers
  FOR SELECT USING (true);

-- RLS Policies para Monthly Goals
CREATE POLICY "Managers can manage goals" ON public.monthly_goals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'manager'
    )
  );

CREATE POLICY "Barbers can view their own goals" ON public.monthly_goals
  FOR SELECT USING (
    barber_id IN (
      SELECT id FROM public.barbers WHERE user_id = auth.uid()
    )
  );

-- RLS Policies para Daily Productions
CREATE POLICY "Managers can manage all productions" ON public.daily_productions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'manager'
    )
  );

CREATE POLICY "Barbers can manage their own productions" ON public.daily_productions
  FOR ALL USING (
    barber_id IN (
      SELECT id FROM public.barbers WHERE user_id = auth.uid()
    )
  );

-- RLS Policies para Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Managers can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
    )
  );

-- Trigger para criar perfil automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    COALESCE(new.raw_user_meta_data->>'role', 'barber')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers para updated_at
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_barbers_updated_at BEFORE UPDATE ON public.barbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_monthly_goals_updated_at BEFORE UPDATE ON public.monthly_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_productions_updated_at BEFORE UPDATE ON public.daily_productions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para calcular comissão ao salvar lançamento
CREATE OR REPLACE FUNCTION public.calculate_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_services_commission DECIMAL(5,2);
  v_products_commission DECIMAL(5,2);
BEGIN
  -- Buscar as comissões do barbeiro
  SELECT services_commission, products_commission
  INTO v_services_commission, v_products_commission
  FROM public.barbers
  WHERE id = NEW.barber_id;

  -- Calcular comissão total do dia
  NEW.commission_earned := 
    (NEW.services_total * v_services_commission / 100) +
    (NEW.products_total * v_products_commission / 100);

  RETURN NEW;
END;
$$;

CREATE TRIGGER calculate_daily_commission
  BEFORE INSERT OR UPDATE ON public.daily_productions
  FOR EACH ROW EXECUTE FUNCTION public.calculate_commission();