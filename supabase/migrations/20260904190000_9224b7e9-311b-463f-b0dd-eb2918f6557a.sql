-- Metas por frente do Plano de Ação do barbeiro.
--
-- O app do barbeiro passa a ter um Plano de Ação mensal com 5 frentes de
-- trabalho (clube, ticket com extras, produtos, frequência, produtividade).
-- A meta de cada frente é definida pelo GESTOR, por barbeiro/mês/ano — nunca
-- calculada pelo app nem copiada de material visual. Cada barbeiro vê ao lado
-- a sua base real (mês anterior), lida da própria produção.
--
-- Todas as colunas são anuláveis: linhas de metas já existentes seguem
-- intactas, e uma frente sem meta cadastrada aparece como "meta não definida
-- pelo gestor" na tela do barbeiro. Nenhuma política de RLS muda — as regras
-- que já protegem monthly_goals continuam valendo.

ALTER TABLE public.monthly_goals
  ADD COLUMN IF NOT EXISTS target_new_clubs integer,
  ADD COLUMN IF NOT EXISTS target_products_revenue numeric,
  ADD COLUMN IF NOT EXISTS target_extras_per_client numeric,
  ADD COLUMN IF NOT EXISTS target_frequency_uplift_pct numeric,
  ADD COLUMN IF NOT EXISTS target_productivity_pct numeric;

COMMENT ON COLUMN public.monthly_goals.target_new_clubs IS 'Meta de novos clientes convertidos para o clube no mês (frente 1). Definida pelo gestor.';
COMMENT ON COLUMN public.monthly_goals.target_products_revenue IS 'Meta de faturamento em produtos no mês, em R$ (frente 3). Definida pelo gestor.';
COMMENT ON COLUMN public.monthly_goals.target_extras_per_client IS 'Meta de serviços adicionais por cliente atendido, em R$ (frente 2). Definida pelo gestor.';
COMMENT ON COLUMN public.monthly_goals.target_frequency_uplift_pct IS 'Meta de aumento da frequência dos clientes sem clube, em % (frente 4). Definida pelo gestor.';
COMMENT ON COLUMN public.monthly_goals.target_productivity_pct IS 'Meta de agenda produtiva no mês, em % (frente 5). Definida pelo gestor.';

-- Metas não podem ser negativas (clube, R$, %). As colunas são anuláveis, então
-- a checagem só se aplica quando há valor.
ALTER TABLE public.monthly_goals
  ADD CONSTRAINT monthly_goals_target_new_clubs_nonneg
    CHECK (target_new_clubs IS NULL OR target_new_clubs >= 0),
  ADD CONSTRAINT monthly_goals_target_products_revenue_nonneg
    CHECK (target_products_revenue IS NULL OR target_products_revenue >= 0),
  ADD CONSTRAINT monthly_goals_target_extras_per_client_nonneg
    CHECK (target_extras_per_client IS NULL OR target_extras_per_client >= 0),
  ADD CONSTRAINT monthly_goals_target_frequency_uplift_pct_nonneg
    CHECK (target_frequency_uplift_pct IS NULL OR target_frequency_uplift_pct >= 0),
  ADD CONSTRAINT monthly_goals_target_productivity_pct_nonneg
    CHECK (target_productivity_pct IS NULL OR target_productivity_pct >= 0);
