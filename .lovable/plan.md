## Objetivo

Hoje a meta diária do barbeiro é redistribuída de forma linear (meta restante ÷ dias restantes). Vamos passar a redistribuir respeitando a **sazonalidade semanal da unidade**: semanas historicamente mais fortes "puxam" mais meta, semanas mais fracas exigem menos por dia.

Escopo confirmado:
- Pesos calculados **por unidade** (todos barbeiros da unidade compartilham a mesma curva).
- Fonte histórica **configurável pelo gestor** por unidade.
- Aplicação apenas no **DailyGoalsTracking** (meta diária do barbeiro). Alertas, Ao Vivo e Apresentação seguem como estão por enquanto.
- Semanas que cruzam o mês contam só os dias dentro do mês.

## Como o peso é calculado

Para cada unidade, computamos a receita histórica de cada uma das 5 "fatias semanais" do mês (semana 1 = dias 1-7, 2 = 8-14, 3 = 15-21, 4 = 22-28, 5 = 29-fim). Cada fatia recebe um peso = receita da fatia ÷ receita total do período histórico.

Fontes selecionáveis pelo gestor (por unidade):
1. Mesmo mês do ano anterior
2. Últimos 3 meses (média móvel)
3. Combinado (ano anterior + ajuste dos últimos 30 dias)
4. Linear (desliga sazonalidade — comportamento atual)

Padrão para unidades sem histórico suficiente: cai automaticamente para linear.

## Como a meta diária passa a ser calculada

Hoje:
```
meta_dia = (meta_total - já_realizado) / dias_restantes
```

Novo:
```
1. peso_semana[1..5] vindo da unidade do barbeiro
2. meta_esperada_semana_i = meta_total × peso_semana_i × (dias_da_semana_dentro_do_mês / 7)
3. já_realizado_semana_i = soma do que o barbeiro fez naquela fatia
4. meta_restante_semana_atual = max(0, meta_esperada_semana_atual − já_realizado_semana_atual)
5. meta_dia = meta_restante_semana_atual / dias_restantes_dentro_da_semana_atual_e_do_mês
6. se a semana atual já bateu, sobra é redistribuída para as semanas seguintes proporcional aos pesos restantes
```

Feriados configurados continuam excluídos do divisor (regra atual mantida).

## Mudanças necessárias

### Banco (1 migração)

1. Tabela nova `unit_seasonality_config`:
   - `unit_id` (FK units, unique)
   - `source`: enum `linear | previous_year | trailing_3m | combined`
   - `updated_by`, timestamps
   - RLS: manager/super_admin da org da unidade lê/escreve; GRANTs padrão.

2. RPC `get_unit_weekly_weights(p_unit_id uuid, p_month int, p_year int)`:
   - SECURITY DEFINER, retorna `jsonb` com `{weights: [w1..w5], source_used, has_history}`.
   - Lê `sale_transactions` da unidade no período histórico definido pela config.
   - Fallback automático para linear quando receita histórica < limiar mínimo (ex.: R$ 5k) ou sem dados.

3. RPC `get_barber_daily_goal_seasonal(p_barber_id, p_month, p_year, p_reference_date)`:
   - Aplica a fórmula acima usando os pesos da unidade do barbeiro.
   - Retorna `{ meta_dia, meta_esperada_semana, realizado_semana, peso_semana, source_used }` para a UI mostrar contexto.

### Frontend

1. `src/components/dashboard/manager/GoalsManagement.tsx` (ou novo subcomponente `UnitSeasonalityCard.tsx`): bloco "Sazonalidade semanal" por unidade — select de fonte + preview dos 5 pesos calculados e badge "sem histórico → usando linear".

2. `src/components/dashboard/manager/DailyGoalsTracking.tsx`: trocar o cálculo linear pelo RPC novo; exibir, ao lado da meta diária, um chip discreto "Semana X · peso 28%" para o gestor entender a redistribuição.

3. `src/hooks/` novo `useUnitSeasonality.ts` para buscar/cachear pesos por unidade+mês.

## Fora de escopo (confirmado)

- Alertas de pacing (<85%), Painel Ao Vivo e Apresentação mensal continuam com a lógica atual. Posso estender depois se quiser.
- Peso por barbeiro individual (ficou descartado em favor de "por unidade").
