# Revisão das abas Gestão e Assinaturas

## Problemas encontrados (confirmados no código)

1. **Relatório de Performance de Assinaturas** – o último dia do mês é calculado convertendo para UTC; dependendo do fuso do aparelho, o último dia pode ser cortado. Há também um telefone de depuração fixo no código.
2. **Inteligência de Assinaturas** – a lista de unidades do filtro não restringe pela barbearia; para o super admin podem aparecer unidades de outras barbearias.
3. **Relatório de Cobrança Recorrente** – o "total de adesões" usado como base do percentual soma renovações, upgrades e downgrades; o percentual de recorrência fica subestimado. A lista de unidades também inclui unidades inativas sem distinção.
4. **Clientes** – só planos ativos são carregados; clientes em plano desativado aparecem sem nome de plano. A tela varre todo o histórico de vendas no navegador (3 laços de paginação), deixando-a lenta conforme a base cresce.
5. **Planos de Assinatura** – ao salvar, os serviços vinculados são apagados e reinseridos em passos separados; se a segunda etapa falhar, o plano fica sem serviços e a mensagem de sucesso já apareceu.

## Correções propostas

1. Calcular início/fim do mês com as datas puras do fuso Manaus (helper já existente) e remover o telefone de depuração.
2. Filtrar unidades por `organization_id` na Inteligência de Assinaturas.
3. Na Cobrança Recorrente, usar como base apenas `new` + `auto_recurring` coerentes (definir: adesões reais = novas + renovações pagas, excluindo migrados/upgrade/downgrade) e mostrar a regra em tooltip.
4. Em Clientes, carregar todos os planos (ativos e inativos, marcando "inativo") e mover a busca de "último pagamento" e "tem histórico" para uma função no banco que devolve só o resumo por telefone.
5. Salvar plano + serviços em uma única operação no banco (tudo ou nada) e só exibir sucesso ao final.

## Melhorias sugeridas (opcionais)
- Centralizar a regra de "oportunidade de conversão" e "nova adesão" em um único utilitário usado por todos os relatórios (hoje há um TODO no código sobre divergência).
- Indicador na tela de Metas quando o barbeiro não tem meta no mês (em vez de valor herdado silencioso).

## Detalhes técnicos
- Arquivos: `SubscriptionPerformanceReport.tsx`, `SubscriptionAnalytics.tsx`, `AutoRecurringReport.tsx`, `ClientsManagement.tsx`, `SubscriptionPlansManagement.tsx`, `src/lib/metricsRules.ts`.
- Novas RPCs: `get_clients_subscription_summary(p_organization_id)` e `save_subscription_plan(p_plan_id, p_name, p_price, p_service_ids)` (security definer, checando gestor da organização).
- Validar comparando totais antes/depois em um mês com dados reais.
