-- Adicionar coluna confirmed_presence na tabela daily_productions
ALTER TABLE public.daily_productions
ADD COLUMN confirmed_presence BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.daily_productions.confirmed_presence IS 
  'Indica que o barbeiro confirmou presença mesmo sem vendas no dia';