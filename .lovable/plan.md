
# Correcao: Divergencia de Ranking entre Barbeiros

## Problema
O Leaderboard faz **duas queries**: uma RPC segura (SECURITY DEFINER) para dados financeiros, e uma query direta em `sale_transactions` para contagens de produtos/extras/assinaturas. A segunda query e filtrada por RLS, fazendo cada barbeiro ver apenas os proprios dados. Resultado: todos se veem em 1o lugar.

## Correcoes

### 1. Expandir a RPC `get_organization_rankings` (Migracao SQL)

Adicionar 3 novas colunas ao retorno da funcao:
- `products_count` (COUNT de `item_type = 'product'`)
- `extras_count` (COUNT de `item_type = 'service' AND service_category = 'extra'`)
- `subscriptions_count` (COUNT de `item_type = 'subscription'` OU `item_name` contendo 'assinatura'/'plano')

A funcao ja e SECURITY DEFINER, entao todos os usuarios verao os mesmos dados. Sera feito um LEFT JOIN com `sale_transactions` usando `daily_production_id` para manter a mesma janela de datas.

Confirmacao: a RPC ja soma `products_total + tx_products_total`, atendendo ao requisito de consistencia.

### 2. Remover query direta no Frontend

No arquivo `src/components/dashboard/Leaderboard.tsx`:
- Remover linhas 337-363 (query direta em `sale_transactions`)
- Remover o objeto `barberTransactionStats` e sua logica de agregacao
- Usar `products_count`, `extras_count`, `subscriptions_count` diretamente do retorno da RPC expandida

### 3. Trigger de atualizacao ao fechar modais

Adicionar callback `onSaleComplete` no componente `Leaderboard` que chama `fetchRankings()`. Propagar esse callback dos dashboards (ManagerDashboard e BarberDashboard) para que, ao fechar QuickSaleModal, SubscriptionWizardModal ou BarberSaleForm, o ranking seja recarregado.

Como alternativa mais simples (sem refatorar props entre muitos componentes): adicionar um `refetchInterval` de 30 segundos ou usar `document.addEventListener('visibilitychange')` para refetch quando a aba volta ao foco.

### 4. Consistencia anual

Os filtros `p_start_date` e `p_end_date` da RPC ja atendem qualquer periodo (diario, mensal, anual). A performance nao sera afetada negativamente porque o JOIN com `sale_transactions` usa `daily_production_id` que ja tem indice.

## Secao Tecnica

### Migracao SQL - Nova RPC

```text
CREATE OR REPLACE FUNCTION get_organization_rankings(...)
RETURNS TABLE(
  -- colunas existentes...
  products_count bigint,
  extras_count bigint,
  subscriptions_count bigint
)
-- Adiciona subqueries correlacionadas ou LEFT JOIN com sale_transactions
-- agrupando por barber_id, contando item_type adequado
```

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| Migracao SQL | Expandir RPC com 3 novas colunas |
| `src/components/dashboard/Leaderboard.tsx` | Remover query direta (linhas 337-363), usar dados da RPC, adicionar refetch automatico |
| `src/integrations/supabase/types.ts` | Atualizado automaticamente apos migracao |

### Verificacoes de seguranca

- mobile_phone: nao afetado (campo em sale_transactions, nao tocado pela RPC)
- Comissao: nao afetada (calculate_commission ja soma ambas fontes)
- RLS: melhorado -- barbeiros nao precisam mais de SELECT em sale_transactions de outros
