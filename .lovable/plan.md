

# Plano: Corrigir Divergência Gestor/Barbeiro + Fuso Horário + Fechamento 23h

## 1. Corrigir Divergência de Itens (DayReviewModal.tsx)

**Problema**: A query na linha 148-150 filtra por `created_at` sem offset de fuso, e pode perder transações que não foram vinculadas ao `daily_production_id`.

**Correção** (linhas 144-151):
- Adicionar offset `-04:00` nas timestamps
- Remover dependência implícita de `daily_production_id` — buscar por `barber_id` + janela de data (idêntico ao LiveDashboard)
- Adicionar log de auditoria após carregar os dados

```typescript
// De:
.gte("created_at", `${date}T00:00:00`)
.lt("created_at", `${nextDay}T00:00:00`)

// Para:
.gte("created_at", `${date}T00:00:00-04:00`)
.lt("created_at", `${nextDay}T00:00:00-04:00`)
```

Adicionar após carregar `liveTransactions` e `cart`:
```typescript
console.log('[AUDITORIA] Itens Gestor carregados:', {
  total: live.length,
  soma: live.reduce((s, t) => s + t.price_sold, 0),
  date
});
```

## 2. Padronizar Fuso em PendingDayReviews.tsx

**Correções** (linhas 46-47 e 58):
- Queries: adicionar `-04:00` no offset
- Agrupação por data: usar `formatInTimeZone` em vez de `split("T")[0]`

```typescript
// Queries:
.gte("created_at", `${startDate}T00:00:00-04:00`)
.lte("created_at", `${today}T23:59:59-04:00`)

// Agrupação:
import { formatInTimeZone } from "date-fns-tz";
const txDate = formatInTimeZone(new Date(tx.created_at), "America/Manaus", "yyyy-MM-dd");
```

## 3. Padronizar Fuso em ProductionHistory.tsx

**Correções** (linhas 79-80):
```typescript
// De:
.gte("created_at", `${format(firstDay, "yyyy-MM-dd")}T00:00:00`)
.lte("created_at", `${format(lastDay, "yyyy-MM-dd")}T23:59:59`)

// Para:
.gte("created_at", `${format(firstDay, "yyyy-MM-dd")}T00:00:00-04:00`)
.lte("created_at", `${format(lastDay, "yyyy-MM-dd")}T23:59:59-04:00`)
```

## 4. Ajuste do "Barber Coach" para 23h (WarPlanCard + AIDailyCoachCard)

**Em `BarberDashboard.tsx`**: Adicionar lógica que verifica se são 23h+ em Manaus. Se sim:
- O WarPlanCard mostra o balanço do dia (meta batida ou não) em vez do plano tático
- A mensagem do coach muda para um resumo de fechamento

**Implementação**: Criar uma constante `CLOSING_HOUR = 23` e verificar com `getManausDate().getHours() >= CLOSING_HOUR`. Quando ativo:
- Se `soldToday >= dailyTarget`: mensagem de parabéns
- Se não: mensagem com sugestão para o dia seguinte
- O wizard do Plano de Guerra só pergunta sobre o dia seguinte após as 23h

## 5. Logs de Auditoria (DayReviewModal.tsx)

Após carregar dados do gestor e montar o carrinho, adicionar comparação:
```typescript
// Após montar cartFromLive
const totalGestor = live.reduce((s, t) => s + t.price_sold, 0);
const totalBarbeiro = cartFromLive.reduce((s, i) => s + (i.customPrice || 0), 0);
if (Math.abs(totalGestor - totalBarbeiro) > 0.01) {
  console.warn('[AUDITORIA] DIVERGÊNCIA detectada:', { totalGestor, totalBarbeiro, diff: totalGestor - totalBarbeiro });
}
console.log('[AUDITORIA] Itens Gestor vs Barbeiro:', { itensGestor: live.length, itensBarbeiro: cartFromLive.length });
```

## Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `DayReviewModal.tsx` | Offset `-04:00` + logs de auditoria |
| `PendingDayReviews.tsx` | Offset `-04:00` + `formatInTimeZone` na agrupação |
| `ProductionHistory.tsx` | Offset `-04:00` nas queries |
| `BarberDashboard.tsx` | Lógica de fechamento 23h para coach/war plan |
| `WarPlanCard.tsx` | Aceitar prop opcional de "balanço" para modo noturno |

