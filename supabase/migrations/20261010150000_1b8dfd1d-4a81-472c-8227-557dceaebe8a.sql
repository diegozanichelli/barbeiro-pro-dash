-- M5: Meta semanal por unidade.
--
-- A meta semanal de cada unidade é construída como:
--   Meta = Base × (1 + growth_pct/100)
-- onde:
--   * Base = faturamento REAL da unidade na semana anterior (seg–dom), somando
--     assinaturas (balcão + renovações + online do controlador) + serviços +
--     produtos — calculado pelo app a partir de sale_transactions.
--   * growth_pct = % de crescimento definido pelo gestor, POR UNIDADE (esta tabela).
--
-- Aqui guardamos só o % por unidade (config do gestor). Base/Meta/Realizado são
-- derivados no app a partir da base real — nada de número de exemplo no banco.

CREATE TABLE IF NOT EXISTS public.unit_weekly_growth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  growth_pct numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  UNIQUE (organization_id, unit_id)
);

ALTER TABLE public.unit_weekly_growth ENABLE ROW LEVEL SECURITY;

-- Gestor (ou super_admin) gerencia o % da própria organização.
CREATE POLICY "Managers manage unit weekly growth"
ON public.unit_weekly_growth
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    organization_id = get_user_organization(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    organization_id = get_user_organization(auth.uid())
    AND has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE INDEX IF NOT EXISTS idx_unit_weekly_growth_org
  ON public.unit_weekly_growth (organization_id);

COMMENT ON TABLE public.unit_weekly_growth IS
  'Meta semanal por unidade: % de crescimento sobre a semana anterior, definido pelo gestor.';
COMMENT ON COLUMN public.unit_weekly_growth.growth_pct IS
  'Percentual de crescimento sobre a base (semana anterior). Ex.: 5 = +5%.';
