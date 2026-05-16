## Objetivo
Garantir que os horários exibidos nas áreas de assinaturas reflitam corretamente o horário de Manaus, sem adiantar 2–3 horas, e manter o nome do cliente consistente onde já foi corrigido.

## O que vou ajustar
1. Padronizar a formatação de horário nas telas de assinaturas
- Revisar `SubscriptionAuditModal.tsx` e `SubscriptionAnalytics.tsx` para usar uma única estratégia de renderização de `created_at`.
- Remover conversões duplicadas de timezone onde o valor já chega pronto em UTC/timestamptz.

2. Criar uma regra única de data/hora para Manaus
- Centralizar um helper de exibição para timestamps de transação.
- Aplicar o helper nas telas de assinatura para evitar diferenças entre `format`, `toZonedTime` e `formatInTimeZone`.

3. Validar a origem do dado
- Conferir o fluxo que grava `sale_transactions.created_at` nas funções de backend já existentes.
- Manter compatibilidade com registros já salvos e evitar quebrar filtros por período.

4. Verificar pontos correlatos da mesma área
- Revisar outros componentes do manager que exibem `created_at` de `sale_transactions` com padrão semelhante, para evitar que o mesmo bug continue em telas irmãs.

## Resultado esperado
- Horário da auditoria e da inteligência de assinaturas batendo com o horário real em Manaus.
- Sem regressão no nome do cliente.
- Formatação consistente entre listas, tabelas e detalhes.

## Detalhes técnicos
- `sale_transactions.created_at` é `timestamptz`.
- Há funções SQL que montam `created_at` com `AT TIME ZONE 'America/Manaus'`, então a UI precisa evitar “converter de novo” um valor que já representa o instante correto.
- Vou preferir uma função única de apresentação no frontend para reduzir bugs de timezone espalhados.

## Arquivos prováveis
- `src/components/dashboard/manager/SubscriptionAuditModal.tsx`
- `src/components/dashboard/manager/SubscriptionAnalytics.tsx`
- `src/lib/dateUtils.ts` ou helper dedicado de data
- Possivelmente 1 ou 2 componentes relacionados que também leem `sale_transactions.created_at`