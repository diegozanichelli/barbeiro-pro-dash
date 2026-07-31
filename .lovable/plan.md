## Auditoria dos relatórios — o que está errado

Varri os relatórios do gestor (Relatórios geral, Melhores Dias, Análise Profunda, Assinaturas, Recepção, Resgate, Recorrência, Relatório do Barbeiro, Payroll) e a RPC `get_barber_report_range`. Achados confirmados por leitura de código:

### Críticos (números errados hoje na tela)

1. **Filtro de "legacy_import" escrito errado** — `SubscriptionPerformanceReport.tsx` filtra `subscription_action = "import"`, mas o valor real no banco é `"legacy_import"`. O conjunto de telefones legados sai sempre vazio, ou seja, a exclusão de clientes migrados **não está funcionando** nesse relatório.

2. **Denominador de metas ignora os filtros** — em `ManagerReports.tsx`, "metas batidas" conta apenas os barbeiros da unidade selecionada, mas o total usa **todos os barbeiros da rede**. Ao filtrar uma unidade aparece algo como "3 de 40" em vez de "3 de 8".

3. **Recepção sem filtro de organização** — `ReceptionPerformanceReport.tsx` não filtra `organization_id` em nenhuma query (nem nas unidades). Depende só do RLS; qualquer brecha mistura dados entre contas.

4. **Metas comparadas com período errado** — se o intervalo de datas cruza dois meses, a comissão soma os dois meses mas é comparada só com a meta do **primeiro** mês, inflando "metas batidas".

### Altos (erram silenciosamente quando o volume cresce)

5. **Limite de 1000 linhas do PostgREST sem paginação** em: `ManagerReports.tsx` (comissões, metas, lançamentos diários), `MonthlyPayroll.tsx` (produções e assinaturas), `ReceptionPerformanceReport`, `ManagerRescueReport`, `AutoRecurringReport`, `SubscriptionPerformanceReport`, e no `daily_productions` do `BestSalesDays.tsx`. Passando de 1000 registros o relatório **corta dados sem avisar** — e no caso do ManagerReports os cards (que vêm de RPC) passam a divergir das tabelas da página.

6. **Fuso horário inconsistente entre relatórios** — `BestSalesDays` e os relatórios de assinatura usam offset fixo `-04:00` (correto, Manaus). Já `ManagerReports`, `BarberDeepAnalysis` e `MonthlyPayroll` montam as bordas de data com o fuso do navegador (`toISOString()` / `format`). Vendas perto da meia-noite caem no dia/mês errado e o payroll pode divergir do Relatório do Barbeiro.

### Médios (definições divergentes do mesmo indicador)

7. **"Conversão" significa três coisas diferentes**: na Recepção é `novos / total de vendas`; em `SubscriptionAnalytics` é `adesões de novos / oportunidades`; no relatório de performance é por telefone único válido. A Recepção também **não deduplica por telefone** nem exige telefone válido de 11 dígitos (não usa `isValidOpportunity`), então os mesmos dados geram números diferentes em telas diferentes.

8. **Denominador "% sobre total de adesões"** (Resgate e Recorrência) inclui `legacy_import` e as adesões neutras `auto_recurring`, subestimando a fatia real de cada origem.

9. **Comissão de assinatura ainda vem somada na RPC** — `get_barber_report_range` retorna `totals.commission` incluindo assinaturas; a tela e o PDF corrigem subtraindo depois. Regra deveria estar na origem (`FILTER (WHERE cat <> 'subscription')`).

### Baixos

10. `BarberDeepAnalysis`: se a RPC de médias da casa falhar, os indicadores vitais renderizam **zero** em vez de usar o cálculo local já pronto (falso "tudo desabou").
11. `BarberDeepAnalysis`: bucket morto de `revenue` que soma assinatura junto com operacional — risco de reintroduzir a violação da regra.
12. Contagem de visitas na RPC usa `COUNT(DISTINCT created_at)`; lançamentos em lote no mesmo segundo colapsam em uma visita só.
13. `MonthlyPayroll` não tem filtro de unidade nenhum, diferente do Relatório do Barbeiro.
14. `rawNewAttendances` tem semântica diferente para barbeiro e para a linha Recepção no mesmo relatório.

Confirmado OK: assinaturas **não** vazam para o faturamento operacional em `BestSalesDays` nem nas RPCs de metas; fatias de semana 1-7/8-14/... estão consistentes entre sazonalidade, metas e relatório.

## Plano de correção (ordem sugerida)

**Etapa 1 — corrigir números errados**
- Trocar `"import"` por `"legacy_import"` em `SubscriptionPerformanceReport.tsx` (ou remover o bloco se realmente morto).
- Em `ManagerReports.tsx`: aplicar `selectedUnit`/`selectedBarber` também ao denominador de barbeiros e ao `goalsQuery`; quando o intervalo cruzar meses, somar as metas de todos os meses do intervalo (ou avisar que a comparação é mensal).
- Adicionar `.eq("organization_id", organizationId)` em todas as queries de `ReceptionPerformanceReport.tsx` e nas de `ManagerReports.tsx`.

**Etapa 2 — padronizar fuso e datas**
- Criar helpers únicos em `src/lib/dateUtils.ts` (`manausDayStart(iso)` → `...T00:00:00-04:00`, `manausDayEnd(iso)` → `...T23:59:59.999-04:00`) e usar em `ManagerReports`, `BarberDeepAnalysis`, `MonthlyPayroll`, Recepção. Nada de `toISOString()` sobre `new Date(y,m,d)`.

**Etapa 3 — eliminar o corte de 1000 linhas**
- Criar um helper `fetchAllRows(query)` com paginação por `.range()` e aplicá-lo em todas as queries listadas no item 5; onde o volume for realmente grande (lançamentos diários, transações do mês), migrar a agregação para RPC, conforme a regra do projeto.

**Etapa 4 — unificar definições**
- Centralizar em `src/lib/metricsRules.ts` as funções de oportunidade/adesão/conversão e fazer Recepção, Assinaturas e Analytics consumirem as mesmas; renomear o card da Recepção para "% de adesões de clientes novos" se a métrica for mesmo essa.
- Ajustar o denominador de Resgate/Recorrência para excluir `legacy_import` (e decidir explicitamente se `auto_recurring` entra).
- Migração ajustando `get_barber_report_range` para excluir comissão de assinatura em `totals.commission` e remover a subtração no cliente.

**Etapa 5 — limpezas**
- Fallback local quando a RPC de médias falhar em `BarberDeepAnalysis` + remover o bucket morto que soma assinatura.
- Paginação do `daily_productions` em `BestSalesDays`.
- Avaliar contagem de visitas por comanda (id de produção/comanda) em vez de `created_at` distinto.
- Decidir sobre filtro de unidade no `MonthlyPayroll` e renomear `rawNewAttendances` da linha Recepção.

Posso executar tudo, ou começar só pela Etapa 1 (o que já muda números na tela hoje).
