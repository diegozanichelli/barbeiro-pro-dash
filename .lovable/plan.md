
# Apresentação Mensal — Reunião de Alta Performance

Botão novo na aba Relatórios que abre um seletor de mês e, em seguida, dispara um deck em tela cheia (1920×1080 escalado) com todos os números do mês, pronto para projetar na reunião do time. Os dados são puxados ao vivo do banco — nada de PowerPoint estático.

## Onde fica

- Novo item no grupo **Relatórios** do menu lateral: **"Apresentação Mensal"** (ícone Presentation).
- Página dedicada com:
  - Título + descrição do propósito
  - Seletor de mês (padrão: mês atual)
  - Seletor de unidade (todas / unidade específica)
  - Card de cada slide com preview pequeno
  - Botão grande **"▶ Iniciar Apresentação"** que entra em fullscreen

## Fluxo de uso

```text
Relatórios → Apresentação Mensal
        │
        ▼
  [Mês: Maio/2026 ▼]  [Unidade: Todas ▼]
        │
        ▼
  Preview dos 14 slides
        │
        ▼
  [▶ Iniciar Apresentação] → fullscreen
        │
        ▼
  Setas ← → / Espaço navegam, Esc sai
```

## Slides do deck (na ordem certa pra reunião)

Cada slide é uma "página" de 1920×1080 escalada pra caber no projetor, com tipografia grande, animação suave de entrada, dados ao vivo do mês escolhido.

1. **Capa** — Logo da org + "Reunião de Resultados • Maio/2026" + data da reunião
2. **Resumo executivo** — 4 KPIs gigantes: Faturamento, Comissão paga, Clientes atendidos, Ticket médio (com variação % vs mês anterior)
3. **Metas batidas** — X de Y barbeiros bateram meta, barra de progresso, lista dos campeões
4. **Ranking geral de barbeiros** — Top 10 por faturamento (com unidade e %meta)
5. **Performance por unidade** — Card por unidade: faturamento, clientes, ticket médio, %meta consolidada
6. **Clientes novos** — Total no mês, gráfico de barras por unidade, comparação com mês anterior
7. **Conversão de novos em assinantes** — Funil: novos clientes → novas adesões → taxa % (com semáforo Elite/Regular/Crítico)
8. **Assinaturas — saúde do MRR** — Novas adesões, renovações, upgrades, downgrades, delta de MRR, top motivos de downgrade
9. **Ticket médio por unidade** — Comparativo + evolução semana a semana
10. **Mix de receita** — Cortes básicos × extras × produtos (donut + valores)
11. **Top 3 vendedores de extras e produtos** — Pódio com nome, qtd e R$
12. **Dia mais forte do mês** — Data, faturamento, clientes, quem brilhou
13. **Aprendizados & alertas** — Lista automática: barbeiros abaixo de 85% pacing, unidades com queda vs mês anterior, downgrades acima do normal
14. **Próximos passos** — Slide editável com 3 bullets em branco que o gestor preenche antes da reunião (salvos por mês, em localStorage)
15. **Encerramento** — "Vamos pra cima! 🚀" + KPI alvo do próximo mês (puxado das metas configuradas)

## Detalhes técnicos

### Novos arquivos

- `src/components/dashboard/manager/presentation/MonthlyPresentation.tsx` — página com seletor + grade de previews + botão "Iniciar"
- `src/components/dashboard/manager/presentation/PresentationDeck.tsx` — controlador fullscreen (Fullscreen API, setas, Esc, contador "3 / 15")
- `src/components/dashboard/manager/presentation/ScaledSlide.tsx` — wrapper 1920×1080 com `transform: scale()` (mesmo padrão da skill de slides)
- `src/components/dashboard/manager/presentation/slides/` — um arquivo por slide (`CoverSlide.tsx`, `KpiSlide.tsx`, `RankingSlide.tsx`, etc.)
- `src/hooks/useMonthlyPresentationData.ts` — agrega tudo num único objeto consumido pelos slides

### RPC nova (uma só, server-side, evita 15 round-trips)

`get_monthly_presentation(p_month int, p_year int, p_unit_id uuid default null)` retornando `jsonb` com:
- `kpis` (atual + mês anterior)
- `goals_hit` (lista + total)
- `barber_ranking` (top 10 com unit, revenue, % meta)
- `units_performance` (array por unidade)
- `new_clients` (total + por unidade + mês anterior)
- `subscription_funnel` (reaproveita `get_subscription_intelligence`)
- `subscription_health` (counts/revenue/MRR delta/downgrade reasons)
- `revenue_mix` (basic/extra/products)
- `top_extras_sellers`, `top_products_sellers`
- `best_day` (data + métricas + barbeiro destaque)
- `alerts` (barbeiros < 85% pacing, unidades em queda)
- `next_month_target` (soma das metas configuradas)

Tudo respeitando `get_user_organization(auth.uid())` e o filtro opcional de `p_unit_id`. `SECURITY DEFINER`, `STABLE`, `search_path = public`.

### Slide notes do gestor (slide 14)

Persistência em `localStorage` com chave `mtg-notes:{orgId}:{yyyy-mm}:{unitId|all}`. Sem alteração de schema. Se um dia quiser sincronizar entre dispositivos, vira tabela `meeting_notes` — fora de escopo agora.

### Estilo

- Reaproveita tokens do design system (`--primary`, `--accent`, `--success`, `--destructive`, `--gradient-card`)
- Tipografia grande (escala 1.25x dentro de `.slide-content`, piso 20px)
- Fundo escuro premium nos slides (combina com projetor em sala fechada)
- Animação de entrada por slide (fade + slide-up suave, ~300ms)
- Charts: Recharts já está no projeto (ver Evolution) — `BarChart`, `PieChart`, `LineChart`

### Atalhos de teclado no modo apresentação

- `→` / `Espaço` / `PageDown` → próximo
- `←` / `PageUp` → anterior
- `Home` / `End` → primeiro / último
- `Esc` → sai do fullscreen
- `G` → painel com grade de slides (clica e pula)

### Acessibilidade & robustez

- Botão "Sair" visível no canto se Fullscreen API falhar (Safari iOS)
- Loading state enquanto a RPC roda; erro com retry
- Indicador "M / N" e barra de progresso fina no rodapé
- Cursor some após 3s de inatividade no modo fullscreen

## Fora de escopo agora

- Export para .pptx (você pode pedir depois — fica fácil porque cada slide já está isolado)
- Anotações sincronizadas entre dispositivos
- Compartilhar via link público
- Comparativo trimestral / anual (só mensal por enquanto)
