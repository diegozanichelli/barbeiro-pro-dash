-- M4: Vencimento x Pagamento das assinaturas (data de vencimento prevalece).
--
-- Regra de negócio (confirmada pelo gestor):
--   * Toda renovação MANTÉM o vencimento vigente por padrão — pagar atrasado
--     não desloca o ciclo (o vencimento prevalece). Próximo vencimento =
--     vencimento atual + 1 mês (avançando meses inteiros se o cliente perdeu
--     um ciclo, para nunca gerar vencimento no passado).
--   * Pagamento com MAIS de 10 dias de atraso apenas MARCA o cliente (flag)
--     para aparecer na aba de gestão — a data não muda sozinha.
--   * Flag por cliente: 'keep' (mantém a data, padrão) ou 'follow_payment'
--     (cliente solicitou trocar a data do contrato → a próxima renovação
--     re-ancora na data de pagamento; depois volta a 'keep').
--   * Vale para renovação automática (gateway/controladoria) e manual (balcão).
--
-- O "vencimento vigente" passa a ser um campo próprio em clients
-- (subscription_due_date), fonte única de verdade, em vez de só derivar do
-- JSON (cycle_anchor/next_due) gravado no description da transação. O JSON
-- continua sendo gravado para compatibilidade com o cálculo de ciclo existente.

-- ---------------------------------------------------------------------------
-- Colunas novas em clients
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS subscription_due_date date,
  ADD COLUMN IF NOT EXISTS subscription_due_policy text NOT NULL DEFAULT 'keep',
  ADD COLUMN IF NOT EXISTS subscription_last_payment_at date,
  ADD COLUMN IF NOT EXISTS subscription_last_late_days integer,
  ADD COLUMN IF NOT EXISTS subscription_payment_shift_flagged_at timestamptz;

-- Só aceita os dois valores previstos para a política.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_subscription_due_policy_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_subscription_due_policy_check
      CHECK (subscription_due_policy IN ('keep', 'follow_payment'));
  END IF;
END $$;

-- Índice parcial para a aba de gestão (clientes marcados).
CREATE INDEX IF NOT EXISTS idx_clients_payment_shift_flagged
  ON public.clients (organization_id, subscription_payment_shift_flagged_at)
  WHERE subscription_payment_shift_flagged_at IS NOT NULL;

COMMENT ON COLUMN public.clients.subscription_due_date IS
  'Vencimento vigente do contrato de assinatura (fonte única). Null = sem ciclo conhecido.';
COMMENT ON COLUMN public.clients.subscription_due_policy IS
  'keep = mantém a data (padrão); follow_payment = cliente solicitou trocar, próxima renovação re-ancora no pagamento.';
COMMENT ON COLUMN public.clients.subscription_last_payment_at IS
  'Data do último pagamento registrado (renovação).';
COMMENT ON COLUMN public.clients.subscription_last_late_days IS
  'Dias de atraso do último pagamento em relação ao vencimento vigente (>0 = atrasado).';
COMMENT ON COLUMN public.clients.subscription_payment_shift_flagged_at IS
  'Marcado quando um pagamento chegou com mais de 10 dias de atraso. Lido pela aba de gestão.';

-- ---------------------------------------------------------------------------
-- Helper: cast seguro de texto para jsonb (null em vez de erro).
-- Usado no backfill porque o campo description nem sempre é JSON.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_jsonb(p text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Backfill do vencimento vigente a partir do next_due da última transação de
-- assinatura de cada cliente (new/renew/upgrade). Só para assinantes ativos.
-- ---------------------------------------------------------------------------
UPDATE public.clients c
SET subscription_due_date = sub.next_due
FROM (
  SELECT DISTINCT ON (st.organization_id, st.mobile_phone)
    st.organization_id,
    st.mobile_phone,
    (public.safe_jsonb(st.description) ->> 'next_due')::date AS next_due
  FROM public.sale_transactions st
  WHERE st.item_type = 'subscription'
    AND st.subscription_action IN ('new', 'renew', 'upgrade')
    AND public.safe_jsonb(st.description) ->> 'next_due' IS NOT NULL
  ORDER BY st.organization_id, st.mobile_phone, st.created_at DESC
) sub
WHERE c.organization_id = sub.organization_id
  AND c.mobile_phone = sub.mobile_phone
  AND c.subscription_plan_id IS NOT NULL
  AND c.subscription_due_date IS NULL;
