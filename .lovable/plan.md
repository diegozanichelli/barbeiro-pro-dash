## Objetivo

Permitir que o gestor rode a Apresentação Mensal em **qualquer recorte de período** (semanal, quinzenal, MTD, mês fechado ou intervalo livre), com **metas proporcionais por dias úteis** e comparativo contra o mesmo intervalo do mês anterior.

## 1. Seletor de período (UI)

Substituir o seletor atual (Mês + Ano) por um seletor de modo:

- **Mês fechado** (padrão atual — comportamento idêntico ao de hoje)
- **Mês até hoje (MTD)** — dia 1 do mês atual até hoje
- **Quinzenal** — escolher mês + 1ª quinzena (1-15) ou 2ª quinzena (16-fim)
- **Período personalizado** — date range picker livre (semana, 10 dias, etc.)

Cada modo resolve para um par `period_start` / `period_end` (datas puras `YYYY-MM-DD` em Manaus). O título da capa e rodapés mostram o intervalo escolhido ("01–19 de Maio/2026 · 19 dias").

## 2. Comparativo (período anterior)

Regra única: **mesmo nº de dias imediatamente anteriores** ao `period_start`.

- Mês fechado de Maio → comparado com Abril inteiro (mantém comportamento).
- MTD 01–19/05 → comparado com 01–19/04.
- 2ª quinzena de Maio (16–31) → comparado com 16–30/04.
- Custom 05–11/05 (7 dias) → comparado com 28/04–04/05.

## 3. Meta proporcional (dias úteis)

Para qualquer recorte ≠ mês fechado:

```text
meta_periodo = meta_mensal × (dias_úteis_no_período ÷ dias_úteis_totais_do_mês)
```

- `dias_úteis` exclui feriados de `organization_holidays` (já existe a infra).
- Aplicado a meta de comissão por barbeiro, meta de unidade e meta agregada.
- KPIs de "% da meta", "ranking vs meta", "bateu meta vs não bateu", "alertas de pacing" e closing slide usam essa meta proporcional.
- Banner discreto no slide de Metas explicando: "Meta proporcional a X dias úteis do período (Y% do mês)".

## 4. Backend — RPC

Substituir/estender `get_monthly_presentation(p_month, p_year, p_unit_id)` por nova assinatura:

```sql
get_presentation_data(
  p_period_start date,
  p_period_end   date,
  p_unit_id      uuid,
  p_compare_start date,  -- calculado no front
  p_compare_end   date,
  p_target_ratio  numeric -- dias_úteis_periodo / dias_úteis_mes
)
```

- Todas as agregações (KPIs, ranking, evolução individual, mix, top serviços/produtos, recepção, assinaturas, recordes, heatmap, frequência, new vs returning) passam a filtrar por `created_at` no range em vez de `month/year`.
- Heatmap de dia da semana e "recorde do mês" continuam funcionando (são agregações por data).
- `previous_month_goals` vira `previous_period_goals` usando a mesma lógica de meta proporcional aplicada ao período anterior.
- Manter a RPC antiga como wrapper para não quebrar nada (chama a nova com mês fechado).

## 5. Frontend — alterações

- `MonthlyPresentation.tsx`: novo seletor com modos (Tabs) + DatePicker para custom + lógica que resolve `{period_start, period_end, compare_start, compare_end, target_ratio}`.
- `useMonthlyPresentationData`: aceita o novo input e chama a nova RPC.
- `slideHelpers.ts`: utilidade `formatPeriodLabel(start, end)` para títulos/rodapés ("Semana 12–18 Mai", "1ª Quinzena de Maio", "Mês de Maio", etc.).
- `CoverSlide`, `ClosingSlide`, `GoalsSlide`, `MonthComparisonSlide`, `PreviousMonthGoalsSlide`: usar o label do período em vez de "Maio/2026" fixo.
- Overrides (`presentation_slide_overrides`): chave passa a incluir `period_start`+`period_end`+`unit_key` (migração leve — campo `slide_key` continua, adicionamos colunas opcionais `period_start` / `period_end`; registros antigos por mês continuam acessíveis quando o modo for "mês fechado").

## 6. Slides afetados

Todos continuam existindo. Mudanças de texto/contexto:

- **Capa**: subtítulo dinâmico ("Reunião quinzenal · 01–15 Mai/2026 · 13 dias úteis").
- **KPIs / Ranking / Unidades / Metas / Closing**: meta proporcional + chip "Período: X dias úteis (Y% do mês)".
- **Comparativo M vs M-1**: vira "Período atual vs período anterior equivalente".
- **Recordes / Heatmap**: rodapé deixa claro o intervalo coberto.

## Detalhes técnicos

- Cálculo de dias úteis reaproveita `calculateRemainingWorkDays` (generalizar para aceitar range arbitrário e lista de feriados).
- Datas sempre tratadas como `date` puro em Manaus para evitar bugs de rollover (regra Core já existente).
- Migração SQL: nova função `get_presentation_data` + 2 colunas em `presentation_slide_overrides` (`period_start date null`, `period_end date null`) + índice composto.
- Compatibilidade: se gestor abrir um override antigo salvo por "mês fechado", continua resolvendo.

## Fora do escopo

- Salvar "tipos de reunião favoritos" do gestor.
- Reuniões recorrentes agendadas.
- Comparativos contra "mesma semana do ano passado".
