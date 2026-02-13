

# Correção: Excluir Assinaturas do Faturamento "Ao Vivo" + Comissão Zero

## Diagnóstico

O Fagner Serra mostra R$ 161,40 (Depilação R$ 31,50 + Assinatura Gold R$ 129,90) quando deveria mostrar apenas R$ 31,50. São 3 pontos de correção no código + 1 confirmação.

---

## 1. LiveDashboard.tsx - Faturamento total da unidade (linha 256)

Adicionar filtro para excluir `item_type === 'subscription'` antes de somar:

```text
ANTES: filtered.reduce((sum, t) => sum + (t.price_sold || 0), 0)
DEPOIS: filtered.filter(t => t.item_type !== 'subscription').reduce((sum, t) => sum + (t.price_sold || 0), 0)
```

## 2. LiveDashboard.tsx - Faturamento individual do barbeiro (linhas 302-307)

Mesmo filtro no cálculo por barbeiro:

```text
ANTES:  .filter(t => t.barber_id === barberId)
DEPOIS: .filter(t => t.barber_id === barberId && t.item_type !== 'subscription')
```

Isso corrige automaticamente: card do barbeiro, barra de meta, "cortes restantes" e Top 3 Ranking.

## 3. TransactionManagerModal.tsx - Total no rodapé (linha 406)

Excluir assinaturas do total exibido (itens continuam visíveis na lista):

```text
ANTES:  transactions.reduce((sum, t) => sum + t.price_sold, 0)
DEPOIS: transactions.filter(t => t.item_type !== 'subscription').reduce((sum, t) => sum + t.price_sold, 0)
```

## 4. SubscriptionWizardModal.tsx - Comissão zero (CONFIRMADO)

O Wizard já insere com `commission_rate_used: 0` e `commission_amount: 0` (linhas 305-306). Nenhuma alteração necessária.

## 5. SubscriptionAnalytics.tsx - Valores financeiros nos cards

Adicionar o valor bruto (R$) em cada summary card, usando `price_sold` das transações. Os cards passarão a mostrar contagem + valor total por categoria (Novas, Renovações, Upgrades, Downgrades).

---

## Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `LiveDashboard.tsx` | 2 filtros: total da unidade + total do barbeiro |
| `TransactionManagerModal.tsx` | 1 filtro: total do rodapé |
| `SubscriptionAnalytics.tsx` | Adicionar valores R$ nos summary cards |

## Resultado

- Fagner Serra: R$ 31,50 (apenas o extra), não R$ 161,40
- Assinaturas visíveis no "olhinho" mas sem impactar faturamento
- Comissão de assinatura = 0 no banco (já garantido)
- Relatórios de Evolução > Inteligência mostram faturamento bruto de assinaturas por categoria

