

# Plano: Limpar Dashboard do Barbeiro

## Mudanças em `src/components/dashboard/BarberDashboard.tsx`

### 1. Remover card "HISTÓRICO DOS ÚLTIMOS 3 DIAS" (linhas 941-1006)
Remover todo o bloco do card. A funcionalidade de confirmação de presença (botão "Não vendi nada hoje") que está dentro dele precisa ser **preservada** — será movida para dentro do card de "Faturamento de Hoje" ou exibida de forma standalone logo abaixo dos cards de estatísticas.

### 2. Remover card "Meus Ganhos de Assinatura" (linhas 1010-1017)
Remover o bloco `SubscriptionEarningsCard` e seu import (linha 15). Esse dado é exclusivo do gestor.

### 3. Limpeza de código morto
- Remover import de `SubscriptionEarningsCard` (linha 15)
- Remover interface `LastDaysProduction` (linhas 78-86) e estado `last3DaysProduction` (linha 127)
- Remover a query dos últimos 3 dias no `fetchMonthlyGoal` e o `setLast3DaysProduction`
- Manter o botão de confirmação de presença acessível ao barbeiro (reposicionar)

