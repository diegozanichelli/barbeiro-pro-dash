

# Varredura geral — bugs de arquitetura, cálculo e dados

Investiguei DB, triggers, queries e código. Encontrei **5 problemas reais com prova SQL** e estimativa de impacto. Aqui vai cada um com a correção proposta.

---

## 🔴 BUG #1 — Duplicação de transações (CRÍTICO)

### Sintoma
Em abril/2026, **469 produções diárias têm vendas duplicadas**: cada item aparece 2x — uma como `source='barber'` e outra como `source='manager'`, com mesmo preço, mesmo cliente, mesma comissão.

### Prova SQL
| Métrica abril/2026 | Valor |
|---|---|
| DPs com tx em ambos os sources | 493 |
| DPs com totais barber ≈ manager (duplicação real) | **469** (40% das produções do mês) |
| Itens `source='barber'` no mês | 2.991 |
| Itens `source='manager'` no mês | 7.038 |

Exemplo Jhon Belchior 20/abr: faturamento real R$ 1.272,50, mas soma das tx = **R$ 2.545,00** (dobro). Comissão real R$ 397, mas soma das tx = R$ 794.

### Causa
`DayReviewModal` (conferência do barbeiro) — quando o barbeiro revisa o dia, ele cria um conjunto novo de transações `source='barber'` em vez de só "marcar como conferido". Essas tx sobrevivem ao lado das `source='manager'` (gestor). Os campos finais `dp.commission_earned`, `dp.services_basic_total` etc. ficam corretos (porque o trigger agrega os totais separados em `tx_*` e `manual_*`), mas qualquer relatório que **leia direto de `sale_transactions`** soma os dois lados.

### Quem está sendo contaminado
- `Leaderboard` / `LiveTop3Ranking` / Campeonato → `get_organization_rankings` faz `LEFT JOIN LATERAL` em `sale_transactions` para contar produtos/extras/assinaturas → contagens **dobradas**
- `client_purchase_history` → cada item aparece 2x no histórico do cliente
- "Clientes Novos" (após o backfill) → o mesmo celular foi marcado como `is_new_client=true` em até **8 transações duplicadas** do mesmo dia
- Auditoria do TransactionManagerModal → mostra cards duplicados

### Correção (3 partes)

**1.1. Migration de limpeza retroativa.** Para cada DP que tem ambos os sources com totais quase iguais, **deletar as `source='barber'`** (manter o gestor como verdade canônica, conforme regra `architecture/management-first-auditing-flow`). Mantém só uma cópia dos itens.

**1.2. Corrigir `DayReviewModal.handleSubmit`.** Hoje insere novas tx `source='barber'`. Mudar para apenas marcar `confirmed_presence=true` na `daily_productions` correspondente, sem reinserir nada. A "conferência" vira leitura, não escrita.

**1.3. Remover trigger duplicado.** Existem dois triggers idênticos em `sale_transactions`:
- `recalculate_production_from_transactions`
- `trigger_recalculate_production`

Dropar o `trigger_recalculate_production` (manter o primeiro).

---

## 🔴 BUG #2 — Backfill "Cliente Novo" inflou métricas

