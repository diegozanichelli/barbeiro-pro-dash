## Problema

No Ao Vivo, a coluna **"(N atd)"** e o **Ticket Médio** estão errados. Hoje conta-se "atendimento" apenas quando há `item_type='service' AND service_category='basic'` (corte).

Exemplo real do Cesar hoje:
- 7 clientes distintos (telefones diferentes), R$ 578,50
- Apenas 1 venda tinha "Corte Adulto" → mostra **(1 atd)** e ticket R$ 578,50
- Os outros 6 clientes pagaram só extras (Barboterapia, Depilação, Relaxamento) ou produto → não contados

## Definição correta de "Atendimento"

**1 atendimento = 1 checkout de cliente distinto** (independente de o item ser corte, extra ou produto). Proxy confiável nos dados: agrupar por `mobile_phone` quando existe, ou por `created_at` (mesmo segundo + mesmo barbeiro) quando não há telefone.

Regras:
- Assinatura (`item_type='subscription'`) **não conta** como atendimento (já é tratada à parte).
- Recepção (sem `barber_id`) usa a mesma regra, agrupada por unidade.
- Se uma transação só tem produto avulso sem cliente associado, conta 1 atendimento por grupo de timestamp.

## Mudanças (apenas frontend)

Arquivo: `src/components/dashboard/manager/LiveDashboard.tsx`

1. Criar helper `countAttendances(transactions)` que retorna o número de checkouts únicos: `new Set(t.mobile_phone || t.created_at).size`, ignorando subscriptions.
2. Substituir no cálculo por barbeiro (linha 1173):
   ```
   const barberClientsToday = countAttendances(barberTxToday)
   ```
3. Substituir no `receptionRows` (linha 356) para usar o mesmo helper agrupado por unidade.
4. Atualizar o cálculo do "Ticket" por barbeiro (linha 1174) — já usa `revenue / barberClientsToday`, então passa a ficar correto automaticamente.
5. Revisar `totalClientsToday` (linha 929) e o ticket médio do header (linha 931) — passarão a refletir a nova contagem corretamente via `receptionClientsTotal` + soma por barbeiro.

## Fora de escopo

- `monthClientsTotal` (linha 755) lê `daily_productions.clients_count`, que vem de outra fonte (manager confirmação do dia). Não mexer agora — é o número oficial do mês fechado. Se você quiser, posso revisar depois.
- RPC `get_monthly_presentation` e demais relatórios continuam usando suas próprias regras.