-- Adiciona o papel "controller" (controlador) ao enum de papéis.
--
-- O controlador é a pessoa que lança, por fora do balcão, os eventos de
-- assinatura que a recepção não registra: cancelamentos, renovações
-- automáticas (cartão cobrado pelo gateway) e vendas online. Ele tem login
-- próprio e enxerga apenas a sua área de lançamento.
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE precisa ficar sozinho nesta migração.
-- O Postgres não permite usar o valor novo do enum na mesma transação em que
-- ele é adicionado; as policies/funções que referenciam 'controller'::app_role
-- ficam em migrações posteriores (ver 20261005120100_*).

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'controller';
