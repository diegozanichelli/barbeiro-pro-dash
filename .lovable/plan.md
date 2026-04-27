## Refatoração: Evolução > Barbeiro — Análise Individual Profunda

### Objetivo
Manter o gráfico anual atual (Meta vs Comissão) e adicionar **abaixo dele**, na mesma aba "Barbeiro", um dashboard de análise individual profunda do barbeiro selecionado, permitindo identificar rapidamente pontos fracos (ex.: vende serviço mas não produto, atende muita gente com ticket baixo, baixa retenção etc.).

### Mudanças de UI (em `BarberEvolution.tsx`)

A aba "Barbeiro" passa a ter:

1. **Filtros (topo)** — mantém Barbeiro + adiciona seletor de **período**:
   - Mês atual
   - Últimos 3 meses
   - Ano selecionado (mantém o seletor de ano existente, usado pelo gráfico anual)

2. **Gráfico anual existente** (Meta vs Comissão Ganha) — sem mudanças visuais, continua usando o ano selecionado.

3. **Bloco novo "Análise Individual"** — respeita o filtro de período:

   **a) Cards de KPI (grid 3 colunas no desktop, 1 no mobile):**
   - **Ticket Médio**: `receita_total / total_clientes` no período.
   - **Total de Clientes Atendidos**: contagem distinta de checkouts.
   - **Taxa de Retenção**: % de clientes únicos do período (por `mobile_phone`) que já tinham sido atendidos por **esse mesmo barbeiro** antes do início do período. Fórmula: `clientes_recorrentes / clientes_unicos_periodo * 100`.

   **b) Mix de Receita (PieChart Recharts):**
   - 3 fatias: **Serviços Básicos**, **Serviços Extras** (Barba/Sobrancelha/etc.), **Produtos**.
   - Usa cores do design system (`hsl(var(--primary))`, `hsl(var(--success))`, `hsl(var(--accent))`).
   - Mostra valor R$ e % no tooltip e legenda.

   **c) Radar de Habilidades (RadarChart Recharts):**
   - 4 eixos normalizados (0–100) comparando o barbeiro vs **Média da Casa** (média dos barbeiros ativos da organização no mesmo período):
     - Volume de Clientes
     - Venda de Produtos (R$)
     - Venda de Serviços Extras (R$)
     - Faturamento Total (R$)
   - Normalização: cada eixo divide o valor do barbeiro pelo **máximo da casa** naquele eixo × 100, e a "Média da Casa" pela própria média/máximo. Garante leitura comparativa imediata.
   - Duas séries sobrepostas: barbeiro (preenchido em cor primária com opacidade) e Média da Casa (linha tracejada).

   **d) Histórico Recente (tabela):**
   - Últimos **5 dias trabalhados** (com `daily_productions` ou transações no dia), ordem decrescente.
   - Colunas: Data | Faturamento do dia | Clientes | Comissão | Meta diária | **Humor**.
   - **Humor** = badge:
     - Verde "Bateu meta" se `comissão_dia >= meta_diária`
     - Amarelo "Próximo" se `>= 70%`
     - Vermelho "Abaixo" caso contrário
   - Meta diária = `monthly_goals.target_commission / monthly_goals.work_days` para o mês daquele dia.

### Lógica de Dados

**Fonte de verdade — hierarquia obrigatória** (consistente com `recalculate_daily_production_from_transactions` e memória `commission-itemized-truth`):

Para `daily_productions` (agregação por barbeiro/dia):
```
basicTotal   = tx_basic_total > 0 ? tx_basic_total : (manual_basic_total > 0 ? manual_basic_total : services_basic_total ?? 0)
extraTotal   = idem (tx_extra_total → manual_extra_total → services_extra_total)
productsTotal= idem (tx_products_total → manual_products_total → products_total)
clients      = tx_clients_count > 0 ? tx_clients_count : manual_clients_count > 0 ? manual_clients_count : clients_count
commission   = tx_commission_earned > 0 ? tx_commission_earned : commission_earned
```

**Paginação obrigatória** (`.range()` em loop, página de 1000) para evitar truncamento — mesmo padrão já aplicado em `ShopEvolution.tsx` e `UnitsComparison.tsx`.

**Retenção** — query a `sale_transactions` filtrando por `barber_id`:
1. Buscar `mobile_phone` distintos com `created_at` no período → `clientesPeriodo`.
2. Para cada telefone, verificar se existe transação do mesmo `barber_id` com `created_at < inicio_periodo`.
3. `retencao = recorrentes / clientesPeriodo.size * 100`.
4. Telefones nulos/vazios são ignorados na contagem (não distorce numerador nem denominador).

**Média da Casa** (radar) — mesma agregação aplicada para todos os `barbers` ativos da organização do barbeiro selecionado, no mesmo período; tira média dos 4 indicadores e calcula o máximo por eixo para normalização.

**Mix de Receita** — soma `basicTotal`, `extraTotal`, `productsTotal` agregados do período via hierarquia acima.

**Filtro de período → intervalo de datas** (timezone Manaus via `getManausDate`):
- "Mês atual": dia 1 do mês corrente até hoje.
- "Últimos 3 meses": hoje − 90 dias até hoje.
- "Ano": `${year}-01-01` até `${year}-12-31` (ou até hoje se ano corrente).

### Arquivos Afetados

- **`src/components/dashboard/manager/BarberEvolution.tsx`** (refatorar):
  - Adicionar seletor de período.
  - Manter `BarberEvolutionChart` (gráfico anual) intacto.
  - Adicionar componente `BarberDeepAnalysis` logo abaixo, recebendo `barberId` e `period`.
- **Novo: `src/components/dashboard/manager/BarberDeepAnalysis.tsx`**:
  - Encapsula KPIs, PieChart de mix, RadarChart e tabela de histórico.
  - Faz fetches paralelos: produções do barbeiro, produções de toda organização (média da casa), transações para retenção, metas mensais para humor.
  - Usa `Recharts` (`PieChart`, `RadarChart`, `PolarGrid`, `PolarAngleAxis`, `PolarRadiusAxis`, `Radar`).
  - UI com `Card`, `Badge`, `Table` do design system; loading com `Skeleton`.

### Observações
- Tudo em **pt-BR**, fuso **America/Manaus**, formatação `R$ x.xxx,xx`.
- Sem mudanças no banco — apenas leitura. Sem novas RPCs (volume cabe em paginação client-side; se passar de ~5k linhas no período "Ano", podemos migrar para RPC depois).
- Responsivo: cards em grid colapsam para 1 coluna no mobile; gráficos em `ResponsiveContainer` 100%.
- Sem alterar abas vizinhas (Barbearia, Comparativo, Conversão, Recepção, Carteira).