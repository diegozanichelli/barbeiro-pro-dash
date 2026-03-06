

# Plano: Restaurar Busca da Meta Mensal no Dashboard do Barbeiro

## Diagnóstico

A função `fetchMonthlyGoal` (linha 158) **não busca a meta mensal** — ela só carrega os últimos 3 dias de produção e vendas ao vivo. `setMonthlyGoal` nunca é chamado com dados reais, então `monthlyGoal` permanece `null`. Isso faz `calculateDailyTarget` abortar na linha 336 (`if (!monthlyGoal || ...) return`), resultando em `dailyTarget = 0` e o card exibindo "N/A / Aguardando dados".

## Correção

### Adicionar query à tabela `monthly_goals` dentro de `fetchMonthlyGoal`

Na função `fetchMonthlyGoal` (linha 158), adicionar uma terceira query no `Promise.all` buscando da tabela `monthly_goals`:

```typescript
supabase
  .from("monthly_goals")
  .select("target_commission")
  .eq("barber_id", barber.id)
  .eq("month", selectedMonth)
  .eq("year", selectedYear)
  .maybeSingle()
```

E após o `Promise.all`, chamar `setMonthlyGoal(goalData)` com o resultado.

### Arquivo afetado

| Arquivo | Mudança |
|---|---|
| `BarberDashboard.tsx` | Restaurar fetch de `monthly_goals` + `setMonthlyGoal` dentro de `fetchMonthlyGoal` |

