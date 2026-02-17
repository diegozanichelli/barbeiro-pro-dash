
# Domingo como Dia de Bonus e Escala Facultativa

## Resumo

Domingo passa a ser tratado como dia **bonus/extra**: nunca cobra presenca, nunca gera alerta, mas se o barbeiro trabalhar, o faturamento e comissao contam normalmente para a meta mensal sem consumir dias uteis da escala oficial.

## Arquivos e Alteracoes

### 1. Alertas de Producao Pendente (Barbeiro)
**Arquivo:** `src/components/dashboard/barber/MissingProductionAlert.tsx`

- A funcao `getWorkingDaysUntilToday` ja exclui domingos (linha 28: `date.getDay() !== 0`).
- **Nenhuma alteracao necessaria** - ja esta correto.

### 2. Alertas de Producao Pendente (Gestor)
**Arquivo:** `src/components/dashboard/manager/MissingProductionsAlert.tsx`

- A funcao `getWorkingDaysForMonth` ja exclui domingos (linha 47: `date.getDay() !== 0`).
- **Nenhuma alteracao necessaria** - ja esta correto.

### 3. Contagem de Dias Trabalhados (Barbeiro Dashboard)
**Arquivo:** `src/components/dashboard/BarberDashboard.tsx`

**Problema atual:** `daysWorked` conta TODOS os dias com producao, incluindo domingos. Se um barbeiro trabalha no domingo, o sistema desconta um dia util da meta, fazendo o domingo "consumir" um dia da escala.

**Alteracao (linha ~251):** Filtrar domingos da contagem de `daysWithProduction`:
```typescript
const daysWithProduction = productions.filter(p => {
  // Excluir domingos da contagem de dias trabalhados para nao consumir dias uteis
  const dateObj = new Date(p.date + "T12:00:00");
  if (dateObj.getDay() === 0) return false; // Domingo = bonus, nao conta

  const total = (Number(p.services_basic_total) || 0) + ...;
  return total > 0 || (p.confirmed_presence === true && ...);
}).length;
```

**Efeito:** O faturamento de domingo continua somando na `accumulated_commission` (ja funciona), mas nao reduz `remainingWorkDaysFromGoal`, acelerando o atingimento da meta.

### 4. Contagem de Dias Trabalhados (Gestor - Metas do Dia)
**Arquivo:** `src/components/dashboard/manager/DailyGoalsTracking.tsx`

**Mesma logica** aplicada na contagem de `daysWorked` (linha ~133): excluir domingos para que o progresso esperado e os dias restantes reflitam apenas seg-sab.

Tambem ajustar `getWorkingDaysPassed` (linha ~43) para excluir domingos - ja exclui, entao ok.

### 5. Calculo de Media por Dia
**Arquivo:** `src/components/dashboard/BarberDashboard.tsx`

Na exibicao de media (se existir), usar a formula:
```
mediaDiaria = faturamentoTotal / max(diasUteisMeta, diasReaisTrabalhados)
```
Onde `diasReaisTrabalhados` inclui domingos somente se forem mais que `diasUteisMeta`, para nao inflar a media.

### 6. Edge Function de Alertas de Performance
**Arquivo:** `supabase/functions/check-performance-alerts/index.ts`

**Problema:** O calculo de pacing usa `diaAtual` (dia do calendario) dividido por `diasUteisConfigurados`. Nao exclui domingos do calculo.

**Alteracao:** Contar dias uteis (seg-sab) transcorridos ate hoje ao inves de usar o numero do dia:
```typescript
// Contar apenas dias uteis (seg-sab) transcorridos
let diasUteisCorridos = 0;
for (let d = 1; d <= diaAtual; d++) {
  const date = new Date(anoAtual, mesAtual - 1, d);
  if (date.getDay() !== 0) diasUteisCorridos++;
}
const metaEsperadaAteHoje = (diasUteisCorridos / diasUteisConfigurados) * metaTotal;
```

### 7. Funcao `calculateRemainingWorkDays`
**Arquivo:** `src/lib/dateUtils.ts`

**Problema atual:** Conta TODOS os dias restantes no calendario (incluindo domingos).

**Alteracao:** Excluir domingos do calculo de dias restantes:
```typescript
export function calculateRemainingWorkDays(today: Date = getManausDate()): number {
  const lastDayOfMonth = endOfMonth(today).getDate();
  let count = 0;
  for (let d = today.getDate(); d <= lastDayOfMonth; d++) {
    const date = new Date(today.getFullYear(), today.getMonth(), d);
    if (date.getDay() !== 0) count++; // Excluir domingos
  }
  return count;
}
```

### 8. Vinculo de Unidade Temporaria (Domingo)

O sistema atual ja aceita lancamentos de qualquer barbeiro em `daily_productions` independente da unidade, pois o `organization_id` e validado (nao `unit_id`). O barbeiro da Unidade A que trabalha na Unidade B no domingo lanca normalmente - o `barber_id` e o `organization_id` garantem a integridade. **Nenhuma alteracao necessaria** desde que as unidades pertencam a mesma organizacao.

---

## Secao Tecnica

### Resumo das alteracoes por arquivo:

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/dateUtils.ts` | `calculateRemainingWorkDays` exclui domingos |
| `src/components/dashboard/BarberDashboard.tsx` | `daysWithProduction` ignora domingos na contagem |
| `src/components/dashboard/manager/DailyGoalsTracking.tsx` | `daysWorked` ignora domingos na contagem |
| `supabase/functions/check-performance-alerts/index.ts` | Pacing usa dias uteis corridos (sem domingos) |
| Alertas de producao pendente | Ja excluem domingos - sem alteracao |
| Vinculo de unidade | Ja funciona por organization_id - sem alteracao |

### Impacto nos dados existentes
- Nenhuma migration de banco necessaria
- A comissao acumulada (campo `commission_earned`) ja inclui domingos naturalmente
- A alteracao e puramente de **calculo de apresentacao e pacing**
