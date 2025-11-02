-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'manager', 'barber');

-- Create organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  stripe_customer_id TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'trial',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_subscription_status CHECK (subscription_status IN ('trial', 'active', 'delinquent', 'canceled'))
);

-- Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create user_roles table for proper role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, organization_id)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Add organization_id to existing tables
ALTER TABLE public.units ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.barbers ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.daily_productions ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.monthly_goals ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_organization_id ON public.user_roles(organization_id);
CREATE INDEX idx_units_organization_id ON public.units(organization_id);
CREATE INDEX idx_barbers_organization_id ON public.barbers(organization_id);
CREATE INDEX idx_daily_productions_organization_id ON public.daily_productions(organization_id);
CREATE INDEX idx_monthly_goals_organization_id ON public.monthly_goals(organization_id);

-- RLS Policies for organizations
CREATE POLICY "Super admins can view all organizations"
  ON public.organizations FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Managers can view their organization"
  ON public.organizations FOR SELECT
  USING (id = public.get_user_organization(auth.uid()));

CREATE POLICY "Super admins can manage all organizations"
  ON public.organizations FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Managers can manage roles in their organization"
  ON public.user_roles FOR ALL
  USING (
    organization_id = public.get_user_organization(auth.uid()) 
    AND public.has_role(auth.uid(), 'manager')
  );

-- Update RLS policies for units
DROP POLICY IF EXISTS "Barbers can view units" ON public.units;
DROP POLICY IF EXISTS "Managers can manage units" ON public.units;

CREATE POLICY "Users can view units in their organization"
  ON public.units FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Managers can manage units in their organization"
  ON public.units FOR ALL
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Super admins can manage all units"
  ON public.units FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Update RLS policies for barbers
DROP POLICY IF EXISTS "Barbers can view their own data" ON public.barbers;
DROP POLICY IF EXISTS "Managers can manage barbers" ON public.barbers;
DROP POLICY IF EXISTS "Managers can view all barbers" ON public.barbers;

CREATE POLICY "Barbers can view their own data"
  ON public.barbers FOR SELECT
  USING (user_id = auth.uid() AND organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Managers can manage barbers in their organization"
  ON public.barbers FOR ALL
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Super admins can manage all barbers"
  ON public.barbers FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Update RLS policies for daily_productions
DROP POLICY IF EXISTS "Barbers can manage their own productions" ON public.daily_productions;
DROP POLICY IF EXISTS "Managers can manage all productions" ON public.daily_productions;

CREATE POLICY "Barbers can manage their own productions"
  ON public.daily_productions FOR ALL
  USING (
    barber_id IN (
      SELECT id FROM public.barbers 
      WHERE user_id = auth.uid() 
      AND organization_id = public.get_user_organization(auth.uid())
    )
  );

CREATE POLICY "Managers can manage productions in their organization"
  ON public.daily_productions FOR ALL
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Super admins can manage all productions"
  ON public.daily_productions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Update RLS policies for monthly_goals
DROP POLICY IF EXISTS "Barbers can view their own goals" ON public.monthly_goals;
DROP POLICY IF EXISTS "Managers can manage goals" ON public.monthly_goals;

CREATE POLICY "Barbers can view their own goals"
  ON public.monthly_goals FOR SELECT
  USING (
    barber_id IN (
      SELECT id FROM public.barbers 
      WHERE user_id = auth.uid()
      AND organization_id = public.get_user_organization(auth.uid())
    )
  );

CREATE POLICY "Managers can manage goals in their organization"
  ON public.monthly_goals FOR ALL
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Super admins can manage all goals"
  ON public.monthly_goals FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Update RLS policies for profiles
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Managers can view profiles in their organization"
  ON public.profiles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'manager')
    AND id IN (
      SELECT user_id FROM public.user_roles
      WHERE organization_id = public.get_user_organization(auth.uid())
    )
  );

CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Trigger for organizations updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Remove role column from profiles (since we're using user_roles table now)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;