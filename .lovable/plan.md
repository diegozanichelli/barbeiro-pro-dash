## Objetivo

Transformar o componente `BarberDeepAnalysis.tsx` (renderizado dentro de `BarberEvolution.tsx` na aba Evolução do Gerente) em um Dashboard de Mentoria 1-on-1, mantendo Mix de Receita (Pizza), Radar e o gráfico de evolução já existentes, e adicionando duas novas grades superiores: **Métricas Vitais** e **Qualidade de Carteira**, com semáforos visuais Verde/Amarelo/Vermelho.

## O que muda na UI

Nova hierarquia visual do componente, de cima para baixo:

```text
┌─────────────────────────────────────────────────────────────┐
│ MÉTRICAS VITAIS  (4 cards executivos)                       │
│ [Volume] [Ticket Médio] [Retenção/Mix] [Assinaturas]        │
├─────────────────────────────────────────────────────────────┤
│ QUALIDADE DE CARTEIRA  (faixa horizontal)                   │
│  ● Novos vs Recorrentes  ● Cobertura de telefone            │
│  ● Frequência média      ● Semáforo geral                   │
├─────────────────────────────────────────────────────────────┤
│ KPIs originais (Ticket / Clientes / Retenção legados)       │
│ Mix de Receita (Pizza)   |   Radar de Habilidades           │
│ Histórico Recente (tabela 5 dias)                           │
└─────────────────────────────────────────────────────────────┘
```

Cada card vital recebe uma faixa lateral colorida + Progress bar com a cor do semáforo, para leitura rápida durante o feedback do gerente.

## Métricas Vitais (cards superiores)

1. **Volume — Clientes únicos**
   - Conta `mobile_phone` distintos do barbeiro em `sale_transactions` (qualquer `item_type`) no período.
   - Já temos a estrutura parcial via `selectedClients.phones` (hoje só serviços). Vamos ampliar a query para incluir produtos e assinaturas.
   - Semáforo por comparação com a média da casa: ≥110% verde, 80–110% amarelo, <80% vermelho.

2. **Ticket Médio**
   - `faturamento_total / atendimentos_distintos` (mantém definição atual: `created_at` distintos).
   - Comparado com média da casa do mesmo período. Mesmas faixas de semáforo.

3. **Retenção / Mix de Público (Novo vs Recorrente)**
   - Calcula % de atendimentos do barbeiro com `is_new_client = false` vs `true` na tabela `sale_transactions`.
   - Card mostra duas barras empilhadas (Recorrente x Novo) + percentual de recorrentes em destaque.
   - Semáforo: ≥60% recorrente verde, 40–60% amarelo, <40% vermelho.

4. **Assinaturas vendidas**
   - `COUNT(*)` em `sale_transactions` com `item_type = 'subscription'` e `barber_id` no período.
   - Mostra também receita total destas assinaturas (price_sold).
   - Semáforo: ≥média da casa verde, 50–100% amarelo, <50% vermelho.

## Qualidade de Carteira (faixa abaixo)

Mini-cards horizontais com indicadores acessórios derivados dos mesmos dados (zero queries extras):

- **Cobertura de telefone**: % de atendimentos com `mobile_phone` preenchido (reflete higiene de cadastro).
- **Atend./Cliente único**: média de visitas por cliente único no período (frequência).
- **Penetração de produto**: % de atendimentos que incluíram pelo menos um item `product`.

## Mudanças técnicas

Arquivo único alterado: `src/components/dashboard/manager/BarberDeepAnalysis.tsx`.

1. **Expandir a query de `sale_transactions`** (hoje filtrada por `item_type='service'`):
   - Remover o filtro `item_type` e passar a buscar todos os tipos no período, selecionando também `item_type`, `is_new_client`, `price_sold`.
   - Continuar paginando via `fetchPaginated`.

2. **Novos agregados no `fetchAll`** calculados em uma única passada sobre o array:
   - `uniqueClients` (Set de telefones)
   - `newCount` / `returningCount` (por `is_new_client`)
   - `subscriptionCount` e `subscriptionRevenue` (filtrando `item_type==='subscription'`)
   - `productAttendCount` (set de `created_at` que contém produto)
   - `phoneCoverage` (atendimentos com telefone ÷ total)
   - Médias da casa equivalentes (somatório por outros barbeiros, dividido pelo nº de ativos)

3. **Novo estado** `vitalMetrics` e `portfolioQuality` para alimentar os cards.

4. **Helpers**:
   - `getSemaphore(value, houseAvg, thresholds)` → retorna `{ color: 'success'|'warning'|'destructive', label }`.
   - Componente local `<VitalCard>` reaproveitável (ícone, valor, subtítulo, Progress colorida).

5. **UI**:
   - Importar `Progress` de `@/components/ui/progress`.
   - Importar ícones `Sparkles`, `BadgeDollarSign`, `UserCheck`, `Phone` de `lucide-react`.
   - Usar tokens semânticos (`hsl(var(--success))`, `--warning`, `--destructive`) — sem cores hardcoded.

6. **Fallbacks legados**:
   - Se `sale_transactions` retornar 0 linhas para o barbeiro, manter os fallbacks existentes (`daily_productions.clients_count`) para Volume e Ticket; demais cards mostram `—` com tooltip "sem dados itemizados no período".

## Fora de escopo

- Nenhuma mudança em RPC, schema ou outras telas.
- Não mexer no gráfico de evolução mensal em `BarberEvolution.tsx` (faturamento já existente).
- Não alterar a lógica de Retenção legada (telefones já atendidos antes); o novo card "Mix de Público" é complementar, não substitui.
