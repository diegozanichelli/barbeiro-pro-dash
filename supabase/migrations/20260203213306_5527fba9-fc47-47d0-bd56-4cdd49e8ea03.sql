-- Add description column to sale_transactions for audit details
ALTER TABLE sale_transactions 
ADD COLUMN description TEXT;

COMMENT ON COLUMN sale_transactions.description IS 'Observações da transação (nome do cliente, detalhes, etc)';