## Objetivo

Disparar automaticamente um alerta para o gestor quando um barbeiro registrar **mais de 4 folgas (`presence_type = 'day_off'`) no mês corrente**, com a mensagem:

> "Você está folgando demais. Sem horas disponíveis suficientes para trabalhar, você não vai conseguir bater sua meta."

O alerta aparece no mesmo card **Alertas de Performance** (`PerformanceAlerts.tsx`) que já é exibido na Visão Geral do gestor, reaproveitando toda a UI existente (badge vermelho, botões Resolver/Ignorar, filtro por mês de referência).

## Como vai funcionar

1. **Detecção**: roda dentro da edge function diária já existente `check-performance-alerts` (a mesma que faz o pacing check às 01:00 AM).
2. **Cálculo por barbeiro ativo** da organização, para o mês corrente em Manaus:
   - Conta linhas em `daily_productions` onde `barber_id = X`, `date` dentro do mês e `presence_type = 'day_off'`.
   - Se `count > 4` → upsert de alerta com:
     - `alerta_tipo = 'Folgas em Excesso'`
     - `valor_deficit_r$ = 0`
     - `percentual_atingido = 0`
     - `dias_restantes = nº de folgas no mês` (reaproveita o campo para mostrar a quantidade)
     - `status = 'ativo'`, `mes_referencia = primeiro dia do mês`
   - Se `count <= 4` e existe alerta ativo desse tipo → marca como `resolvido` (auto-reset, igual ao pacing).
3. **Reaproveita** a unique constraint `(barber_id, mes_referencia, alerta_tipo)` já usada pelos outros tipos para fazer upsert sem duplicar.

## UI

Em `PerformanceAlerts.tsx`:
- Adicionar `'Folgas em Excesso'` em `getAlertColor` (cor `default`/amarelo) e em `getAlertIcon` (ícone `CalendarX` do lucide).
- Renderização condicional do bloco de métricas: quando `alerta_tipo === 'Folgas em Excesso'`, substituir os 3 contadores atuais (Deficit / % Atingido / Dias Restantes) por:
  - **Folgas no mês**: `{dias_restantes}` dias
  - **Mensagem fixa**: "Você está folgando demais. Sem horas disponíveis suficientes para trabalhar, você não vai conseguir bater sua meta."
- Botões **Resolver** e **Ignorar** continuam funcionando sem mudança.

## Detalhes técnicos

- **Threshold configurável** via constante `DAY_OFF_THRESHOLD = 4` no topo da edge function (acima de 4 dispara, ou seja, a partir do 5º dia de folga).
- **Critério da folga**: somente `presence_type = 'day_off'`. **Não** conta `absence`, `optional_sunday` nem `holiday` (faltas e domingos opcionais têm tratamento próprio e feriado não é folga voluntária).
- **Sem migração de schema**: a tabela `performance_alerts` já aceita `alerta_tipo` como `text` livre e os campos numéricos comportam zeros.
- **Sem mudanças no cron**: o agendamento atual em `0 4 * * *` continua chamando a mesma função, que agora além do pacing-check também roda o day-off-check.
- **Log de execução** (`performance_alert_run_logs`): incrementa `alerts_created` / `alerts_updated` igual ao bloco de pacing, para manter telemetria consistente.

## Arquivos afetados

```text
supabase/functions/check-performance-alerts/index.ts   (+ bloco day-off)
src/components/dashboard/manager/PerformanceAlerts.tsx (+ render condicional)
```

Nenhuma alteração de banco, RLS, navegação ou rotas.
