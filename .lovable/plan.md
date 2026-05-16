## Objetivo

Registrar **qual estratégia do Plano de Guerra** foi usada em cada dia por cada barbeiro, junto com o **resultado real** (ticket médio, volume de clientes, % de extras) para comparar e refinar as próximas escolhas.

## Como vai funcionar

1. Quando o barbeiro gera o Plano de Guerra de manhã, a edge function já escolhe uma estratégia (ex: "Volume Inteligente Ter/Qua"). Hoje isso só vai pro texto. Vamos **persistir** o `strategy_id` + `strategy_name` no momento da geração.
2. No fim do dia (ou ao abrir o dia seguinte), um job calcula o **resultado fechado** daquele dia daquela estratégia: ticket médio, nº clientes, % conversão de produto, % conversão de extra, comissão.
3. O barbeiro vê uma nova aba/seção **"Histórico de Estratégias"** com tabela: Data · Estratégia · Clientes · Ticket · Extras % · Comissão · vs Meta. Permite filtrar por estratégia e ver qual rendeu mais pra ele.
4. A IA, na próxima geração, lê os últimos 30d desse histórico e dá preferência às estratégias que **historicamente funcionaram** pra esse barbeiro (e evita as fracas), ainda respeitando o dia da semana.

## Mudanças técnicas

### 1. Nova tabela `war_plan_executions`

```text
id                uuid pk
organization_id   uuid not null
barber_id         uuid not null
date              date not null
strategy_id       text not null     -- ex: 'volume_inteligente'
strategy_name     text not null     -- ex: 'Volume Inteligente (Ter/Qua)'
strategy_focus    text              -- campo 'foco' do catálogo
clients_in_agenda int               -- o que o barbeiro digitou no wizard
plan_text         text              -- briefing completo gerado
-- resultado (preenchido depois):
result_clients         int
result_revenue         numeric
result_avg_ticket      numeric
result_extras_count    int
result_extras_ratio    numeric      -- 0..1
result_products_count  int
result_commission      numeric
result_vs_target_pct   numeric      -- comissão do dia / meta diária
result_calculated_at   timestamptz
created_at        timestamptz default now()
updated_at        timestamptz default now()

unique (barber_id, date)
```

RLS: barbeiro lê o seu; manager/super_admin lê da org; insert via edge function (service role).

### 2. Edge function `barber-ai-assistant` (handler `war_plan`)
- Após escolher a estratégia, faz `upsert` em `war_plan_executions` com `strategy_id`, `strategy_name`, `clients_in_agenda`, `plan_text`. Sem resultado ainda.
- Antes de pedir pra IA, lê **últimos 30 dias** de `war_plan_executions` desse barbeiro com `result_calculated_at not null` e monta um bloco no prompt: *"Histórico do barbeiro: estratégia X teve ticket médio Y vs meta Z em N dias; estratégia W ficou abaixo. Priorize as que funcionaram."* Isso vira o critério de seleção.

### 3. Nova RPC `recalc_war_plan_result(p_barber_id uuid, p_date date)`
Calcula a partir de `sale_transactions` + `daily_productions` do dia:
- `clients`, `revenue`, `avg_ticket`, `extras_count`, `extras_ratio`, `products_count`, `commission`, `vs_target_pct` (usa `monthly_goals` / `work_days`).
- Atualiza a linha em `war_plan_executions`. Idempotente.

### 4. Trigger `after insert/update/delete on sale_transactions`
Chama `recalc_war_plan_result(barber_id, date)` quando há linha em `war_plan_executions` pra esse par. Mantém resultado sempre fresco. (Alternativa simples: rodar a RPC no carregamento da tela do barbeiro do dia seguinte — menos código, mesma UX.)

### 5. Frontend

**`WarPlanWizard.tsx`** — sem mudança de UI. Só agora a edge function persiste a execução.

**Novo componente `StrategyHistoryCard.tsx`** (em `src/components/dashboard/barber/`):
- Tabela das últimas 30 execuções: Data · Estratégia (badge) · Clientes · Ticket · Extras% · Comissão · vs Meta (verde/vermelho).
- Bloco resumo no topo: "Sua estratégia campeã: **X** — ticket médio R$ Y em N dias" e "Mais fraca: **Z**".
- Filtro por estratégia.

**`BarberDashboard.tsx`** — adiciona o `StrategyHistoryCard` numa nova aba "Estratégias" ou abaixo do `WarPlanCard`.

## Arquivos afetados
- `supabase/migrations/...` — nova tabela + RPC + trigger + RLS
- `supabase/functions/barber-ai-assistant/index.ts` — persistir execução, ler histórico no prompt
- `src/components/dashboard/barber/StrategyHistoryCard.tsx` — novo
- `src/components/dashboard/BarberDashboard.tsx` — incluir o card

## O que NÃO muda
- Catálogo das 14 estratégias (já existe na edge).
- `WarPlanCard`, cache de 4h em `daily_productions.coach_message`, fluxo do wizard.
- Schema de vendas/produções.

## Decisão pendente

Quer que o resultado seja recalculado **automaticamente via trigger** em `sale_transactions` (mais "vivo", mais código SQL) ou **on-demand** quando o barbeiro abrir a tela no dia seguinte (mais simples, suficiente pra comparar)? Recomendo on-demand pra começar.
