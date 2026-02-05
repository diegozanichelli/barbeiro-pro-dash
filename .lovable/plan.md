
# Plano: Corrigir Timezone - Vendas Após 20h Indo Para o Dia Seguinte

## Diagnóstico do Problema

O sistema foi configurado para usar o fuso horário de Manaus (GMT-4), mas **nem todos os arquivos estão usando a função centralizada `getTodayString()`**. Isso causa o seguinte problema:

- **Manaus está 4 horas atrás de UTC** (GMT-4)
- Quando são **20h em Manaus**, são **00h UTC do dia seguinte**
- Usar `new Date().toISOString()` ou `format(new Date(), "yyyy-MM-dd")` retorna a data em **UTC**, não em Manaus
- Resultado: vendas feitas após 20h em Manaus são registradas no dia seguinte

### Arquivos com o Problema

| Arquivo | Código Problemático | Impacto |
|---------|---------------------|---------|
| `QuickSaleModal.tsx` (Gestor) | `new Date().toISOString().split("T")[0]` | Vendas rápidas após 20h vão para dia errado |
| `QuickSaleModal.tsx` (Gestor) | `format(new Date(), "yyyy-MM-dd")` | Busca de assinaturas com data errada |
| `BarberSaleForm.tsx` (Barbeiro) | `format(new Date(), "yyyy-MM-dd")` | Busca de catálogo/assinaturas com data errada |
| `BarberCombobox.tsx` | `new Date().toISOString().split("T")[0]` | Filtro de barbeiros com data errada |
| `SubscriptionConfirmModal.tsx` | `new Date().toISOString().split("T")[0]` | Assinaturas após 20h vão para dia errado |
| `MySubscriptionsCard.tsx` | `format(new Date(), "yyyy-MM-dd")` | Exibição de assinaturas com data errada |
| `SubscriptionsTracking.tsx` | `format(new Date(), "yyyy-MM-dd")` | Tracking de assinaturas com data errada |
| `barber-ai-assistant` (Edge Function) | `new Date().toISOString().split('T')[0]` | IA vê dados do dia errado |

---

## Solução

Substituir **todas** as ocorrências de:
- `new Date().toISOString().split("T")[0]`
- `format(new Date(), "yyyy-MM-dd")`

Por:
- `getTodayString()` (importado de `@/lib/dateUtils`)

Esta função já existe e usa corretamente o fuso de Manaus:
```typescript
export function getTodayString(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}
```

---

## Alterações Necessárias

### 1. QuickSaleModal.tsx (Gestor)
**4 correções:**
- Linha 115: `const today = format(new Date(), "yyyy-MM-dd")` → `getTodayString()`
- Linha 284: `const today = new Date().toISOString().split("T")[0]` → `getTodayString()`
- Linha 383: `const today = new Date().toISOString().split("T")[0]` → `getTodayString()`
- Linha 456: `const today = format(new Date(), "yyyy-MM-dd")` → `getTodayString()`
- Adicionar import de `getTodayString` no topo

### 2. BarberSaleForm.tsx (Barbeiro)
**3 correções:**
- Linha 90: `const today = format(new Date(), "yyyy-MM-dd")` → `getTodayString()`
- Linha 299: `const today = format(new Date(), "yyyy-MM-dd")` → `getTodayString()`
- Linha 368: Comparação de data usar `getTodayString()` em vez de `format(new Date(), ...)`
- Adicionar import de `getTodayString` no topo

### 3. BarberCombobox.tsx
**1 correção:**
- Linha 57: `const today = new Date().toISOString().split("T")[0]` → `getTodayString()`
- Adicionar import

### 4. SubscriptionConfirmModal.tsx
**2 correções:**
- Linha 137: `const today = new Date().toISOString().split("T")[0]` → `getTodayString()`
- Linha 154: `date: new Date().toISOString().split("T")[0]` → `date: getTodayString()`
- Adicionar import

### 5. MySubscriptionsCard.tsx
**1 correção:**
- Linha 28: `const today = format(new Date(), "yyyy-MM-dd")` → `getTodayString()`
- Adicionar import

### 6. SubscriptionsTracking.tsx
**1 correção:**
- Linha 38: `const today = format(new Date(), "yyyy-MM-dd")` → `getTodayString()`
- Adicionar import

### 7. Edge Function: barber-ai-assistant
**1 correção:**
- Linha 237: `const today = new Date().toISOString().split('T')[0]` → usar lógica de Manaus

Para Edge Functions, precisamos replicar a lógica pois não têm acesso ao arquivo de utilitários do frontend:
```typescript
// No topo da edge function
const TIMEZONE_OFFSET = -4; // Manaus GMT-4
function getManausDateString(): string {
  const now = new Date();
  now.setHours(now.getUTCHours() + TIMEZONE_OFFSET);
  return now.toISOString().split('T')[0];
}
```

---

## Resumo Visual

```text
ANTES (Problema):
┌─────────────────────────────────────────────────────┐
│ Manaus 21:00 (05/02) → UTC 01:00 (06/02)           │
│                                                     │
│ new Date().toISOString() = "2026-02-06T01:00:00Z"  │
│                        ↓                            │
│ Venda registrada em 06/02 (ERRADO!)                │
└─────────────────────────────────────────────────────┘

DEPOIS (Correção):
┌─────────────────────────────────────────────────────┐
│ Manaus 21:00 (05/02) → getTodayString()            │
│                                                     │
│ formatInTimeZone(..., "America/Manaus") = "2026-02-05" │
│                        ↓                            │
│ Venda registrada em 05/02 (CORRETO!)               │
└─────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

Após as correções:
- Vendas feitas às 21h, 22h, 23h em Manaus serão registradas no dia correto
- O dashboard mostrará os dados do dia civil de Manaus, não UTC
- A IA do barbeiro verá estatísticas do dia correto
- O sistema ficará 100% consistente com o fuso de Manaus

---

## Seção Técnica

### Arquivos a Modificar
1. `src/components/dashboard/manager/QuickSaleModal.tsx`
2. `src/components/dashboard/barber/BarberSaleForm.tsx`
3. `src/components/dashboard/manager/BarberCombobox.tsx`
4. `src/components/dashboard/barber/SubscriptionConfirmModal.tsx`
5. `src/components/dashboard/barber/MySubscriptionsCard.tsx`
6. `src/components/dashboard/manager/SubscriptionsTracking.tsx`
7. `supabase/functions/barber-ai-assistant/index.ts`

### Padrão a Seguir
```typescript
// ANTES
const today = new Date().toISOString().split("T")[0];
// ou
const today = format(new Date(), "yyyy-MM-dd");

// DEPOIS
import { getTodayString } from "@/lib/dateUtils";
const today = getTodayString();
```

### Edge Functions (Sem Acesso ao dateUtils)
```typescript
// Adicionar no topo da função
function getManausDateString(): string {
  const now = new Date();
  const manausOffset = -4 * 60; // -4 horas em minutos
  const localOffset = now.getTimezoneOffset();
  const manausTime = new Date(now.getTime() + (localOffset + manausOffset) * 60000);
  return manausTime.toISOString().split('T')[0];
}
```
