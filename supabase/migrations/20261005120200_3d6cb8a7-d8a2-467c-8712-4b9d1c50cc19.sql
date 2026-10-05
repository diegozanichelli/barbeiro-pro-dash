-- Cancelamento de assinatura no cadastro do cliente.
--
-- Até aqui não havia como registrar um cancelamento: "cancelado" só era
-- inferido quando o ciclo vencia. O controlador passa a lançar cancelamentos,
-- e isso precisa (1) zerar o vínculo de plano do cliente (feito pela aplicação
-- ao setar subscription_plan_id = NULL) e (2) marcar quando/por que cancelou,
-- para o relatório de churn.
--
-- O evento em si fica registrado em sale_transactions
-- (subscription_action = 'cancel'); estas colunas guardam o estado atual do
-- cliente para leitura rápida.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_reason text;
