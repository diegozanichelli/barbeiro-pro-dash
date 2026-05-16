# Expansão da Apresentação Mensal — Novos Slides

Adicionar 10 novos slides ao deck existente (`MonthlyPresentation`), expandindo o RPC `get_monthly_presentation` para entregar todos os dados em uma única chamada.

## Novos slides (ordem proposta)

Inseridos entre os slides atuais para criar uma narrativa de **Visão Geral → Pessoas → Operação → Clientes → Assinaturas → Recordes**:

1. **Evolução Individual** — tabela/cards comparando cada barbeiro: receita, ticket e clientes do mês vs. mês anterior, com % de variação e setas ↑↓. Destaca quem mais cresceu e quem mais caiu.
2. **Heatmap Dia da Semana** — grid Seg–Dom mostrando receita média por dia da semana no mês, com cor proporcional. Identifica os dias mais fortes da unidade.
3. **Comparativo M vs M-1** — 4 cards grandes (Receita, Clientes, Ticket Médio, Comissão) com valor atual, valor anterior e variação %.
4. **Top Serviços & Produtos** — duas colunas: top 5 serviços e top 5 produtos mais vendidos (quantidade + receita).
5. **Penetração de Extras** — % de clientes que levaram pelo menos 1 serviço extra no mês, com gauge visual + comparativo vs. mês anterior.
6. **Ranking de Venda de Produtos** — pódio dos barbeiros que mais venderam produto (R$ + unidades).
7. **Recepção Vendedora** — quanto a recepção (vendas sem `barber_id`) faturou, agrupado por unidade.
8. **Clientes Novos vs. Recorrentes** — donut chart com proporção + número absoluto, comparativo M-1.
9. **Frequência do Mês** — visitas médias por cliente ativo, total de visitas, clientes únicos atendidos.
10. **Top Vendedores de Assinatura** — pódio dos 3 barbeiros que mais converteram novas adesões (qtd + MRR gerado).
11. **Metas: Bateu vs. Não Bateu** — duas colunas (✅ Bateu / ❌ Não Bateu) listando barbeiros do **mês anterior** com % atingido. Reforça accountability.
12. **Recordes do Mês** — 4 destaques: melhor dia da unidade (R$), maior ticket único, maior sequência de dias batendo meta, melhor barbeiro do mês.

## Mudanças técnicas

### 1. Migration — expandir RPC `get_monthly_presentation`

Adicionar ao `jsonb` de retorno:
- `individual_evolution[]` — `{barber_id, name, revenue_curr, revenue_prev, delta_pct, ticket_curr, ticket_prev, clients_curr, clients_prev}`
- `weekday_heatmap[]` — 7 entradas: `{weekday (0-6), avg_revenue, total_revenue, days_count}`
- `month_comparison` — `{revenue, clients, ticket, commission}` cada um com `{current, previous, delta_pct}`
- `top_services[]` (5) — `{name, qty, revenue}`
- `top_products[]` (5) — `{name, qty, revenue}`
- `extras_penetration` — `{clients_with_extra, total_clients, pct_curr, pct_prev}`
- `product_sellers_ranking[]` (3) — `{barber_name, qty, revenue}`
- `reception_sales[]` — agrupado por unidade: `{unit_name, revenue, count}`
- `clients_new_vs_returning` — `{new_curr, returning_curr, new_prev, returning_prev}` (usa flag `is_new_client` em `sale_transactions`)
- `visit_frequency` — `{unique_clients, total_visits, avg_visits_per_client}`
- `top_subscription_sellers[]` (3) — `{barber_name, new_subs_qty, mrr_generated}`
- `previous_month_goals` — `{hit: [{barber, pct}], missed: [{barber, pct}]}` (mês anterior ao selecionado)
- `monthly_records` — `{best_day: {date, revenue}, biggest_ticket: {value, barber, client}, best_streak: {barber, days}, top_barber: {name, revenue}}`

Manter `SECURITY DEFINER`, `STABLE`, `search_path = public`. Reutilizar CTEs do RPC atual quando possível.

### 2. Frontend — novos componentes de slide

Criar em `src/components/dashboard/manager/presentation/slides/`:
- `IndividualEvolutionSlide.tsx`
- `WeekdayHeatmapSlide.tsx`
- `MonthComparisonSlide.tsx`
- `TopServicesProductsSlide.tsx`
- `ExtrasPenetrationSlide.tsx`
- `ProductSellersSlide.tsx`
- `ReceptionSalesSlide.tsx`
- `ClientsNewVsReturningSlide.tsx`
- `VisitFrequencySlide.tsx`
- `TopSubscriptionSellersSlide.tsx`
- `PreviousMonthGoalsSlide.tsx`
- `RecordsSlide.tsx`

Cada slide usa `ScaledSlide` (1920×1080) e tokens semânticos do design system.

### 3. Atualizações

- `useMonthlyPresentationData.ts` — estender types do retorno.
- `MonthlyPresentation.tsx` e `PresentationDeck.tsx` — registrar os 12 novos slides na ordem definida acima (deck passa de 15 → 27 slides).
- `types.ts` do Supabase será regenerado automaticamente após a migration.

## Fora de escopo
- Exportar .pptx (já decidido em rodada anterior).
- Slides adicionais não listados (churn, upgrades de assinatura, top clientes, pódio do campeonato, etc.) — ficam para próxima rodada se você quiser.
- Edição visual dos slides existentes.
