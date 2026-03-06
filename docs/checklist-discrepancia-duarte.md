# Passo a passo — conferir discrepância do Duarte (Auditar x Relatório)

Objetivo: validar, com SQL, por que os números do modal **Auditar** podem não bater com a linha em **Lançamentos Diários**.

---

## 0) De onde os dados vêm no código (modal de edição/auditoria)

### Modal de edição/auditoria (`TransactionManagerModal`)
- O modal carrega itens de `sale_transactions`.
- Query base no front:
  - `select id, item_name, item_type, service_category, price_sold, commission_amount, description, client_name, source`
  - ordena por `created_at asc`.
- Filtro principal:
  1. Se existir `dailyProductionId`: `eq('daily_production_id', dailyProductionId)`.
  2. Se **não** existir: fallback por intervalo de data (`barber_id` + `created_at >= data 00:00:00` e `< próximo dia 00:00:00`).
- Filtro opcional adicional: `sourceFilter` (ex.: `manager`).

### Quem abre o modal e com quais props
- **ManagerReports (auditoria do relatório):** abre com `dailyProductionId={editingProduction.id}` e `auditMode={true}`.
- **LiveDashboard (edição):** busca `daily_productions.id` por barbeiro+data e passa esse id para o modal (`sourceFilter="manager"`).
- **LiveDashboard (visualização):** também usa `sourceFilter="manager"`; em alguns fluxos pode abrir sem `dailyProductionId` e cair no fallback por data.

---

## 1) Identificar as chaves do caso (Duarte + data)

> Troque os placeholders antes de executar.

```sql
-- 1A. confirmar o barbeiro
select id, name
from barbers
where lower(name) like '%duarte%';

-- 1B. pegar o daily_production da data analisada
select id, organization_id, barber_id, date,
       services_count, products_count, clients_count,
       tx_basic_total, tx_extra_total, tx_products_total,
       manual_basic_total, manual_extra_total, manual_products_total,
       services_basic_total, services_extra_total, services_total, products_total,
       commission_earned
from daily_productions
where barber_id = '<BARBER_ID_DUARTE>'
  and date = '<YYYY-MM-DD>';
```

---

## 2) Reproduzir exatamente o total do modal (caminho principal)

Esse é o cenário mais comum no relatório (modal aberto com `daily_production_id`).

```sql
-- 2A. listar os itens que o modal deve mostrar
select id, created_at, source,
       item_type, service_category,
       item_name, client_name,
       price_sold, commission_amount
from sale_transactions
where daily_production_id = '<DAILY_PRODUCTION_ID>'
order by created_at asc;

-- 2B. total que deve bater com o rodapé do modal
select
  count(*) as itens,
  coalesce(sum(price_sold), 0) as total_modal,
  coalesce(sum(commission_amount), 0) as comissao_modal
from sale_transactions
where daily_production_id = '<DAILY_PRODUCTION_ID>';
```

Se o modal mostrar valor diferente do `total_modal`, o problema tende a ser filtro/UI.

---

## 3) Reproduzir caminho com `sourceFilter = manager` (Live)

Quando o modal é aberto com filtro de origem, rode também:

```sql
select
  count(*) as itens_manager,
  coalesce(sum(price_sold), 0) as total_manager
from sale_transactions
where daily_production_id = '<DAILY_PRODUCTION_ID>'
  and source = 'manager';
```

Se o valor da tela Live bater com este total, está correto para o contexto de Live (mas pode divergir do total geral sem filtro por `source`).

---

## 4) Se não houver `dailyProductionId`, reproduzir o fallback por data

Use exatamente a mesma janela temporal do front:

```sql
-- considere :d = data analisada e :d1 = dia seguinte
select id, created_at, source, item_type, item_name, client_name, price_sold
from sale_transactions
where barber_id = '<BARBER_ID_DUARTE>'
  and created_at >= '<YYYY-MM-DD>T00:00:00'
  and created_at <  '<YYYY-MM-DD_NEXT>T00:00:00'
order by created_at asc;

select
  count(*) as itens,
  coalesce(sum(price_sold), 0) as total
from sale_transactions
where barber_id = '<BARBER_ID_DUARTE>'
  and created_at >= '<YYYY-MM-DD>T00:00:00'
  and created_at <  '<YYYY-MM-DD_NEXT>T00:00:00';
```

---

## 5) Conferir o que a linha do relatório usa (`daily_productions`)

A linha em **Lançamentos Diários** usa prioridade de totais:
1. `manual_*` (se soma > 0),
2. senão `tx_*` (se soma > 0),
3. senão legado (`services_*` + `products_total`).

```sql
select id,
       coalesce(manual_basic_total, 0) as manual_basic,
       coalesce(manual_extra_total, 0) as manual_extra,
       coalesce(manual_products_total, 0) as manual_products,
       coalesce(tx_basic_total, 0) as tx_basic,
       coalesce(tx_extra_total, 0) as tx_extra,
       coalesce(tx_products_total, 0) as tx_products,
       coalesce(services_basic_total, coalesce(services_total, 0)) as legacy_basic,
       coalesce(services_extra_total, 0) as legacy_extra,
       coalesce(products_total, 0) as legacy_products
from daily_productions
where id = '<DAILY_PRODUCTION_ID>';
```

Se o modal (passo 2) bater com SQL e a linha não, os campos agregados em `daily_productions` estão defasados.

---

## 6) Conferir contagens (ponto clássico de divergência)

A tabela usa:
- `services_count` e `products_count` direto da `daily_productions`;
- `clientes` por mapa de transações (com fallback para `clients_count`).

```sql
-- 6A. contagem real nas transações
select
  sum(case when item_type = 'service' then 1 else 0 end) as services_tx,
  sum(case when item_type = 'product' then 1 else 0 end) as products_tx,
  count(*) as itens_tx
from sale_transactions
where daily_production_id = '<DAILY_PRODUCTION_ID>';

-- 6B. contagem armazenada na produção
select services_count, products_count, clients_count
from daily_productions
where id = '<DAILY_PRODUCTION_ID>';
```

Se 6A ≠ 6B, a discrepância é de sincronização de contagem, não de soma do modal.

---

## 7) Diagnóstico rápido (matriz de decisão)

- **Modal ≠ SQL do passo 2** → problema na consulta/filtro do modal.
- **Modal = SQL do passo 2, mas linha diverge** → `daily_productions` desatualizada.
- **Totais batem, contagens divergem** → `services_count`/`products_count` inconsistentes.
- **Live bate só com filtro `source='manager'`** → divergência é de contexto (filtro), não necessariamente bug.

---

## 8) Evidências mínimas para fechar o caso

1. Resultado do passo 2B.
2. Resultado do passo 3 (se contexto Live).
3. Resultado do passo 5.
4. Resultado do passo 6A + 6B.

Com esses blocos você já consegue concluir **onde** está o erro (consulta, agregação ou contagem).
