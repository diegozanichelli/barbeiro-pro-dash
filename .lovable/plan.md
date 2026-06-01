## Por que aparece a mensagem

O aviso laranja "Detectei inconsistência nas metas: faturamento R$ 0,00 ≤ comissão R$ 115,38" **não é um erro de dado do gerente** — é um falso alarme do próprio wizard para barbeiros novos / sem produção no mês.

### Origem técnica

Em `src/components/dashboard/BarberDashboard.tsx` (linha ~372):

```ts
const servicesTarget = monthlyGoal.target_commission > 0 
  ? dailyTarget * (stats.total_services / Math.max(1, stats.accumulated_commission))
  : 0;
setDailyTargetServices(servicesTarget);
```

A "meta diária de faturamento" é derivada da razão `total_services / accumulated_commission` (quanto de venda bruta cada R$ 1 de comissão historicamente gerou). Quando o barbeiro **ainda não tem nenhuma venda no mês** (`total_services = 0`), essa razão vira `0` e `dailyTargetServices = 0`.

Esse `0` é passado ao wizard como `dailyTarget={dailyTargetServices}`. O `WarPlanWizard` então roda a validação:

```ts
const targetMismatch =
  dailyTargetCommission > 0 &&
  (dailyTarget <= 0 || dailyTarget < dailyTargetCommission);
```

Como `dailyTarget=0` e `dailyTargetCommission=115,38`, a regra dispara e bloqueia o botão "Gerar Plano de Guerra" achando que o gerente cadastrou metas trocadas — quando na verdade só faltam dados históricos do mês para estimar o ticket.

No print, "TestePaulo" tem 26 dias úteis restantes, meta mensal de R$ 3.000 e 0% realizado: é exatamente o caso de barbeiro sem produção no mês.

## Correção proposta

**Arquivo:** `src/components/dashboard/barber/WarPlanWizard.tsx`

Refinar a regra `targetMismatch` para **não disparar quando simplesmente não dá para estimar o faturamento** (ex.: barbeiro sem histórico no mês). A inconsistência real é quando *existe* uma meta de faturamento e ela é *menor* que a de comissão — não quando ela é zero por falta de dados.

Mudanças:

1. `targetMismatch` passa a ser verdadeiro apenas quando `dailyTarget > 0 && dailyTarget < dailyTargetCommission` (faturamento positivo, porém menor que a comissão — sinal real de campos trocados).
2. Quando `dailyTarget <= 0 && dailyTargetCommission > 0`, o wizard segue funcionando normalmente. O endpoint `barber-ai-assistant` já recebe `dailyTargetCommission` e consegue gerar o plano usando a meta de comissão como referência.
3. Remover o `disabled` do botão para esse caso e esconder o banner laranja quando não houver mismatch real.

Texto do banner (quando realmente disparar) permanece o mesmo.

## Fora de escopo

- Não alterar a lógica de `dailyTargetServices` em `BarberDashboard.tsx`.
- Não mexer no edge function `barber-ai-assistant`.
- Não alterar layout/estilo do wizard além do estado do banner/botão.
