

# Auditoria: Aba Relatórios → Evolução (foco em Assinaturas)

Após varredura nos componentes `ShopEvolution`, `UnitsComparison`, `BarberEvolutionChart`, `SubscriptionPerformanceReport`, `ReceptionPerformanceReport` e `SubscriptionAnalytics`, identifiquei **8 erros de arquitetura/cálculo** — sendo 4 críticos relacionados a assinaturas. Os dados do banco confirmam o impacto.

---

## 🔴 Críticos — Assinaturas

### 1. `SubscriptionPerformanceReport` — Conversão infla com renovações/upgrades
**Onde:** linhas 96-99 — conta como "venda de assinatura" qualquer transação com `item_type='subscription'`, incluindo `renew`, `upgrade` e `downgrade`.
**Problema:** o card diz "Clientes Novos → Assinantes", mas se um cliente novo vira assinante e depois faz uma renovação no mesmo mês, a conversão conta 2. Pior: renovações de clientes antigos inflam o numerador sem ter relação com `is_new_client`.
**Correção:** filtrar `subscription_action = 'new'` (e `is_new_client = true`) ao contar vendas de conversão.

### 2. `SubscriptionPerformanceReport` — Sem filtro por organização
**Onde:** linha 58-69 — query não filtra `organization_id`. Funciona hoje só por causa das RLS policies, mas o `super_admin` veria dados de TODAS as organizações misturados.
**Correção:** adicionar filtro explícito `.eq("organization_id", organizationId)` usando `useOrganization()`.

### 3. `SubscriptionAnalytics` — Inteligência ignora `source`
**Onde:** linhas 76-91 — busca todas as transações `item_type='subscription'` sem filtrar `source='manager'`. O banco mostra **89 transações com `subscription_action = NULL`**, sendo **86 do barbeiro** (registros antigos/legados sem a ação preenchida). Esses registros somem do funil mas continuam aparecendo na tabela "Movimentações Recentes" como duplicatas dos registros do gestor.
**Correção:** filtrar `source = 'manager'` (alinhado ao princípio "Gestão como Fonte de Verdade") em todas as agregações de assinatura.

### 4. `SubscriptionAnalytics` — Funil de conversão com denominador errado
**Onde:** linhas 84-90 e 124-134.
- **Denominador (`totalNewClients`)**: conta `is_new_client=true` em **qualquer** transação (corte, produto, assinatura). Se um cliente novo comprou corte + produto + assinatura, ele conta 3 vezes como "oportunidade".
- **Numerador**: usa `subscription_action='new' AND is_new_client=true` (correto), mas comparado contra um denominador inflado — taxa de conversão fica artificialmente baixa.

**Correção:** denominador deve ser `COUNT(DISTINCT mobile_phone)` entre transações com `is_new_client=true` no período (ou contagem de clientes únicos via `clients` registrados no mês).

---

## 🟡 Importantes

### 5. `ShopEvolution` — Receita de assinaturas duplicada com receita do barbeiro
**Onde:** linhas 152-160. Soma `barber_subscription_earnings.total_revenue` (faturamento bruto da cadeira lançado pelo gestor) ao `receita` que já contém `services_total + products_total` das `daily_productions`. Mas a memória `subscription-operational-separation` diz que assinaturas **NÃO entram no faturamento operacional**. Como o `daily_productions` já exclui assinaturas, somar `barber_subscription_earnings` está correto **apenas se** o lançamento de earnings for feito mensalmente. Se o gestor esquecer de lançar, o gráfico mostra "Assinaturas: 0" em vez do dado real do `sale_transactions`.
**Correção:** trocar fonte de `receitaAssinaturas` de `barber_subscription_earnings` para `SUM(price_sold) FROM sale_transactions WHERE item_type='subscription' AND source='manager'` agrupado por mês — fonte única de verdade e sem necessidade de lançamento manual.

