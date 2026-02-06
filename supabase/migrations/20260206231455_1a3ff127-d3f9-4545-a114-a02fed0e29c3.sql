-- Adicionar coluna unit_id em sale_transactions para rastrear unidade da venda
ALTER TABLE public.sale_transactions 
ADD COLUMN unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;

-- Criar índice para melhorar performance das queries de relatório
CREATE INDEX idx_sale_transactions_unit_id ON public.sale_transactions(unit_id);

-- Comentário para documentar o propósito
COMMENT ON COLUMN public.sale_transactions.unit_id IS 'Unidade onde a venda foi realizada. Obrigatório para vendas da recepção (barber_id = null)';