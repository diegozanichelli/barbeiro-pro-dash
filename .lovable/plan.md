## Objetivo
Reprocessar as transações e assinaturas históricas que ficaram com `created_at` deslocado para que toda a base reflita corretamente o horário real de Manaus, sem mexer no que já está certo.

## Diagnóstico atual da base

Rodei uma varredura por hora-do-dia (em Manaus) em `sale_transactions`:

```text
00h: 612    01h: 158    02h: 109    03h: 76
06h: 15     07h: 22     08h: 721    09h: 506
...
22h: 2665   23h: 1482
```

Padrão claro de bug: ~955 transações caem entre 00h e 05h da manhã em Manaus, horário em que a barbearia não opera. Distribuição por mês:

- fev/2026: 195 registros suspeitos em 6.922 totais
- mar/2026: 502 em 12.011
- abr/2026: 184 em 9.435
- mai/2026: 74 em 4.940

Quase tudo vem de `source='manager'` (927 dos 955), batendo com o fluxo do POS que tinha o bug de timezone corrigido na migração anterior. As gravações **novas** já estão saindo certas (a migração `fix_subscription_timezone_origin` corrigiu a RPC e fez o ajuste das linhas "futuras").

O que sobrou são os históricos antigos que **não** caíram no filtro `created_at > now()` daquela correção: foram gravados em datas passadas mas com o instante deslocado em +4h em relação ao real (efeito do `now()` antigo que retornava Manaus interpretado como UTC).

## O que vou fazer

### 1. Confirmar o escopo exato antes de qualquer UPDATE
- Listar amostra dos 955 registros suspeitos (00h–05h Manaus) por organização, unidade e barbeiro.
- Cruzar `sale_transactions.created_at` com `daily_production.date` correspondente: se o `date` da produção for o **dia anterior** ao dia Manaus do `created_at`, é prova de que o instante "vazou" para o dia seguinte por causa do +4h.
- Separar dois grupos:
  - **A)** Bug confirmado (data da produção ≠ dia Manaus do `created_at`, e hora cai em janela impossível 00h–05h) → candidatos a correção.
  - **B)** Casos legítimos raros (ex.: fechamento real às 23h59 que virou 00h05) → manter.

### 2. Aplicar o reprocessamento
- Para o grupo A, gerar um `UPDATE` que faça `created_at = created_at - INTERVAL '4 hours'`, replicando a mesma regra que já foi aplicada nos registros futuros.
- Rodar como **operação de dados** via insert/update tool (sem migração de schema), uma organização por vez, com `RETURNING id, created_at` para auditoria.
- Limitar por mês para conseguir validar antes de avançar (fev → mar → abr → mai).

### 3. Reavaliar entidades dependentes
- `daily_productions`: recalcular nada estrutural; só conferir se o `date` continua coerente após o shift (deve ficar mais alinhado, não pior).
- `client_purchase_history.purchased_at`: aplicar o mesmo critério (00h–05h Manaus + origem manager) e mesma correção de −4h.
- `war_plan_executions` e demais tabelas com `created_at` exibido: apenas validar se há sintoma semelhante; só reprocessar se houver evidência.

### 4. Validar pós-correção
- Reexecutar a distribuição por hora em Manaus e confirmar que a "barriga" de 00h–03h sumiu.
- Conferir 5–10 casos manualmente: abrir o modal de Auditoria de Assinaturas e a tela de Inteligência e ver se o horário bate com o esperado pelo gestor.
- Garantir que totais diários (faturamento e comissão por `date`) não mudaram: o `date` da produção é a fonte de verdade financeira, então o shift de instante não pode mover sale para outro dia operacional. Se algum registro do grupo A pertencer a um `daily_production_id` cujo `date` ainda divirja após o ajuste, faço inspeção 1-a-1 antes de mover.

## Resultado esperado
- ~955 transações históricas e suas assinaturas correlatas com `created_at` representando o instante real em Manaus.
- Telas de Auditoria e Inteligência de Assinaturas com horários coerentes em todo o histórico, não só nos registros recentes.
- Nenhum impacto em fechamento diário, comissão ou metas do mês: o `date` operacional continua igual; só o instante exato (`created_at`) é normalizado.
- Nenhuma alteração em código/UI — é uma correção de dados.

## Pontos de atenção
- **Sem schema migration**: este é um reprocessamento de dados, então vai pela ferramenta de insert/update, não pela de migração.
- **Reversível**: vou capturar `id` e `created_at` antigos antes do shift (snapshot em arquivo) para conseguir reverter caso o gestor identifique algum caso legítimo afetado.
- **Não toco** em registros com hora plausível (06h–23h em Manaus); o bug está claramente na janela 00h–05h.
- Caso a inspeção do passo 1 mostre que o shift correto não é 4h cravados (ex.: alguns lotes vieram com 3h), trato cada lote no seu offset real e reporto.