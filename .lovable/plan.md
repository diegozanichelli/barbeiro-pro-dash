

# Plano: Correção Completa de Timezone - Vendas Após 20h Indo Para o Dia Seguinte

## Problema Identificado

A gerente relatou que os lançamentos do barbeiro **Jhon** (e potencialmente de todos os barbeiros) feitos **depois das 20h de Manaus** estão sendo registrados no **dia seguinte**. Isso acontece porque:

- **Manaus está 4 horas atrás de UTC** (GMT-4)
- Quando são **20h em Manaus**, são **00h UTC do dia seguinte**
- Vários arquivos ainda usam `new Date().toISOString()` que retorna data em **UTC**, não em Manaus

## Arquivos com Problemas Encontrados

Após auditoria completa, encontrei **5 arquivos no frontend + 2 edge functions** que ainda usam padrões problemáticos:

| Arquivo | Código Problemático | Impacto |
|---------|---------------------|---------|
| `EarningsComparison.tsx` | `firstDay.toISOString().split("T")[0]` | Comparativos com datas UTC |
| `PerformanceAlerts.tsx` | `primeiroDiaMes.toISOString().split('T')[0]` | Alertas buscam mês errado após 20h |
| `MonthlyPayroll.tsx` | `startDate.toISOString()` | Fechamento mensal com range UTC |
| `MySubscriptionsCard.tsx` | `format(startOfMonth(new Date()), "yyyy-MM-dd")` | Início de mês em UTC |
| `SubscriptionsTracking.tsx` | `format(startOfMonth(new Date()), "yyyy-MM-dd")` | Início de mês em UTC |
| `get-coaching-nudge` (Edge) | `firstDay.toISOString().split("T")[0]` | IA busca dados do mês errado |
| `check-performance-alerts` (Edge) | `primeiroDiaMes.toISOString().split('T')[0]` | Alertas processam mês errado |

---

## Solução Proposta

### 1. Frontend: Usar `getManausDate()` Para Criar Datas Base

Para calcular início/fim de mês corretamente no fuso de Manaus, precisamos:

1. Obter a data atual no fuso de Manaus via `getManausDate()`
2. Usar essa data para criar `startOfMonth` e `endOfMonth`
3. Formatar com `format(data, "yyyy-MM-dd")`

Isso garante que **às 22h de dia 31** o sistema entenda que ainda é dia 31 (não dia 01 do próximo mês).

### 2. Edge Functions: Criar Helper Local

Edge functions não têm acesso ao `dateUtils.ts` do frontend, então criaremos uma função local em cada uma:

```typescript
function getManausDateStr(date: Date = new Date()): string {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const manaus = new Date(utc + (-4 * 60 * 60000)); // GMT-4
  return manaus.toISOString().split('T')[0];
}
```

---

## Alterações Detalhadas

### 1. EarningsComparison.tsx
**Problema:** Linhas 126-127 usam `firstDay.toISOString()` e `lastDay.toISOString()`

**Solução:** Importar `getManausDate` e usar `format()` para formatar as datas

### 2. PerformanceAlerts.tsx
**Problema:** Linha 34 usa `primeiroDiaMes.toISOString().split('T')[0]`

**Solução:** Importar `getManausDate` e criar o primeiro dia do mês baseado na data de Manaus

### 3. MonthlyPayroll.tsx
**Problema:** Linhas 73-74 usam `startDate.toISOString()` e `endDate.toISOString()`

**Solução:** Usar `format()` para formatar em yyyy-MM-dd antes de enviar para query

### 4. MySubscriptionsCard.tsx
**Problema:** Linhas 30-31 usam `startOfMonth(new Date())` em UTC

**Solução:** Já usa `getTodayString()`, mas precisa usar `getManausDate()` para calcular início/fim do mês

### 5. SubscriptionsTracking.tsx
**Problema:** Linhas 40-41 usam `startOfMonth(new Date())` em UTC

**Solução:** Usar `getManausDate()` como base para `startOfMonth` e `endOfMonth`

### 6. Edge Function: get-coaching-nudge
**Problema:** Linhas 80-81 usam `firstDay.toISOString()` e `lastDay.toISOString()`

**Solução:** Criar helper `getManausDateStr()` e usar `format()` com a data de Manaus

### 7. Edge Function: check-performance-alerts
**Problema:** Linhas 48 e 114-115 usam `toISOString()` para datas

**Solução:** Criar helper `formatManausDate()` que retorna string yyyy-MM-dd correta

---

## Resumo Visual da Correção

```text
ANTES (Problema):
┌─────────────────────────────────────────────────────┐
│ Manaus 22:00 (31/01) → UTC 02:00 (01/02)           │
│                                                     │
│ startOfMonth(new Date()) → 01/02 (ERRADO!)         │
│ Sistema acha que é fevereiro quando ainda é janeiro│
└─────────────────────────────────────────────────────┘

DEPOIS (Correção):
┌─────────────────────────────────────────────────────┐
│ Manaus 22:00 (31/01) → getManausDate()             │
│                                                     │
│ startOfMonth(getManausDate()) → 01/01 (CORRETO!)   │
│ Sistema sabe que ainda é janeiro em Manaus         │
└─────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

Após as correções:
- Lançamentos feitos às 21h, 22h, 23h em Manaus serão registrados no dia correto
- O fechamento mensal (payroll) calculará datas corretamente
- Alertas de performance buscarão o mês correto
- A IA (coaching nudge) verá estatísticas do mês correto
- Comparativos de ganhos usarão períodos corretos

---

## Seção Técnica

### Arquivos a Modificar (Frontend)
1. `src/components/dashboard/manager/EarningsComparison.tsx`
2. `src/components/dashboard/manager/PerformanceAlerts.tsx`
3. `src/components/dashboard/manager/MonthlyPayroll.tsx`
4. `src/components/dashboard/barber/MySubscriptionsCard.tsx`
5. `src/components/dashboard/manager/SubscriptionsTracking.tsx`

### Arquivos a Modificar (Edge Functions)
6. `supabase/functions/get-coaching-nudge/index.ts`
7. `supabase/functions/check-performance-alerts/index.ts`

### Import a Adicionar (Frontend)
```typescript
import { getManausDate, getTodayString } from "@/lib/dateUtils";
```

### Padrão de Correção para Início/Fim de Mês
```typescript
// ANTES (problema)
const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

// DEPOIS (correto)
import { getManausDate } from "@/lib/dateUtils";
const manausNow = getManausDate();
const monthStart = format(startOfMonth(manausNow), "yyyy-MM-dd");
const monthEnd = format(endOfMonth(manausNow), "yyyy-MM-dd");
```

### Helper para Edge Functions
```typescript
// Adicionar no topo de cada edge function
const MANAUS_OFFSET = -4 * 60; // -4 horas em minutos

function getManausDate(): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (MANAUS_OFFSET * 60000));
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

