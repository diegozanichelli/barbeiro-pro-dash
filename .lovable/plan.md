## Deduplicar contagem de atendimentos no drilldown

### Causa
Em `SubscriptionPerformanceReport.tsx` (linhas ~341-351), `attendanceCountMap` faz `+1` para cada `sale_transactions` com `is_new_client=true`. Quando o cliente recebe múltiplos itens no mesmo checkout (ex.: corte + produto), cada item vira uma linha e a contagem infla.

Exemplo Igson Farias: 1 atendimento real, 2 linhas (service + product) com `created_at` idêntico → mostra "2 lançamentos como novo".

### Mudança

**Arquivo:** `src/components/dashboard/manager/SubscriptionPerformanceReport.tsx`

Trocar `attendanceCountMap` de `Map<phone, number>` para `Map<phone, Set<string>>`, onde o Set guarda chaves únicas de atendimento (`created_at` da transação). No final, `attendances = set.size || 1`.

Isso colapsa todos os itens do mesmo checkout em 1 atendimento, mantendo a lógica de "oportunidade" (`opportunityPhones`) intacta.

### Fora de escopo
- Não mexer em SQL/RPC nem em outras métricas (oportunidades, conversão, regularização).