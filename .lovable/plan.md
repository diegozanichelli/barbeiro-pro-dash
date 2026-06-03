## Problema
A coluna "👑 Ades. Totais" mostra apenas o número (ex.: 6 do Diego), sem deixar claro o que são essas adesões e sem permitir auditoria. O drilldown atual abre só a lista de "Oportunidades" (clientes novos atendidos), o que não responde "quais foram as 6 adesões?".

## Objetivo
Tornar a célula "Ades. Totais" clicável e mostrar, no diálogo de drilldown, a lista detalhada das adesões "nova" computadas para aquele barbeiro no período, com nome, telefone, plano, data, valor e marcador de "cliente novo" vs "cliente da casa". Manter a lista de Oportunidades como segunda aba.

## Mudanças

### 1. Coletar adesões por barbeiro durante o fetch
Em `src/components/dashboard/manager/SubscriptionPerformanceReport.tsx`:
- Adicionar `item_name`, `price_sold` ao select de `txQuery` e `recQuery`.
- No loop sobre `transactions`, quando `isNewSubscription(tx)`, empilhar em `existing.adhesions: Array<{ phone, name, planName, priceSold, createdAt, isNewClient }>`.
- Idem para `receptionTx` (lista separada `receptionAdhesions`).

### 2. Estender o `clientDrilldown`
Incluir o array `adhesions` no objeto setado em `drilldownMap.set(barberId, …)` e um equivalente no `receptionRow` (já que recepção também é clicável visualmente — manter consistência).

### 3. Diálogo com abas
Substituir o conteúdo do `<Dialog>` por `Tabs` (shadcn) com duas abas:
- **Adesões totais (N)** — nova aba padrão se o usuário clicou na coluna Ades. Totais. Lista ordenada por data desc, cada linha: nome, telefone formatado, badge "Cliente novo" ou "Cliente da casa", plano (`item_name`), valor, data (Manaus).
- **Oportunidades (N)** — conteúdo atual (lista de telefones únicos com botão "Dar baixa legado").

Estado novo: `drilldownTab: "adhesions" | "opportunities"`. Setado para `"adhesions"` quando o usuário clica na célula Ades. Totais; `"opportunities"` quando clica na linha (comportamento atual) ou na célula de Oportunidades.

### 4. Tornar a célula clicável com `stopPropagation`
- Envolver `b.totalAdhesions` em um `<button>` que chama `setSelectedDrilldownBarberId(b.barberId); setDrilldownTab("adhesions"); e.stopPropagation()`.
- Mesmo tratamento para a célula de Oportunidades (abre aba "opportunities") — mais consistente.
- Aplicar também à linha da Recepção.

### 5. Tooltip do header
Atualizar o tooltip da coluna "Ades. Totais" para: "Toda assinatura com ação = 'nova' atribuída a este barbeiro no mês. Clique para ver a lista detalhada."

### 6. Validação manual
- Abrir o relatório, achar Diego Indrago, clicar nas 6 adesões → o diálogo abre na aba "Adesões totais" com 6 linhas.
- Conferir que a soma de `is_new_client=true` na lista bate com o valor da coluna "Ades. Cliente Novo".
- Conferir Recepção também.

## Arquivos afetados
- `src/components/dashboard/manager/SubscriptionPerformanceReport.tsx` (única alteração)

## Fora de escopo
- Não mudar regra de cálculo de conversão/penetração.
- Não tocar em wizard/edição de assinaturas a partir do drilldown (botão "Dar baixa legado" continua só na aba Oportunidades).