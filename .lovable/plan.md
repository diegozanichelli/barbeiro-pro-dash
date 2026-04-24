

# Por que o banner de renovação não aparece — diagnóstico e correção

## O que aconteceu no print

O cliente **Alessandro Nogueira Monteiro (92 99255-5554)** está corretamente identificado como **Assinante** do plano **Gold Corte e Barba**, mas o banner de "Renovação" não apareceu entre a unidade e o "Tipo de Cliente".

## Causa raiz (confirmada no banco)

O hook `useSubscriptionCycle` busca a **última transação** com `item_type='subscription'` e `subscription_action IN ('new','renew','upgrade')` para calcular o ciclo. Esse cliente tem `subscription_plan_id` preenchido na tabela `clients`, mas **zero transações** de assinatura no histórico. Resultado: `cycle = null` → banner escondido.

**Isso não é caso isolado**: dos 2.767 assinantes ativos no sistema, **2.510 (91%)** não têm nenhuma transação de assinatura registrada. Foram vinculados diretamente ao plano (importação legada / fluxo antigo / vínculo manual via gestão), sem passar por uma adesão `new` no PDV.

Ou seja: o alerta preditivo só funciona para os 9% de assinantes recentes — exatamente o oposto do que precisamos.

## Solução: fallback inteligente

O hook precisa ter uma **segunda fonte de data-âncora** quando não há transação de assinatura:

| Prioridade | Fonte da data-âncora | Cobertura |
|---|---|---|
| 1ª | Última `sale_transaction` de assinatura (`new`/`renew`/`upgrade`) com `cycle_anchor` no description | 9% atuais |
| 2ª (NOVO) | `clients.subscription_started_at` se existir, senão `clients.updated_at` da linha que tem `subscription_plan_id` | resto dos 91% |
| 3ª (NOVO) | Se nada disso existir, mostra banner **neutro** "Assinante (data de adesão indisponível)" + botão "Renovar agora" — assim o usuário ainda vê o status e pode renovar | edge cases |

A primeira renovação feita pelo banner já grava o `cycle_anchor` no `description`, e a partir daí o cliente migra para a fonte 1 automaticamente. Auto-cura.

## UX adicional: tornar o banner óbvio

Mesmo quando aparece, o banner está num espaço apertado entre dois blocos densos. Vamos:

1. **Mover o banner para o topo absoluto do step 1** (acima do "Em qual recepção?"), não no meio.
2. **Aumentar a presença visual** quando for `RENOVAÇÃO DISPONÍVEL` ou `VENCIDO`: borda mais grossa + sombra dourada/vermelha + ícone maior.
3. **Mostrar sempre que houver assinatura identificada** (mesmo `EM DIA`) — já está assim, mas com fallback agora cobre 100% dos assinantes.
4. **Texto explícito do plano e data** no estado neutro: *"Assinante: Gold Corte e Barba — data de adesão não registrada • [Renovar agora]"*.

## Arquivos afetados

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/hooks/useSubscriptionCycle.ts` | Adicionar fallback: se `sale_transactions` não retornar nada, buscar em `clients` (`subscription_plan_id`, `updated_at`, e o nome do plano via join com `subscription_plans`). Se houver plano mas sem data confiável, retornar um `cycle` especial com `status='sem_historico'`. |
| 2 | `src/lib/subscriptionCycle.ts` | Adicionar 4º estado `sem_historico` ao tipo `CycleStatus` + variant `neutral`. Função `computeCycleStatus` continua igual; nova função `buildLegacyCycle(planName)` retorna o objeto neutro. |
| 3 | `src/components/dashboard/manager/SubscriptionCycleBanner.tsx` | Adicionar visual do estado `sem_historico` (cinza com borda âmbar discreta, ícone de relógio, texto "Adesão sem registro — Renovar para iniciar ciclo"). Botão "Renovar agora" funciona normal. |
| 4 | `src/components/dashboard/manager/QuickSaleModal.tsx` | (a) Mover o bloco do banner para **antes** do bloco "Em qual recepção?" (topo do step 1, depois apenas do título). (b) Garantir que `handleQuickRenewFromBanner` trata o caso `sem_historico` usando `today` como anchor. |

## Lógica do fallback no hook (resumo técnico)

```
1. Tenta buscar last sale_transaction (lógica atual)
2. Se vazio E mobilePhone presente:
     buscar clients.subscription_plan_id + plans.name + clients.updated_at
     Se subscription_plan_id existe:
        retornar cycle = { status: "sem_historico", ... }
        retornar planId, planName
3. Senão: retorna null como hoje (cliente sem assinatura)
```

## Comportamento da ação "Renovar agora" no estado `sem_historico`

- Adiciona o plano atual ao carrinho com `action='renew'` (igual aos outros estados).
- `cycle_anchor = today` (já que não temos data confiável de início).
- Toast: *"Renovação registrada! Próximo vencimento: 23/05/2026 • A partir de agora seu ciclo está rastreado."*

## Impacto / risco

- **Zero migration**, zero schema, zero RPC.
- 100% dos assinantes passam a ver o status de ciclo no PDV (vs. 9% hoje).
- A primeira renovação já normaliza o histórico — o sistema se cura sozinho.
- Banner mais visível no topo do step 1 elimina o "sumiço" relatado pelo usuário.
- Nenhum relatório/comissão muda — `cycle_anchor` continua sendo só metadado opcional.

