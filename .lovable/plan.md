## Objetivo

Permitir cadastrar (ou atualizar) um cliente já assinante vindo do sistema antigo, vinculando o plano com uma **data de início real** e uma **unidade de origem**, **sem criar `sale_transaction`** — para não inflar faturamento/comissão/ranking nem assumir que a venda foi hoje.

## Mudanças de schema (migration)

Adicionar à tabela `clients`:

- `subscription_started_at` — `date` nullable — data em que o plano passou a vigorar (vinda do sistema antigo).
- `subscription_unit_id` — `uuid` nullable — unidade onde o cliente é atendido.
- `migrated_from_legacy` — `boolean default false` — marca que o vínculo veio de migração manual (não de uma venda).

Sem mudanças nas RLS existentes (gestor já controla `clients`).

## Lógica de inadimplência (ajuste necessário)

Hoje `ClientsManagement.isOverdue` olha só `sale_transactions`. Após migração, esses clientes não teriam pagamento e cairiam direto em "Inadimplentes >30d". Ajuste:

- Considerar o **maior valor** entre (a) último `sale_transactions` pago e (b) `clients.subscription_started_at`.
- Inadimplente quando esse "último pagamento conhecido" > 30 dias.
- Quando o gestor regularizar via "Renovar plano" (wizard normal), o sale_transaction passa a ser a fonte e o campo `subscription_started_at` deixa de importar para inadimplência.

## UI

Botão fixo no topo da aba **Clientes** (ao lado do search): `+ Cadastrar cliente migrado`.

Abre um modal novo `MigratedClientModal.tsx` com:

- Telefone (obrigatório, validado com `isValidPhone`)
- Nome (obrigatório, completo — bloqueio igual ao filtro "Nome incompleto")
- Plano (select de `subscription_plans` ativos)
- Unidade (select de `units`)
- Data de início do plano (date picker, default hoje, máx hoje)
- Aviso visível: *"Esse cadastro não gera venda nem comissão. Use somente para clientes vindos do sistema antigo."*

Comportamento:

- Se já existe cliente com mesmo telefone na org → **atualiza** (`name`, `subscription_plan_id`, `subscription_started_at`, `subscription_unit_id`, `migrated_from_legacy=true`) e mostra toast *"Cliente existente atualizado"*.
- Se não existe → `INSERT` em `clients` com os campos acima.
- Em nenhum caso insere em `sale_transactions`, `client_purchase_history` ou pontuação.
- Ao concluir, fecha modal e refaz `fetchData()`.

## Onde os dados aparecem

- Card do cliente: badge sutil "Migrado" quando `migrated_from_legacy=true` e sem pagamento ainda no app.
- Filtro "Inadimplentes >30d" passa a respeitar `subscription_started_at` (ajuste explicado acima).
- Quando o gestor depois fizer a primeira renovação pelo fluxo normal (Wizard → atribuição), tudo segue como hoje.

## Detalhes técnicos

```text
clients
├── subscription_started_at  date         (migrado: data real do antigo; null: cadastro normal)
├── subscription_unit_id     uuid → units (unidade de origem; opcional para clientes históricos)
└── migrated_from_legacy     bool default false
```

Arquivos tocados:

- `supabase/migrations/*_add_legacy_client_fields.sql` (3 colunas + index opcional em `subscription_unit_id`)
- `src/components/dashboard/manager/ClientsManagement.tsx`
  - Botão "Cadastrar cliente migrado" no header
  - `lastSubByPhone` passa a considerar `subscription_started_at` na função `isOverdue`
  - Badge "Migrado" nos cards
- `src/components/dashboard/manager/MigratedClientModal.tsx` (novo)
  - Validação Zod, upsert por `(organization_id, mobile_phone)`
- `src/integrations/supabase/types.ts` — regenera automaticamente após migration

## Fora de escopo

- Importação em lote via CSV (pode virar fluxo separado depois).
- Histórico retroativo de pagamentos antigos do sistema legado (este fluxo só registra o **estado atual** do cliente).
