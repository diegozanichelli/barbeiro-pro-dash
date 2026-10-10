CREATE TABLE IF NOT EXISTS public.unit_weekly_growth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  growth_pct numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  UNIQUE (organization_id, unit_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_weekly_growth TO authenticated;
GRANT ALL ON public.unit_weekly_growth TO service_role;
ALTER TABLE public.unit_weekly_growth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage unit weekly growth" ON public.unit_weekly_growth FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role) OR (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role)))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role)));
CREATE INDEX IF NOT EXISTS idx_unit_weekly_growth_org ON public.unit_weekly_growth (organization_id);