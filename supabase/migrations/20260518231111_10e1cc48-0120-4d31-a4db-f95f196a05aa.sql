
CREATE TABLE public.presentation_slide_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL,
  unit_key text NOT NULL DEFAULT 'all',
  slide_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, month, year, unit_key, slide_key)
);

ALTER TABLE public.presentation_slide_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage overrides in their org"
  ON public.presentation_slide_overrides
  FOR ALL TO public
  USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Super admins manage all overrides"
  ON public.presentation_slide_overrides
  FOR ALL TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_pres_overrides_updated_at
  BEFORE UPDATE ON public.presentation_slide_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
