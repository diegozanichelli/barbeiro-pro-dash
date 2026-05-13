## Diagnóstico da discrepância

Os dois lugares calculam "ritmo esperado" com fórmulas **completamente diferentes**, então é normal um barbeiro aparecer "Abaixo do Ritmo" no card de alertas mas com outro percentual no Lançamentos Diários (e vice-versa).

### 1. Dashboard – `DailyGoalsTracking.tsx` (linhas 66–183)
```
workingDaysPassed = dias corridos do mês até hoje (1..hoje), excluindo só feriados
                    → INCLUI domingos
monthDays         = dias totais do mês (28/30/31)
expectedProgress  = workingDaysPassed / monthDays * 100
```
- **Não usa** `monthly_goals.work_days`.
- **Não exclui** domingos.
- Compara contra % de comissão atingida no mês.

### 2. Edge function – `check-performance-alerts/index.ts` (linhas 138–190)
```
diasUteisCorridos      = dias seg–sáb transcorridos (EXCLUI domingos)
                         → NÃO exclui feriados
diasUteisConfigurados  = monthly_goals.work_days (ex.: 26)
metaEsperadaAteHoje    = (diasUteisCorridos / work_days) * target_commission
threshold              = metaEsperadaAteHoje * 0.85
classifica em "Meta Impossível" / "Abaixo do Ritmo" / "Risco Moderado"
                         por percentualAtingido (acumulado / meta total)
```

### Por que os números não batem
| Aspecto | Dashboard | Alerta |
|---|---|---|
| Denominador de pacing | dias do mês (ex. 31) | `work_days` configurado (ex. 26) |
| Domingos | conta como dia esperado | exclui |
| Feriados | exclui | ignora (conta como dia útil) |
| Ausências/folgas futuras | considera no diário | ignora |
| Base do esperado | proporção de tempo | proporção × meta total |
| Thresholds | -5 / -20 (dashboard) | 85% pacing + 60/70% (alerta) |

Exemplo Gabriel Silva (img): dashboard mostra 18,2% × esperado 41,9% (-23,7%). Pela régua do alerta com `work_days=26` e domingos fora, o esperado é maior ainda (~46–50%), e cai em "Abaixo do Ritmo" (<60%). Já Felipe (-39,9% no dashboard) pode não ter sido classificado como "Meta Impossível" porque a edge function exige `dias_restantes < 5` para isso.

## Plano de correção

Padronizar **uma única fonte de verdade** para "esperado até hoje", usada nos dois lugares.

### Opção recomendada (alinhar à régua do dashboard, que respeita feriados/folgas)
1. **Criar função SQL `public.calc_expected_pacing(barber_id, ref_date)`** que retorna:
   - `working_days_passed` (dias do mês até hoje, excluindo feriados da org e dias marcados como `day_off`/`absence`/`optional_sunday` em `daily_productions` do barbeiro)
   - `working_days_total` (mesmo critério para o mês inteiro, considerando `monthly_goals.work_days` como teto se preenchido)
   - `expected_commission` = `target_commission * working_days_passed / working_days_total`
   - `expected_percent` = `working_days_passed / working_days_total * 100`
2. **Edge function `check-performance-alerts`**: substituir o bloco `diasUteisCorridos / diasUteisConfigurados` por chamada à RPC. Manter a árvore de classificação (Meta Impossível / Abaixo do Ritmo / Risco Moderado) baseada em `comissao_acumulada / expected_commission`.
3. **`DailyGoalsTracking.tsx`**: substituir `getWorkingDaysPassed()` + `monthDays` pelo mesmo RPC (ou função TS equivalente reutilizada de `dateUtils.ts`) para que `expectedProgress` use exatamente a mesma base.
4. **Alinhar thresholds visuais**: ajustar `progressDiff` do dashboard para refletir as mesmas faixas usadas no alerta (ex.: <-15% = "Risco Moderado", <-30% = "Abaixo do Ritmo"), garantindo coerência entre o badge "Crítico" e o card de alertas.
5. **Backfill**: rodar a edge function uma vez após o deploy para reclassificar alertas ativos com a nova fórmula.

### Detalhe técnico — feriados na edge function
Hoje a função lê só `daily_productions.commission_earned`. Precisa passar a ler:
- `organization_holidays` (mês corrente)
- `daily_productions.presence_type` para descontar folgas/ausências do barbeiro

### Arquivos afetados
- `supabase/functions/check-performance-alerts/index.ts`
- `src/components/dashboard/manager/DailyGoalsTracking.tsx`
- `src/lib/dateUtils.ts` (extrair helper compartilhado)
- nova migration com a função `calc_expected_pacing`

### Fora de escopo
- Não mexer em RLS de `performance_alerts`.
- Não alterar formato dos cards de alerta nem a UI da listagem.