### 6. `ReceptionPerformanceReport` — Critério "recepção" frágil
**Onde:** linha 76 — define "venda da recepção" como `barber_id IS NULL`. O banco mostra apenas **27 assinaturas no mês sem barber_id**, mas a maioria das vendas reais da recepção é registrada com `barber_id` atribuído (para fins de comissão). Esse relatório pode estar mostrando quase nada.
**Correção:** alinhar a regra de negócio. Sugestão: considerar "venda da recepção" como `source='manager' AND created_by_role='manager'` ou criar coluna explícita `sold_at_reception`. Como mínimo, documentar visualmente que "Recepção" = vendas sem atribuição.

### 7. `ShopEvolution` / `UnitsComparison` — Lógica de fallback de `services_basic_total` incorreta
**Onde:** `ShopEvolution` linha 144 e `UnitsComparison` linha 135.
```ts
metrics.receitaBasica += servicesBasic > 0 ? servicesBasic : (prod.services_total ?? 0);
```
Quando `services_basic_total = 0` mas `services_extra_total > 0`, o código soma `services_total` inteiro (básico+extra) na coluna "básico" — duplicando o valor de extras (que também é somado em `receitaExtra`). Bug visível em meses de transição quando os campos detalhados começaram a ser populados.
**Correção:** se `services_extra_total > 0` mas `services_basic_total = 0`, calcular `basico = services_total - services_extra` em vez de usar o total bruto.

### 8. `BarberEvolutionChart` — Comissão sem normalização
**Onde:** linha 91-95 — soma `commission_earned` mas não considera que esse campo agora prioriza `tx_commission_earned` (auditoria do gestor) versus `manual_*` (lançamento do barbeiro). Se a trigger de sincronização não rodou, mostra dado defasado.
**Correção:** confirmar via SQL/trigger que `commission_earned` está sempre populado pelo lado auditado (gestor); caso contrário, usar `COALESCE(tx_commission_earned, commission_earned)`.

---

## 📊 Evidências dos dados (últimos 90 dias)

| Métrica | Valor | Observação |
|---|---|---|
| Subs `source='manager'` | 285 (new), 14 (renew), 20 (upgrade) | Base oficial |
| Subs `source='barber'` sem ação | 86 | **Duplicatas vazando no Inteligência** |
| Subs sem `barber_id` | 27 (mês atual) | Recepção real, mas relatório dela só pega isso |
| `is_new_client=true` (mês atual, manager) | 385 | Denominador inflado por contar visitas, não clientes únicos |

---

## 📐 Plano de Implementação

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `SubscriptionPerformanceReport.tsx` | Adicionar filtro `subscription_action='new'` na contagem de vendas |
| 2 | `SubscriptionPerformanceReport.tsx` | Filtrar query por `organization_id` |
| 3 | `SubscriptionAnalytics.tsx` | Adicionar `.eq('source', 'manager')` na query de transações |
| 4 | `SubscriptionAnalytics.tsx` | Trocar contagem de `totalNewClients` para `COUNT(DISTINCT mobile_phone)` |
| 5 | `ShopEvolution.tsx` | Substituir fonte de `receitaAssinaturas` por `sale_transactions` agregada |
| 6 | `ReceptionPerformanceReport.tsx` | Adicionar nota explicativa sobre o critério OU revisar regra de negócio |
| 7 | `ShopEvolution.tsx` + `UnitsComparison.tsx` | Corrigir fallback do `services_basic_total` |
| 8 | `BarberEvolution.tsx` | Usar `COALESCE(tx_commission_earned, commission_earned)` |

---

## ❓ Antes de implementar, preciso de 2 decisões

**A) Item #6 (Recepção):** o critério "vendas sem barber_id" reflete o fluxo da sua barbearia? Ou as vendas de recepção também são atribuídas a um barbeiro (e então esse relatório precisa ser repensado)?

**B) Item #4 (Funil):** quer que "Clientes Novos" no funil seja **(a)** clientes únicos por telefone no mês, ou **(b)** registros da tabela `clients` criados no mês?

Posso implementar os itens **#1, #2, #3, #5, #7, #8** sem essas respostas — são correções óbvias. Os itens **#4 e #6** dependem das suas respostas.

