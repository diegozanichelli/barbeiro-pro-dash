# Aposentar `barber_subscription_earnings` — wizard do POS como fonte única

## Objetivo
Eliminar a fonte paralela de assinaturas (lançamento manual mensal) que hoje não alimenta folha, ranking nem dashboard do barbeiro. O wizard de POS (`sale_transactions` com `item_type='subscription'`) passa a ser a **única** verdade.

## Escopo das mudanças

### 1. UI do gestor — remover os dois pontos de entrada
Arquivo: `src/components/dashboard/manager/ManagerNavigation.tsx`
- Remover os itens `comparison` ("Money") e `subscription` ("Assinaturas") do grupo Financeiro (linhas 106–111). O grupo Financeiro fica só com Comissões e Dia a Dia.

Arquivo: `src/components/dashboard/ManagerDashboard.tsx`
- Remover os `<TabsContent>` `subscription` e `comparison` (linhas 183–193).
- Remover os imports de `SubscriptionEarningsForm` e `EarningsComparison`.

### 2. Componentes órfãos — apagar
- `src/components/dashboard/manager/SubscriptionEarningsForm.tsx`
- `src/components/dashboard/manager/EarningsComparison.tsx`
- `src/components/dashboard/barber/SubscriptionEarningsCard.tsx` (já não montado em lugar nenhum, confirmar e remover)

### 3. Banco de dados — depreciar a tabela
Migração:
- `DROP TABLE public.barber_subscription_earnings CASCADE;`

Justificativa: o aud it já confirmou que nenhuma folha, ranking, dashboard de barbeiro ou integração financeira consome essa tabela. A única leitura era `EarningsComparison` (informativo) e `SubscriptionEarningsCard` (órfão).

Dados existentes (R$ 80.474 de maio etc.) serão **descartados** — o usuário confirmou em conversa anterior que o número do wizard é o que vale para a folha.

### 4. Memórias a atualizar
- `mem://features/subscription-earnings-module` → marcar como **OBSOLETO** (módulo aposentado em 2026-05-16; wizard do POS é fonte única).
- `mem://index.md` → atualizar o bullet "Subscription Earnings" para refletir aposentadoria.

## Fora de escopo (não mexe)
- Wizard do POS (`SubscriptionWizardModal`) — segue como está.
- `subscription_commission_rate` por barbeiro — segue como está; a folha continua usando `MRR × taxa`.
- `MonthlyPayroll`, `SubscriptionAnalytics`, `SubscriptionIntelligence`, Live Dashboard — já consomem `sale_transactions`, nada muda.
- `subscription_plans` / `subscription_plan_services` — não afetados.

## Detalhes técnicos
- A migração usa `DROP TABLE ... CASCADE` para limpar qualquer policy/index dependente. Não há foreign keys apontando para essa tabela (confirmado no schema).
- Após a migração, `src/integrations/supabase/types.ts` é regenerado automaticamente.
- Nenhuma edge function consome a tabela (confirmado via grep).

## Resultado esperado
- Gestor não vê mais "Money" nem "Assinaturas" no Financeiro — só Comissões e Dia a Dia.
- Nenhum fluxo permite lançar comissão de assinatura manualmente.
- Zero ambiguidade: tudo que aparece em folha/ranking/dashboard vem do wizard.