### Sintoma
A migration que executei marcou a "primeira aparição" de cada celular como `is_new_client=true`, mas porque as transações estavam duplicadas (Bug #1), o mesmo celular ficou marcado em até 8 linhas.

### Prova SQL
Em abril/2026, telefones marcados como "novo" mais de uma vez na mesma janela (manager): 10+ casos com 4–8 marcações cada.

### Correção
Após resolver o Bug #1 (deletar duplicatas), rodar **re-backfill idempotente** que reseta `is_new_client=false` em tudo do mês e re-aplica `DISTINCT ON (organization_id, mobile_phone)` só nas tx remanescentes (uma marcação por celular por organização).

---

## 🟡 BUG #3 — Dois triggers idênticos rodando

### Sintoma
Toda inserção em `sale_transactions` dispara `recalculate_daily_production_from_transactions()` **duas vezes** (triggers `recalculate_production_from_transactions` + `trigger_recalculate_production`).

### Impacto
Não corrompe dado (a função é idempotente), mas **dobra a carga de I/O** em cada venda do AO VIVO. Em horário de pico, isso vira gargalo perceptível.

### Correção
Já incluso no Bug #1.3.

---

## 🟡 BUG #4 — Faturamento operacional pode incluir assinatura

### Sintoma
A função `recalculate_daily_production_from_transactions` agrega `tx_basic_total`/`tx_extra_total`/`tx_products_total` filtrando por `service_category`, mas **não exclui** explicitamente `item_type='subscription'`. Hoje funciona porque assinatura usa `item_type='subscription'` (não cai em service nem product), mas se alguém lançar uma assinatura com `item_type='service'` por engano (ex.: catálogo mal configurado), entra no faturamento operacional.

### Prova
A função soma `commission_amount` de TODAS as tx em `tx_commission_earned`, incluindo assinaturas. Se uma assinatura tiver comissão > 0, ela contamina a comissão "operacional".

### Correção
Adicionar `AND item_type IN ('service','product')` em todos os SUMs da função de recálculo. Garantia explícita.

---

## 🟢 BUG #5 — `commission_earned` × `tx_commission_earned` divergem

### Sintoma
A coluna `dp.commission_earned` é calculada pelo trigger `calculate_commission` (multiplicação `total × rate%` baseada nas taxas atuais do barbeiro), enquanto `dp.tx_commission_earned` é a soma direta dos `commission_amount` das transações (que podem ter sido calculadas com **taxa antiga** ou taxa fixa do catálogo).

Isso quebra a regra `data-integrity/commission-itemized-truth` ("a soma itemizada das transações é a verdade").

### Prova
Quase todos os exemplos de abril mostram `dp_comm` (do trigger `calculate_commission` por percentual) ≠ `tx_commission_earned` (soma real itemizada). Folha de pagamento usa `dp.commission_earned` → barbeiros estão recebendo comissão errada quando há item com taxa fixa de catálogo.

### Correção
Mudar `calculate_commission` para usar `tx_commission_earned` quando existir (`> 0`), caindo em `manual_commission_earned` e por último no cálculo legado por percentual. Mesma prioridade tx → manual → legado já usada nos demais campos.

---

## 📋 Plano de execução proposto (ordem segura)

| # | Ação | Tipo | Risco |
|---|---|---|---|
| 1 | Migration: drop trigger duplicado `trigger_recalculate_production` | DB | Baixo |
| 2 | Migration: corrigir `recalculate_daily_production_from_transactions` (filtro `IN ('service','product')`) | DB | Baixo |
| 3 | Migration: corrigir `calculate_commission` (priorizar `tx_commission_earned`) | DB | Médio — afeta folha. Recomendo backup antes |
| 4 | Migration: deduplicação retroativa — deletar `source='barber'` onde existe `source='manager'` equivalente no mesmo DP | DB | Médio. Reversível via histórico |
| 5 | Migration: re-backfill idempotente de `is_new_client` | DB | Baixo |
| 6 | Refator: `DayReviewModal.handleSubmit` — não inserir mais tx `source='barber'`, apenas marcar conferência | Front | Baixo |
| 7 | Verificar relatórios pós-fix: ManagerReports, Leaderboard, SubscriptionPerformance, ClientPurchaseHistory | QA | — |

---

## 🔒 Observações de segurança (linter Supabase)

- **WARN — Extension in Public**: alguma extensão instalada no schema `public`. Não bloqueia, mas é boa prática mover para schema próprio. Sem urgência.
- **WARN — Leaked Password Protection Disabled**: opcional ativar no painel Auth. Recomendado.

---

## 🎯 Ponto de decisão

Quero confirmação **explícita** em duas coisas antes de implementar:

1. **Política de dedupe** (passo 4): mantenho `source='manager'` e deleto `source='barber'` quando há equivalência? (Alternativa: marcar com flag em vez de deletar.)
2. **Folha de pagamento** (passo 3): Mudar a fonte de `commission_earned` pode mexer em valores que já foram pagos. Aplico só para datas ≥ hoje, ou recalculo abril/2026 inteiro também?

Me responde 1) e 2) que eu sigo com a implementação na ordem listada.

