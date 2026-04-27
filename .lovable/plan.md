
## Diagnóstico — Ageu Felipe, abril/2026

Resultados reais do banco para o período `01/04 → 27/04` (Manaus):

| Métrica | Valor |
|---|---|
| `daily_productions.clients_count` (somatório) | **66** ← é o que o relatório mostra hoje |
| `tx_clients_count` (somatório) | 66 |
| `manual_clients_count` (somatório) | 13 |
| Transações de serviço (`sale_transactions`) | **110** |
| Atendimentos distintos por `created_at` | **68** |
| Telefones distintos | 54 |

**O outro sistema mostra ~110 porque conta a quantidade de serviços vendidos (linhas em `sale_transactions` com `item_type='service'`)**. O nosso `BarberDeepAnalysis` (e a maioria dos relatórios) lê o campo agregado `clients_count` da `daily_productions`, que armazena **clientes únicos no dia** (ex.: dia 06/04 → 12 serviços, 7 atendimentos distintos, mas `clients_count = 8`; dia 25/04 → 10 serviços, 6 visitas distintas, `clients_count = 7`).

Ou seja, **não há perda de dados** — são duas métricas diferentes:

- **66 = clientes únicos atendidos no mês** (cada cliente conta 1× por dia).
- **110 = atendimentos / serviços vendidos** (mais próximo do que o outro sistema chama de "clientes atendidos").
- **68 = visitas distintas** (cada `created_at` único conta como 1 atendimento, regra já adotada no `LiveDashboard` — ver memória `client-visit-counting-logic`).

A diferença entre 66 e 68 vem de dias em que o gestor lançou um número manual de clientes maior que o nº de visitas itemizadas (ex.: dia 06/04 marca 8, mas só há 7 timestamps distintos).

## O que vou ajustar

### 1. `BarberDeepAnalysis.tsx` — KPI "Clientes Atendidos"

Trocar a fonte do número e adicionar transparência:

- **Número principal**: passa a ser **atendimentos distintos** contados via `sale_transactions` (regra `COUNT DISTINCT created_at` por `barber_id`+`item_type='service'` no período), batendo com o padrão do "Ao Vivo".
- **Linha secundária do card**: mostrar também:
  - `Serviços vendidos: 110` (total de linhas `item_type='service'`)
  - `Clientes únicos: 54` (telefones distintos no período)
- **Ticket médio**: continua `receita ÷ atendimentos`, mas usando o novo número (atendimentos distintos), que é a definição correta de ticket por atendimento.

### 2. Radar de Habilidades (eixo "Clientes")

O eixo Clientes do barbeiro e a média da casa passam a usar a mesma métrica nova (atendimentos distintos via `sale_transactions`), garantindo que a comparação seja consistente entre todos os barbeiros.

### 3. Histórico Recente (tabela últimos 5 dias)

A coluna "Clientes" passa a mostrar **atendimentos distintos do dia** (vindos de `sale_transactions`), com tooltip indicando "X serviços vendidos" para o gestor enxergar as duas leituras.

### 4. Sem mudanças na hierarquia de receita

A lógica `tx_* > manual_* > legacy` para faturamento (básico/extra/produtos) continua igual — só a métrica de clientes está sendo ajustada.

## Detalhes técnicos

- Adicionar uma query paginada extra em `BarberDeepAnalysis` sobre `sale_transactions` filtrando `organization_id`, `barber_id`, `item_type='service'`, intervalo `created_at`, retornando `created_at`, `mobile_phone`, `daily_production_id`. A partir dela calcula-se: `serviçosVendidos`, `atendimentosDistintos = new Set(created_at).size`, `clientesUnicos = new Set(telefonesNormalizados).size`, e por dia para o Histórico Recente.
- A média/máximo da casa para o eixo "Clientes" do radar passa a ser computada agregando `atendimentos distintos` por `barber_id` a partir dessa mesma query (já filtrada por organização).
- Se `sale_transactions` não tiver dados num dia (legado), faz fallback para `clients_count` da `daily_productions` (mantém compatibilidade com produções antigas — memória `legacy-production-fallback-display`).

## Resultado esperado para o Ageu (mês atual)

| Card | Antes | Depois |
|---|---|---|
| Clientes Atendidos (número grande) | 66 | **68** (atendimentos distintos) |
| Linha auxiliar | — | "110 serviços · 54 clientes únicos" |
| Ticket Médio | receita ÷ 66 | receita ÷ 68 |

Isso alinha o relatório à mesma definição usada pelo outro sistema (110 serviços) **e** mantém transparência sobre clientes únicos reais.
