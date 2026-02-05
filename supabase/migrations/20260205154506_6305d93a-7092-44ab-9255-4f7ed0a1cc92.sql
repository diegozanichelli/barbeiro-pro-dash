-- Adicionar coluna de taxa de comissão de assinaturas na tabela barbers
ALTER TABLE public.barbers 
ADD COLUMN IF NOT EXISTS subscription_commission_rate NUMERIC DEFAULT 0;

-- Comentário para documentação
COMMENT ON COLUMN public.barbers.subscription_commission_rate IS 'Taxa de comissão para vendas de assinaturas (%), configurada manualmente pelo gestor';