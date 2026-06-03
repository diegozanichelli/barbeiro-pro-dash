## Objetivo
Garantir que vendas com `item_type='subscription'` **nunca** sejam somadas ao "Vendido" / cálculo de progresso da meta diária no painel **Ao Vivo** (manager), mantendo-as visíveis apenas no card lateral "Ranking de Assinaturas".

## Diagnóstico
Auditei `src/components/dashboard/manager/LiveDashboard.tsx` e a maior parte dos cálculos já exclui assinatura. Caso do Leiva hoje confirma na base:
- 2 serviços avulsos reais de R$80 (clientes diferentes da assinatura) → R$160
- 1 assinatura nova R$197,90 (com 2 serviços-benefício R$0)
- `daily_productions.tx_basic_total = 160` (correto)

Porém existem pontos onde a exclusão depende de filtros espalhados e fáceis de regredir, e o usuário está vendo o valor da assinatura aparecer no "Vendido" da linha do barbeiro. Vamos centralizar a regra e blindar todos os agregados.

## Mudanças

### 1. Helper único de exclusão de assinatura
Em `src/lib/metricsRules.ts` adicionar:
```ts
export const isOperationalRevenueTx = (tx: MetricTx): boolean =>
  tx.item_type !== "subscription";
```
Reaproveitar `isSubscriptionRevenue` já existente.

### 2. `LiveDashboard.tsx` — blindar todos os agregados de "faturamento operacional"
Aplicar `isOperationalRevenueTx` em:
- `getBarberRevenue` (linha 443)
- `receptionRows` (linha 352)
- `unitRankings` (linha 776)
- `yesterdayTx` reduce (linha 309)
- `barberClientKeys` / contagem de atendimentos (linha 1201) — já exclui, manter
- `totalRevenue` (já deriva de `getBarberRevenue`, manter)

### 3. Ranking de assinaturas continua intacto
`subscriptionRankingData` (linha 787) continua filtrando **apenas** `item_type === 'subscription'`. Card lateral segue mostrando para acompanhamento do gestor — sem alteração visual.

### 4. Adicionar badge "Assinaturas: N" na linha do barbeiro (opcional, leve)
Na grid de linhas (≈ linha 1244), abaixo do nome, mostrar contador discreto quando o barbeiro tiver assinaturas vendidas no dia, deixando explícito que estão sendo registradas mas **não somam** à meta. Tooltip: "Assinaturas não contam na meta diária; veja o ranking de assinaturas ao lado".

### 5. Validação
Após o ajuste, abrir Ao Vivo logado como gestor e conferir Leiva:
- "Vendido" = R$ 160,00
- Badge "1 assinatura" na linha
- Card "Ranking de Assinaturas" exibindo Leiva com 1 venda R$ 197,90
- Total da equipe e ranking de unidade sem o R$ 197,90

### Fora de escopo
- BarberDashboard (app do barbeiro) — não foi mencionado
- DailyGoalsTracking (aba Metas do gestor) — já usa `commission_earned` que tem comissão 0 para assinatura
- Folha mensal / outros relatórios

## Arquivos afetados
- `src/lib/metricsRules.ts` (adicionar helper)
- `src/components/dashboard/manager/LiveDashboard.tsx` (aplicar helper + badge informativo)