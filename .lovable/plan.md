

# Plano de Correção: Build Errors + Tabela de Feriados

## Problemas Identificados

1. **Tabela `organization_holidays` não existe no banco** — a migration existe no código mas nunca foi aplicada. Isso causa o erro ao salvar feriados.
2. **`BarberDashboard.tsx` (linha 359)** — `isCurrentMonth` usado no `useMemo` do `pacingCoachMessage` mas é uma variável local dentro de `calculateDailyTarget`. Precisa ser declarada como estado/variável do componente antes do `useMemo`.
3. **`DailyGoalsTracking.tsx` (linha 83)** — `useEffect` referencia `fetchUnits` e `fetchDailyGoals` antes de suas declarações. Mover o `useEffect` para depois.
4. **`ManagerReports.tsx` (linha 109)** — `rpcData` não existe. A chamada RPC ao `get_manager_report_stats` foi removida/perdida. Precisa restaurar a chamada RPC antes de usar `rpcData`. Também `goalsAchieved` (linha 180) é usado sem declaração prévia.

---

## Correções

### 1. Criar tabela `organization_holidays` no banco
Aplicar migration SQL para criar a tabela com RLS, já que o arquivo existe mas não foi executado.

### 2. `BarberDashboard.tsx` — Extrair `isCurrentMonth` para escopo do componente
Adicionar uma variável `isCurrentMonth` no escopo do componente (antes do `useMemo` na linha 340), derivada de `selectedMonth`, `selectedYear` e `getCurrentMonthYear()`. Manter a variável local dentro de `calculateDailyTarget` como está (não causa conflito pois é escopo de função).

A segunda declaração na linha 660 deve ser removida e substituída pela variável do componente.

### 3. `DailyGoalsTracking.tsx` — Reordenar useEffect
Mover o `useEffect` (linhas 80-83) para depois das declarações de `fetchUnits` e `fetchDailyGoals`.

### 4. `ManagerReports.tsx` — Restaurar chamada RPC e declarar `goalsAchieved`
- Adicionar a chamada RPC `get_manager_report_stats` antes da linha 109 onde `rpcData` é usado
- Declarar `let goalsAchieved = 0` antes do bloco `if (productions)` na linha 141
- Incluir `goalsAchieved` no `setStats` ao final do callback

---

## Detalhes Técnicos

| Arquivo | Erro | Correção |
|---------|------|----------|
| Database | Tabela `organization_holidays` não existe | Aplicar migration SQL |
| `BarberDashboard.tsx:359` | `isCurrentMonth` fora de escopo | Extrair para variável do componente |
| `BarberDashboard.tsx:660` | Redeclaração de `isCurrentMonth` | Usar variável do componente |
| `DailyGoalsTracking.tsx:80-83` | useEffect antes das funções | Mover para depois das declarações |
| `ManagerReports.tsx:109` | `rpcData` não declarado | Restaurar chamada RPC `get_manager_report_stats` |
| `ManagerReports.tsx:180` | `goalsAchieved` não declarado | Declarar `let goalsAchieved = 0` antes do bloco |

