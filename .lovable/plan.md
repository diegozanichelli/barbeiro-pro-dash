## Correção do drilldown — caso Igson Farias

### Causa
Em `SubscriptionPerformanceReport.tsx`:
1. `legacy_import` lançados pela recepção (`barber_id = NULL`) são adicionados apenas a `globalRegularizedPhones`, nunca a `regularizedPhones` por barbeiro.
2. Existem dois blocos `const drilldownMap = new Map(...)` no mesmo escopo `try` (linhas ~273 e ~366). O primeiro renderiza e ignora `globalRegularizedPhones`; o segundo (que consultaria o global) é código duplicado/morto.

### Mudanças (somente UI/lógica de leitura)

**Arquivo:** `src/components/dashboard/manager/SubscriptionPerformanceReport.tsx`

1. **Remover o primeiro bloco `drilldownMap` (linhas ~273-300)** e o seu `setClientDrilldown(drilldownMap)`. Manter apenas o segundo bloco (linhas ~366-397), que já considera `globalRegularizedPhones`.
2. Garantir que a ordem de execução fique: monta `barberMap` (transações com barbeiro) → processa `receptionTx` populando `globalRegularizedPhones` → constrói `drilldownMap` único usando `convertedPhones ∪ regularizedPhones ∪ globalRegularizedPhones`.
3. Manter o log `[debug-phone]` existente para validação rápida em produção; nenhum novo log permanente.

### Resultado esperado
- Igson Farias passa a aparecer com o badge "Assinante Legado" (cinza) no drilldown do Henrique, em vez de "Não converteu".
- Total de Oportunidades do Henrique subtrai 1 para Igson (já existe a lógica via `regularizedPhones`/`globalRegularizedPhones` no cálculo de oportunidades — não precisa mudar).
- Build volta a ter um único `const drilldownMap` (elimina a redeclaração).

### Fora de escopo
- Não mexer em queries SQL, RPCs, RLS, ou backfill de dados.
- Não alterar `LiveDashboard`, `SubscriptionAnalytics` ou `QuickSaleModal`.
- Não criar novas migrations.