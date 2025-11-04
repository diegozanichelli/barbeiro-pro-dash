-- Corrigir bug de fuso horário na coluna date
-- Passo 1: Converter todas as datas existentes para o fuso horário correto (Brasil)
-- Passo 2: Alterar o tipo da coluna para date (sem timezone)

-- Converter timestamptz para date considerando o fuso horário de São Paulo
ALTER TABLE daily_productions 
ALTER COLUMN date TYPE date 
USING (date AT TIME ZONE 'America/Sao_Paulo')::date;