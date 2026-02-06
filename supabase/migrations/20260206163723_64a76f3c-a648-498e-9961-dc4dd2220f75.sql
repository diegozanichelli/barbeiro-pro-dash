-- Adicionar coluna is_new_client para rastrear conversão de novos clientes em assinaturas
ALTER TABLE public.sale_transactions
ADD COLUMN is_new_client BOOLEAN DEFAULT FALSE;

-- Comentário para documentação
COMMENT ON COLUMN public.sale_transactions.is_new_client IS 'Indica se o cliente era novo (TRUE) ou já era cliente da casa (FALSE) no momento da venda. Útil para métricas de conversão de assinaturas.';