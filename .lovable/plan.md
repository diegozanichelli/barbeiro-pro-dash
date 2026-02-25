

# Plano de Correção dos Erros de Build

## Resumo

Existem 4 arquivos com erros que precisam ser corrigidos. São erros de sintaxe e ordenação de código, não de lógica.

---

## Correções

### 1. `BarberEditProductionModal.tsx` — Import duplicado

O import do `DropdownMenu` aparece duas vezes (linhas 29-34 e linhas 53-58). Remover o segundo import duplicado (linhas 53-58).

### 2. `BarberDashboard.tsx` — Variáveis usadas antes da declaração

Os `useEffect` nas linhas 114-198 referenciam `fetchBarberData`, `fetchMonthlyGoal`, `fetchMonthlyStats` e `calculateDailyTarget`, mas essas funções só são declaradas a partir da linha 200. Solução: mover os 3 blocos `useEffect` (linhas 114-198) para depois das declarações das funções (`fetchBarberData`, `fetchMonthlyGoal`, `fetchMonthlyStats`, `calculateDailyTarget`).

### 3. `DailyGoalsTracking.tsx` — Variáveis usadas antes da declaração

O `useEffect` na linha 80-83 referencia `fetchUnits` e `fetchDailyGoals`, declarados nas linhas 85+. Solução: mover o `useEffect` para depois das declarações dessas funções.

### 4. `LiveDashboard.tsx` — Campo `date` ausente na query

A query de `daily_productions` (linhas 206-221) não seleciona o campo `date`, mas o tipo `MonthProduction` exige esse campo. Solução: adicionar `date` ao `.select()` da query.

---

## Detalhes Técnicos

| Arquivo | Erro | Correção |
|---------|------|----------|
| `BarberEditProductionModal.tsx` | Import duplicado de DropdownMenu (linhas 53-58) | Remover linhas 53-58 |
| `BarberDashboard.tsx` | 3 useEffects antes das funções que referenciam | Mover useEffects para após as declarações de funções |
| `DailyGoalsTracking.tsx` | useEffect antes de fetchUnits/fetchDailyGoals | Mover useEffect para após as declarações |
| `LiveDashboard.tsx` | `date` ausente no .select() | Adicionar `date` ao select |

Nenhuma alteração de lógica ou banco de dados é necessária.

