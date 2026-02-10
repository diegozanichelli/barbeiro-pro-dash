
# Corrigir Data Retroativa no SubscriptionWizardModal

## Problema
O `SubscriptionWizardModal` usa `getTodayString()` fixo no `handleSubmit` (linha 164). Quando o gestor seleciona uma data passada no calendario do painel Ao Vivo, a assinatura e salva com a data de hoje, ignorando a escolha.

## Solucao
Passar a data selecionada do `LiveDashboard` para o `SubscriptionWizardModal` como prop e usa-la no lugar de `getTodayString()`.

---

## Alteracoes

### 1. `src/components/dashboard/manager/SubscriptionWizardModal.tsx`

- Adicionar prop `selectedDate?: Date` na interface `SubscriptionWizardModalProps`
- No `handleSubmit`, substituir:
  - `const today = getTodayString()` por `const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : getTodayString()`
- Adicionar `created_at: (selectedDate || new Date()).toISOString()` no payload do `sale_transactions.insert`
- Usar `dateStr` nas queries de `daily_productions` (`.eq("date", dateStr)` e no insert)
- Adicionar import de `format` do `date-fns`

### 2. `src/components/dashboard/manager/LiveDashboard.tsx`

- Passar a prop `selectedDate` do estado de data do painel Ao Vivo para o `SubscriptionWizardModal`:
```text
<SubscriptionWizardModal
  ...
  selectedDate={selectedDate}  // data do calendario do Ao Vivo
/>
```

### Impacto
- Assinaturas retroativas serao registradas no dia correto
- A producao diaria sera criada/vinculada ao dia selecionado
- O `created_at` da transacao refletira o dia escolhido
- Comportamento padrao (sem data passada) permanece inalterado
