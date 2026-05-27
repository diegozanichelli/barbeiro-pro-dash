
## Contexto

Hoje a aba **Inteligência de Assinaturas** lê 100% de `sale_transactions` (RPC `get_subscription_intelligence`), então clientes importados via CSV (`MigratedClientModal` → tabela `clients` com `migrated_from_legacy=true`, sem `sale_transactions`) ficam invisíveis ali. O painel mede só a **tração do mês**, nunca o **tamanho da carteira**.

Vamos resolver com dois universos claramente separados, exatamente como pediu.

## O que será construído

### 1. Novo RPC `get_subscription_portfolio_overview`
Retorna a foto da carteira **independente de mês/origem**, lendo de `public.clients` + `public.subscription_plans`:

- `mrr_total`: soma de `subscription_plans.price` de todos os clientes com `subscription_plan_id IS NOT NULL` na organização (e filtro opcional de unidade via `subscription_unit_id`).
- `active_subscribers`: contagem desses clientes.
- `legacy_count`: contagem desses com `migrated_from_legacy = true`.
- `legacy_mrr`: MRR proveniente apenas dos legados (para % e tooltip).
- `app_acquired_count` / `app_acquired_mrr`: o resto (origem app = `migrated_from_legacy = false`).

Filtro: `p_unit_id uuid DEFAULT NULL`. Sem filtro de período — é estoque, não fluxo.

### 2. Linha neutra "Migrado" na tabela de Movimentações Recentes
O RPC `get_subscription_intelligence` continua **intacto** nos cards de performance, mas a query da tabela ganha uma `UNION ALL` com as importações legadas do mês selecionado:

- Origem: `clients` onde `migrated_from_legacy = true` e `subscription_started_at` dentro de `[p_start_date, p_end_date]`.
- Campos mapeados: `subscription_action = 'legacy_import'`, `price_sold = plano.price`, `previous_price = NULL`, `source = 'manager'`, `is_new_client = false`.
- **Não entra** em `counts`, `revenue`, `mrr_delta`, `conversion_rate`, `downgrade_reasons` — entra **só** no array `transactions` retornado.

### 3. UI em `SubscriptionAnalytics.tsx`

**Nova seção no topo** (`Visão Geral da Carteira`), antes dos cards atuais:
- Card grande "MRR Total da Carteira" (R$, destaque dourado).
- Card "Assinantes Ativos" (número absoluto).
- Card secundário "Base Legada (Importada)" com `{legacy_count} assinantes · {legacy_mrr} · {legacy_pct}% da carteira` e tooltip explicando que vieram via CSV.
- Pequeno divisor visual / título da seção seguinte: **"Performance do Mês"** (mês selecionado).

**Bloco "Performance do Mês"** (intocado matematicamente):
- Mesmos 4 cards (Novas / Renovações / Upgrades / Downgrades), Δ MRR, Conversão — sem mudança.
- Apenas ganham o título de seção acima e copy reforçando que ignoram legados.

**Tabela "Movimentações Recentes"**:
- Novo rótulo no `ACTION_LABELS`: `legacy_import: "Migrado"`.
- Nova classe em `ACTION_BADGE_CLASS`: cinza neutro (`bg-muted text-muted-foreground border-border`).
- Coluna `Δ`: renderiza `—` quando `action === 'legacy_import'` (já é o default quando `previous_price` é nulo, mas reforçamos no código).
- Mantém ordenação por `created_at DESC` (importados usam `subscription_started_at` convertido para timestamp).

### 4. Filtro de unidade
A nova seção respeita o `selectedUnit` atual via `subscription_unit_id`. O filtro de **Origem (manager/all)** **não se aplica** ao bloco de carteira — ele é absoluto, com nota no tooltip.

## Detalhes técnicos

- DB-first: criar o RPC `get_subscription_portfolio_overview(p_unit_id uuid)` antes de mexer no front.
- Atualizar `get_subscription_intelligence` para anexar as linhas legadas só no array `transactions`, com `LIMIT` consciente (mantém o cap de 500).
- Memória `legacy-client-migration` continua válida ("não gera venda nem comissão"); adicionar nota no índice de que importados agora aparecem na carteira + linha neutra na Inteligência.
- Sem mudanças em `SubscriptionPerformanceReport`, `BarberDeepAnalysis` ou outras telas.

## Fora de escopo

- Atribuição/comissão de legados (continuam neutros).
- Cards de churn ou retenção (esse painel é movimentação + estoque, não retenção).
- Edição de cliente legado pela tabela de movimentações.
