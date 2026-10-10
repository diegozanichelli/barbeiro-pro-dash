-- M6: Lotes de importação do controlador (histórico + exclusão).
--
-- Cada importação de CSV do controlador vira um "lote" com metadados (arquivo,
-- data, quantidade, total). Cada transação importada aponta para o lote via
-- sale_transactions.import_batch_id, permitindo listar o histórico e EXCLUIR uma
-- importação inteira (apagando seus lançamentos).

CREATE TABLE IF NOT EXISTS public.controller_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  file_name text,
  row_count integer NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.controller_import_batches ENABLE ROW LEVEL SECURITY;

-- Controlador (e gestor/super_admin) da própria organização gerencia os lotes.
CREATE POLICY "Controller/manager manage import batches"
ON public.controller_import_batches
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    organization_id = get_user_organization(auth.uid())
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'controller'::app_role)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    organization_id = get_user_organization(auth.uid())
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'controller'::app_role)
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_controller_import_batches_org
  ON public.controller_import_batches (organization_id, created_at DESC);

COMMENT ON TABLE public.controller_import_batches IS
  'Lotes de importação CSV do controlador: histórico (arquivo, data, qtd, total) e base para exclusão.';

-- Marca cada transação importada com o lote de origem. ON DELETE SET NULL para
-- não bloquear a exclusão do lote (os lançamentos são apagados pelo app antes).
ALTER TABLE public.sale_transactions
  ADD COLUMN IF NOT EXISTS import_batch_id uuid
  REFERENCES public.controller_import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_transactions_import_batch
  ON public.sale_transactions (import_batch_id)
  WHERE import_batch_id IS NOT NULL;
