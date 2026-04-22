

# Corrigir cards zerados no Relatório do Gestor (Receita / Clientes / Ticket)

## Diagnóstico

O console mostra o erro real:

```
ERRO DA VIEW: PGRST205
Could not find the table 'public.v_consolidated_daily_production' in the schema cache
em ManagerReports.tsx:92
```

`ManagerReports.tsx` consulta a view `v_consolidated_daily_production` que **não existe no banco** (foi removida ou nunca foi criada — bate com a regra arquitetural do projeto de **não usar Views**). Como a query falha, `totalRevenue` e `totalClients` viram `0`, e por consequência `averageTicket` também zera.

## Solução

Substituir a chamada à view inexistente pela **RPC já existente e validada** `get_manager_report_stats(p_date_from, p_date_to, p_unit_id, p_barber_id)`, que devolve exatamente:

- `total_revenue` (com prioridade tx → manual → legado, igual aos demais relatórios)
- `total_commission`
- `total_clients`
- `average_ticket`

A RPC já é usada em outros pontos do sistema, está testada e respeita o `organization_id` via `get_user_organization()`. Zero risco de regressão.

## Mudanças em `ManagerReports.tsx` (`fetchStats`)

### Antes (linhas 97–158)
- Monta `consolidatedQuery` na view inexistente
- Faz query separada de comissões em `daily_productions`
- Faz lookup manual de barbeiros por unidade

### Depois
```ts
const { data: statsData, error: statsError } = await supabase.rpc(
  "get_manager_report_stats",
  {
    p_date_from: startDate,
    p_date_to: endDate,
    p_unit_id: selectedUnit !== "all" ? selectedUnit : null,
    p_barber_id: selectedBarber !== "all" ? selectedBarber : null,
  }
);

if (statsError) {
  console.error("Erro ao buscar stats:", statsError);
}

const row = statsData?.[0] ?? { total_revenue: 0, total_commission: 0, total_clients: 0, average_ticket: 0 };
const totalRevenue = Number(row.total_revenue) || 0;
const totalClients = Number(row.total_clients) || 0;
const totalCommission = Number(row.total_commission) || 0;
const averageTicket = Number(row.average_ticket) || 0;
```

A parte que calcula **Metas Batidas** (`goalsAchieved`) continua igual — ela usa `daily_productions` + `monthly_goals` diretamente (não dependia da view).

## Resultado esperado

| Card | Antes | Depois |
|---|---|---|
| Receita Bruta Total | R$ 0,00 | Valor real do período |
| Total de Clientes | 0 | Soma real de `clients_count` |
| Ticket Médio | R$ 0,00 | Receita / Clientes |
| Comissão Total | (já funcionava) | Sem mudança |
| Metas Batidas | (já funcionava) | Sem mudança |

## Arquivos afetados

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/components/dashboard/manager/ManagerReports.tsx` | `fetchStats`: trocar view por RPC `get_manager_report_stats` (~50 linhas removidas, ~15 adicionadas) |

## Impacto / risco

- **Zero migration**, zero mudança de schema.
- **Zero impacto** nos demais relatórios (Evolução, Ao Vivo, Folha, etc. — nenhum usa essa view).
- Lógica de cálculo fica **mais consistente** com o resto do sistema (mesma RPC já usada em outros lugares).
- Filtros por unidade e barbeiro continuam funcionando (são parâmetros nativos da RPC).

