
# Plano: Correção Completa de Timezone - Todos os Arquivos Restantes

## Diagnóstico Expandido

Após auditoria completa, encontrei **mais 4 arquivos** que ainda precisam de correção para garantir que o problema de timezone não afete **nenhuma barbearia cadastrada**:

| Arquivo | Código Problemático | Impacto |
|---------|---------------------|---------|
| `ManagerReports.tsx` | `startOfMonth(new Date())` e `endOfMonth(new Date())` na linha 59-60 | Relatórios inicializam com mês errado após 20h |
| `ShopEvolution.tsx` | `new Date().getFullYear()` e `new Date().getMonth()` nas linhas 28, 40, 166 | Seleção de ano/mês atual errada após 20h |
| `UnitsComparison.tsx` | `new Date().getFullYear()` e `new Date().getMonth()` nas linhas 34-35, 40 | Comparativos de unidades com mês errado |
| `barber-ai-assistant` (Edge) | `new Date()` nas linhas 78-82 | IA calcula últimos 30 dias usando UTC |

### Arquivos Já Corrigidos Anteriormente
- `QuickSaleModal.tsx` ✅
- `BarberSaleForm.tsx` ✅
- `BarberCombobox.tsx` ✅
- `SubscriptionConfirmModal.tsx` ✅
- `MySubscriptionsCard.tsx` ✅
- `SubscriptionsTracking.tsx` ✅
- `EarningsComparison.tsx` ✅
- `PerformanceAlerts.tsx` ✅
- `MonthlyPayroll.tsx` ✅
- `get-coaching-nudge` ✅
- `check-performance-alerts` ✅

---

## Arquivos com Uso Aceitável de `new Date()`

Alguns usos de `new Date()` são **aceitáveis** e não precisam de correção:

| Arquivo | Uso | Por que está OK |
|---------|-----|-----------------|
| `BarberDashboard.tsx` | `format(new Date(), "EEEE, dd 'de' MMMM")` (linha 773) | Apenas para exibição de texto, não afeta dados |
| `MySubscriptionsCard.tsx` | `format(new Date(), "MMMM")` (linha 63) | Apenas para exibição de nome do mês |
| `SubscriptionsTracking.tsx` | `format(new Date(), "MMMM 'de' yyyy")` (linha 118) | Apenas para exibição |
| `BarberSaleForm.tsx` | `useState<Date>(new Date())` (linha 71) | Date picker, mas já usa `format(selectedDate, ...)` |
| `AIUsageTracking.tsx` | `startOfDay(new Date())` (linha 74) | Compara datas, não afeta registros |
| `SubscriptionEarningsForm.tsx` | `new Date().getMonth()` (linha 40-41) | Seletor de mês, usa `getCurrentMonthYear()` seria melhor mas não crítico |

---

## Alterações Necessárias

### 1. ManagerReports.tsx
**Problema:** Estado inicial do dateRange usa UTC

```typescript
// ANTES (linhas 58-61)
const [dateRange, setDateRange] = useState<DateRange | undefined>({
  from: startOfMonth(new Date()),
  to: endOfMonth(new Date()),
});

// DEPOIS
import { getManausDate } from "@/lib/dateUtils";
const manausNow = getManausDate();
const [dateRange, setDateRange] = useState<DateRange | undefined>({
  from: startOfMonth(manausNow),
  to: endOfMonth(manausNow),
});
```

### 2. ShopEvolution.tsx
**Problema:** Seleção inicial de ano/mês usa UTC

```typescript
// ANTES (linhas 28, 40, 166)
const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
const currentMonth = new Date().getMonth();

// DEPOIS
import { getManausDate } from "@/lib/dateUtils";
const manausNow = getManausDate();
const [selectedYear, setSelectedYear] = useState<number>(manausNow.getFullYear());
const years = Array.from({ length: 5 }, (_, i) => getManausDate().getFullYear() - 2 + i);
const currentMonth = getManausDate().getMonth();
```

### 3. UnitsComparison.tsx
**Problema:** Seleção inicial de ano/mês usa UTC

```typescript
// ANTES (linhas 34-35, 40)
const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

// DEPOIS
import { getManausDate } from "@/lib/dateUtils";
const manausNow = getManausDate();
const [selectedYear, setSelectedYear] = useState<number>(manausNow.getFullYear());
const [selectedMonth, setSelectedMonth] = useState<number>(manausNow.getMonth() + 1);
const years = Array.from({ length: 5 }, (_, i) => getManausDate().getFullYear() - 2 + i);
```

### 4. barber-ai-assistant (Edge Function)
**Problema:** Cálculo dos últimos 30 dias usa UTC

```typescript
// ANTES (linhas 78-82)
const today = new Date();
const thirtyDaysAgo = new Date(today);
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const startDate = thirtyDaysAgo.toISOString().split('T')[0];
const endDate = today.toISOString().split('T')[0];

// DEPOIS
// Usar a função getManausDateString() já existente no topo do arquivo
// e criar uma função para obter a data de Manaus como Date
function getManausDate(): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (-4 * 60 * 60000));
}

const today = getManausDate();
const thirtyDaysAgo = new Date(today);
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

// Formatar como yyyy-MM-dd sem usar toISOString()
function formatDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const startDate = formatDateStr(thirtyDaysAgo);
const endDate = formatDateStr(today);
```

---

## Resumo Visual

```text
PROBLEMA IDENTIFICADO:
┌─────────────────────────────────────────────────────┐
│ Manaus 22:00 (31/01) → UTC 02:00 (01/02)           │
│                                                     │
│ ManagerReports: Abre com fevereiro selecionado     │
│ ShopEvolution: Mostra "mês atual" como fevereiro   │
│ UnitsComparison: Compara fevereiro, não janeiro    │
│ barber-ai-assistant: IA vê 30 dias errados         │
└─────────────────────────────────────────────────────┘

APÓS CORREÇÃO:
┌─────────────────────────────────────────────────────┐
│ Manaus 22:00 (31/01) → getManausDate()             │
│                                                     │
│ Todos os componentes: Janeiro (CORRETO!)           │
│ Todas as barbearias: Dados consistentes            │
└─────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

Após as correções:
- **Todas as barbearias** terão dados consistentes
- O barbeiro **Jhon** e todos os outros terão lançamentos no dia correto
- Relatórios do gestor inicializarão com o mês correto
- Evolução da loja mostrará o mês atual de Manaus
- Comparativos de unidades usarão o mês atual de Manaus
- A IA analisará os últimos 30 dias corretos

---

## Seção Técnica

### Arquivos a Modificar
1. `src/components/dashboard/manager/ManagerReports.tsx`
2. `src/components/dashboard/manager/ShopEvolution.tsx`
3. `src/components/dashboard/manager/UnitsComparison.tsx`
4. `supabase/functions/barber-ai-assistant/index.ts`

### Import a Adicionar (Frontend)
```typescript
import { getManausDate } from "@/lib/dateUtils";
```

### Helper para Edge Function (barber-ai-assistant)
```typescript
// Adicionar logo após getManausDateString()
function getManausDate(): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (-4 * 60 * 60000));
}

function formatManausDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
```
