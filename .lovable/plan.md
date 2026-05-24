## Diagnóstico (validado no banco)

Conferi os dados reais do **Abraão Colares — maio/2026**:

| Métrica | Tela | Banco | Status |
|---|---|---|---|
| Serviços vendidos | 102 | 80 linhas `item_type='service'` | ❌ Diverge — fallback usa `clients_count` |
| Clientes atendidos | 44 | 55 `DISTINCT(created_at)` | ❌ Definição frágil |
| Únicos | 35 | 48 (serviços) / 35 (todos itens) | ❌ Dois cards, definições diferentes |
| Retenção | "muito baixa" | — | ❌ Ignora clientes migrados / da rede |

Raiz do problema: `BarberDeepAnalysis.tsx` mistura **três fontes** (`daily_productions`, `sale_transactions` só serviço, `sale_transactions` todos os itens) com **definições diferentes em cada card** e fallbacks que distorcem os números.

---

## Inconsistências confirmadas

### 1. "Clientes atendidos" usa `DISTINCT(created_at)` — frágil
2 clientes no mesmo segundo = 1 atendimento. **Correção:** `DISTINCT (mobile_phone, dia)` + atendimentos anônimos contam 1 cada.

### 2. "Únicos" tem 2 definições convivendo
Card "Clientes únicos" filtra `item_type='service'` (48); card "Volume" usa todos os itens (35). **Correção:** definição única = telefones distintos no período (todos os itens).

### 3. "Serviços vendidos" com fallback incorreto
`finalServicos = selected.clients` quando faltam transações itemizadas. **Correção:** fallback = `services_count` da `daily_productions`, nunca `clients_count`.

### 4. Retenção não enxerga clientes migrados nem da rede
Clientes importados via CSV (`migrated_from_legacy`) não geram transação → aparecem como "novos". E não há distinção entre **fidelidade ao barbeiro** vs **fidelidade à rede**.

### 5. Ticket Médio mistura serviço/produto com MRR de assinatura
Assinaturas (R$ 100+ uma vez) distorcem o ticket operacional do barbeiro.

### 6. "Recorrência" usa `is_new_client` como verdade
Coluna tem default `false`, então transações antigas/manuais inflam recorrência. **Correção:** derivar recorrência via histórico real de transações.

### 7. Média da casa inconsistente
Radar inclui o próprio barbeiro (linha 402); semáforos Vitais excluem (linha 681). **Correção:** sempre excluir o próprio.

---

## Decisões confirmadas pelo usuário

### ✅ Ticket Médio — separar em 2 cards
- **Ticket Operacional** = (faturamento de **serviços + produtos**) ÷ atendimentos do período
- **Ticket de Assinatura** = MRR de novas assinaturas ÷ nº de assinaturas vendidas

### ✅ Retenção — separar em 2 cards
- **Retenção da Rede** — cliente do mês já era cliente da organização antes do período (qualquer barbeiro OU `clients.created_at` anterior OU `subscription_started_at` anterior). Mede se o salão fideliza.
- **Retenção do Barbeiro** — cliente do mês já tinha sido atendido por **este barbeiro** antes do período. Mede preferência pessoal.

Diferença entre as duas = clientes "da rede" que migraram para outro barbeiro (sinal de relação pessoal fraca).

---

## Plano de correção

### Fase 1 — RPC `get_barber_deep_analysis`
Mover toda a agregação para o banco com **uma única definição por métrica**. Retorna JSON:

```text
{
  volume: { atendimentos, unique_clients, anonymous_visits },
  services: { lines, revenue },
  products: { lines, revenue },
  subscriptions: { count, mrr },
  ticket_operacional,         // (services.revenue + products.revenue) / atendimentos
  ticket_assinatura,          // subscriptions.mrr / subscriptions.count
  retention: {
    network_pct,              // % clientes do mês que já existiam na org antes
    barber_pct,               // % clientes do mês já atendidos por este barbeiro antes
    network_count, barber_count, total
  },
  recurrence_by_history_pct,  // derivado de transações, não da flag is_new_client
  portfolio: { phone_coverage_pct, visits_per_client, product_penetration_pct },
  house: { avg, max },        // sempre EXCLUINDO o próprio barbeiro
  daily_breakdown: [...]      // últimos N dias com mesma definição
}
```

### Fase 2 — Refatorar `BarberDeepAnalysis.tsx`
- Substituir 3 queries paginadas por 1 chamada à RPC.
- Eliminar `clientMetrics` duplicado vs `vitalMetrics`.
- **Métricas Vitais (novo layout):** Volume · Ticket Operacional · Ticket Assinatura · Assinaturas vendidas.
- **Qualidade da Carteira:** Retenção Rede · Retenção Barbeiro · Cobertura Telefone · Visitas/Cliente · Penetração Produto.
- Legendas explicando cada definição (ex.: "Atendimentos = visitas únicas por cliente/dia").

### Fase 3 — Validação
- Conferir RPC vs SQL manual para o Abraão Colares maio/2026.
- Garantir que barbeiros sem itens itemizados continuam coerentes (fallback `daily_productions`).
- Conferir que retenção sobe ao reconhecer clientes migrados.

---

## Fora de escopo (confirmar se quer incluir)
- **BarberEvolution.tsx** e ranking comparativo entre barbeiros — provavelmente têm os mesmos vícios.
- Não vou remover a coluna `is_new_client` do schema (POS continua gravando), só vou parar de usá-la como fonte primária de retenção.
