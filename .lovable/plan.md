## Objetivo

Transformar o card **Faturamento** da sidebar do Ao Vivo em uma visão de **Faturamento Total do dia**, somando o operacional (serviços + produtos) com as assinaturas vendidas hoje — mantendo intacta a lógica operacional que alimenta ranking de filiais, ranking de barbeiros, ticket médio e meta diária.

## O que muda (apenas UI no `LiveDashboard.tsx`)

Card "💰 Faturamento" passa a exibir 3 linhas:

```text
FATURAMENTO TOTAL HOJE
R$ 12.450,00          ← número grande (operacional + assinaturas)

▸ Vendas (serviços + produtos)  R$ 10.200,00
▸ Assinaturas (MRR do dia)      R$  2.250,00
```

- Valor grande = `totalRevenue + subscriptionTotalRevenue` (ambos já existem no componente).
- Comparativo vs ontem (a setinha verde/vermelha) continua usando **apenas o operacional**, pra não poluir a leitura de performance do dia.
- Animação de pulso quando o número muda permanece, agora disparada pelo total.

## O que NÃO muda (importante)

Segue a memória `subscription-operational-separation`:

- **Ranking de Filiais**, **Top 3 Barbeiros**, **Ticket Médio**, **Meta Diária**, **Tabela de Performance** → continuam **operacionais puros** (sem assinatura). Assinatura é receita recorrente paga dia 15, misturar distorce ticket, comissão e pacing.
- Card **👑 ASSINATURAS** continua existindo separado, com ranking de quem vendeu.
- Nenhuma mudança em RPC, schema ou cálculos de backend.

## Arquivo afetado

- `src/components/dashboard/manager/LiveDashboard.tsx` — apenas o bloco do card "Faturamento" na sidebar (~linha 1475–1530).

## Memória a atualizar

- `mem://features/live-dashboard-sidebar-components` — registrar que o card Faturamento agora exibe Total com breakdown Operacional + Assinaturas.