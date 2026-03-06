

# Plano: Corrigir Dashboard Zerado — Eliminar View Inexistente

## Diagnóstico

O problema **não é** o `selectedMonth` nem o `fetchMonthlyGoal`. Os logs de console mostram claramente:

```
Could not find the table 'public.v_consolidated_daily_production' in the schema cache
```

A função `fetchMonthlyStats` (linha 213) faz uma query à view `v_consolidated_daily_production` que **não existe no banco**. Como essa view é a fonte de dados para `totalClients`, `totalServicesCount`, `totalRevenue`, e `todayProduction.total`, tudo retorna zero — resultando no dashboard zerado e "META DIÁRIA: N/A".

A query a `daily_productions` funciona (sem erro), mas os dados dela são usados apenas parcialmente (comissão acumulada, dias trabalhados). Os dados visuais principais vêm da view quebrada.

A memória do projeto (`architecture/data-source-reliability`) confirma: **views devem ser evitadas**; usar diretamente `daily_productions`.

## Correção

### Arquivo: `src/components/dashboard/BarberDashboard.tsx`

**Remover a query à view `v_consolidated_daily_production`** e calcular todos os campos consolidados diretamente da query `daily_productions` que já funciona.

Campos a calcular a partir de `daily_productions`:
- `consolidated_basic_total` → prioridade `tx_basic_total` > `services_basic_total` > 0
- `consolidated_extra_total` → prioridade `tx_extra_total` > `services_extra_total` > 0  
- `consolidated_products_total` → prioridade `tx_products_total` > `products_total` > 0
- `total_revenue` → soma dos três acima
- `total_clients` → `clients_count`
- `total_services` → `services_count`

Mudanças específicas:
1. Remover a segunda query do `Promise.all` (linhas 220-225) — a view inexistente
2. Remover os logs de erro/debug da view (linhas 231-238)
3. Remover a interface `ConsolidatedRow` (linhas 257-268)
4. Recalcular `totalClients`, `totalServicesCount`, `totalServicesRevenue`, `totalProductsRevenue`, `totalRevenue` usando os dados de `typedProductions` com a lógica de prioridade tx > manual > legado (mesmo padrão da RPC `get_manager_report_stats`)
5. Ajustar `todayProduction.total` para usar cálculo direto em vez da view
6. Adicionar o log de diagnóstico solicitado no `fetchMonthlyGoal`

