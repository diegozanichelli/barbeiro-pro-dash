## Auditoria do fluxo de Upgrade/Downgrade — Inteligência de Assinaturas

Sim, há inconsistências reais. O Δ MRR aparece zerado porque **nenhum upgrade/downgrade tem `previous_plan_id` / `previous_price` preenchidos**.

### Diagnóstico (evidência do banco)

Total de 21 transações marcadas como upgrade/downgrade (todas as datas):
- **0 / 21** com `previous_plan_id` preenchido
- **0 / 21** com `previous_price` preenchido
- Apenas **1 / 21** tem efetivamente uma assinatura anterior gravada em `sale_transactions` para o mesmo `mobile_phone` (telefone `92994966119`, plano anterior R$ 115,90 → atual R$ 129,90)
- 20 / 21 foram classificadas como upgrade **sem ter histórico de assinatura anterior** no sistema

### Causas-raiz

1. **Migration retroativa** — o trigger `trg_fill_previous_subscription_plan` foi criado hoje. Todas as 21 linhas históricas foram inseridas antes dele e ficaram NULL. Não houve backfill.

2. **RPC `create_sale_and_ensure_production` não recebe `previous_plan_id` / `previous_price`** — depende 100% do trigger procurar por histórico de telefone. Se o wizard já tem o plano anterior selecionado, esse dado está sendo descartado.

3. **Ordem dos triggers BEFORE INSERT** — alfabética:
   - `trg_fill_previous_subscription_plan` (f)
   - `trg_normalize_phone_sale_transactions` (n)
   
   O fill roda **antes** da normalização, então busca por `mobile_phone = NEW.mobile_phone` no formato bruto enquanto o histórico já está normalizado. Telefones digitados com espaços/parênteses no wizard nunca casam → previous fica NULL mesmo havendo histórico.

4. **Wizard classifica como "upgrade" mesmo sem assinatura prévia registrada** — 20 de 21 casos. Origem provável: cliente tinha assinatura num sistema antigo, gestor marca "upgrade" no wizard, mas como não há linha anterior em `sale_transactions`, o trigger não tem de onde tirar o `previous_*`. Não há validação alertando o gestor.

5. **Sem fallback no payload** — o wizard sabe qual plano o cliente tinha (mostra na UI), mas essa informação não viaja para o RPC.

### Plano de correção

**A. Banco (migration)**
1. Reordenar triggers para garantir normalização antes do fill: renomear `trg_fill_previous_subscription_plan` → `trg_z_fill_previous_subscription_plan` (ou criar trigger único combinando os dois passos), assim a normalização do telefone roda primeiro.
2. Atualizar `fill_previous_subscription_plan`:
   - Respeitar `previous_plan_id` / `previous_price` quando já vierem do wizard (não sobrescrever).
   - Como fallback, buscar primeiro em `clients.subscription_plan_id` (cliente cadastrado) e só depois no histórico de `sale_transactions`.
3. Estender `create_sale_and_ensure_production` para aceitar e propagar `previous_plan_id` / `previous_price` quando o wizard enviar.
4. Backfill único: para cada upgrade/downgrade existente, popular `previous_plan_id` / `previous_price` a partir de (a) `clients.subscription_plan_id` + `subscription_plans.price`, ou (b) última transação de assinatura do mesmo telefone normalizado anterior à venda. Linhas sem nenhuma das fontes ficam NULL e são marcadas em log.

**B. Frontend — `SubscriptionWizardModal`**
1. Quando o gestor escolher ação `upgrade`/`downgrade`, enviar no payload:
   - `previous_plan_id` (do plano atual que a UI já mostra)
   - `previous_price` (preço cadastrado do plano anterior)
2. Validação suave: se ação = upgrade/downgrade e o cliente **não tem** histórico (nem em `clients`, nem em `sale_transactions`), exibir aviso "Sem assinatura anterior registrada — confirme se a ação correta não é 'Nova adesão'". Não bloqueia, apenas alerta.

**C. Frontend — `SubscriptionAnalytics`**
1. Card Δ MRR ganha tooltip com contagem de upgrades/downgrades **sem** `previous_price` (já no payload da RPC), para o gestor saber quantos casos estão fora do cálculo.
2. Banner amarelo quando `upgrades + downgrades > 0` e Δ MRR = R$ 0, sugerindo abrir auditoria das linhas sem plano anterior.

**D. RPC `get_subscription_intelligence`**
1. Adicionar dois campos no payload: `mrr_delta_unknown_count` (upgrades/downgrades sem `previous_price`) e `mrr_delta_known_count`.

### Detalhes técnicos

```text
trigger order BEFORE INSERT (atual → desejado)
  before_sale_transaction_insert         (calculate_sale_commission)
  trg_enforce_mobile_phone_for_new...
  trg_fill_previous_subscription_plan    ← roda antes da normalização (BUG)
  trg_fill_sale_transaction_unit_id
  trg_normalize_phone_sale_transactions  ← deveria rodar ANTES do fill
```

Solução simples: renomear o trigger de fill para `trg_z_fill_previous_subscription_plan` (ordem alfabética garante execução depois). Sem mexer em nomes de funções/políticas.

### Escopo do que **não** entra agora
- Nenhuma alteração em `SubscriptionEditModal` (já permite corrigir manualmente).
- Nenhuma mudança nos relatórios `SubscriptionsTracking` / `SubscriptionPerformanceReport`.
- Nenhuma mudança em RLS.

Quer que eu implemente o pacote completo (A+B+C+D), ou prefere fatiar (ex.: começar só por A+backfill para já preencher os históricos)?