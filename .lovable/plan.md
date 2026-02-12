

# Eliminar Criacao Automatica de Producoes Diarias

## 1. Migracao SQL

Dropar o trigger e funcao `ensure_daily_production_link`, desvincular 148 transacoes orfas do dia 12, e deletar 43 registros vazios de `daily_productions`.

```text
DROP TRIGGER trg_ensure_daily_production_link ON sale_transactions;
DROP FUNCTION ensure_daily_production_link();
UPDATE sale_transactions SET daily_production_id = NULL WHERE daily_production_id IN (registros vazios do dia 12);
DELETE FROM daily_productions WHERE date = '2026-02-12' AND todos campos zerados;
```

## 2. QuickSaleModal.tsx - Remover criacao de daily_productions

Linhas 367-404: substituir toda a logica de "Get or create daily_production" por uma busca simples. Se o barbeiro ja tem um registro para o dia, vincula. Se nao tem, deixa `daily_production_id = null`.

```text
ANTES:
- Busca daily_production existente
- Se nao existe, INSERT com valores zerados
- Incrementa clients_count

DEPOIS:
- Busca daily_production existente com maybeSingle()
- Se existe, usa o id
- Se nao existe, productionId = null (nao cria nada)
```

## 3. LiveDashboard.tsx - Ler vendas direto de sale_transactions

O painel Ao Vivo atualmente le `tx_*` de `daily_productions`. Sem a criacao automatica, esses campos nao serao populados para barbeiros sem registro.

Solucao: adicionar uma query direta a `sale_transactions` com `source='manager'` para o dia selecionado.

```text
// Nova query no fetchData:
const { data: managerTxData } = await supabase
  .from("sale_transactions")
  .select("barber_id, price_sold, item_type, service_category")
  .eq("organization_id", organizationId)
  .eq("source", "manager")
  .gte("created_at", selectedDate + "T00:00:00-04:00")
  .lt("created_at", nextDay + "T00:00:00-04:00");

// Novo state: managerTransactions
// getBarberRevenue: somar de managerTransactions em vez de tx_*
// totalRevenue: somar de managerTransactions
// hasPendingManualEntry: verificar se barbeiro tem daily_productions com manual_* > 0
```

Funcoes afetadas:
- `getBarberRevenue`: le de `managerTransactions` agrupado por barbeiro
- `useEffect` de totalRevenue (linha 232): soma de `managerTransactions`
- `hasPendingManualEntry`: continua lendo de `productions` (daily_productions)

## 4. Validacao

- O painel "Ao Vivo" continuara mostrando vendas do gestor (agora lidas diretamente de sale_transactions)
- O alerta de "Producao Pendente" reaparecera para os 43 barbeiros no dia 12
- O `handleEditClick` no LiveDashboard (linha 326) continua criando daily_productions quando o gestor abre o TransactionManagerModal - isso e intencional pois e uma acao explicita

## Secao Tecnica

| Arquivo / Recurso | Alteracao |
|---|---|
| SQL Migration | DROP trigger + funcao, UPDATE + DELETE registros dia 12 |
| `QuickSaleModal.tsx` (linhas 367-404) | Remover INSERT em daily_productions; usar maybeSingle() para buscar existente |
| `LiveDashboard.tsx` | Novo state `managerTransactions`; nova query em fetchData; refatorar `getBarberRevenue` e calculo de totalRevenue para ler de sale_transactions |

