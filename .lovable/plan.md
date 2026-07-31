## Objetivo

Nova aba **Auditoria** no painel do gestor (grupo Relatórios) que lista, por período e unidade, as inconsistências reais dos dados — cada uma com contagem, severidade e link/modal para revisar e corrigir os registros.

## Dados confirmados agora no banco (linha de base)

| Verificação | Resultado hoje |
| --- | --- |
| Clientes com mesmo telefone na mesma organização | 0 |
| Clientes com mesmo nome normalizado na mesma organização | 129 grupos |
| Vendas sem `daily_production_id` (órfãs) | 78 |
| Assinaturas com `commission_amount ≠ 0` | 2.172 (R$ 55.863,59) |
| Adesões novas sem telefone | 6 |
| Produções com `tx_*` divergindo da soma das vendas (últimos 60 dias) | 0 |

Ou seja: o problema real hoje é **duplicidade por nome**, **vendas órfãs**, **comissão gravada em assinatura** e algumas adesões sem telefone. Divergência de agregados não aparece no recorte recente — a checagem entra no painel como monitoramento, não como correção urgente.

## Cards de auditoria (cada um clicável)

1. **Clientes duplicados** — grupos por telefone normalizado e por nome normalizado dentro da organização. Drilldown: lista dos clientes do grupo com nº de visitas, última compra e plano; ação de abrir o `ClientDetailModal` existente para conferir antes de qualquer merge.
2. **Dias sem lançamento** — por barbeiro/unidade no período: dias úteis sem `daily_productions` e sem status de folga/falta/domingo opcional (respeita data de início do barbeiro e feriados da organização, como já faz o alerta de produções faltantes). Drilldown: tabela barbeiro × dia com link para o dia no Ao Vivo.
3. **Assinaturas com comissão gravada** — transações `item_type='subscription'` com `commission_amount ≠ 0`, agrupadas por barbeiro/mês, com o valor total. Regra do projeto é comissão zero em assinatura; o painel expõe o passivo e permite abrir a transação no `TransactionManagerModal` / `SubscriptionAuditModal`.
4. **Vendas órfãs** — vendas com barbeiro e sem produção diária vinculada (78 hoje). Drilldown com barbeiro, data, item e valor.
5. **Adesões sem telefone** — assinaturas novas sem `mobile_phone`, que quebram a contagem de conversão por telefone único.
6. **Produção vs. vendas** — produções cujo `tx_basic+tx_extra+tx_products` não fecha com a soma das vendas do dia (monitoramento; hoje zero).

Cada card mostra: título, contagem, severidade (crítico / atenção / informativo), e um texto curto de "por que isso importa" em pt-BR.

## Detalhes técnicos

- **RPC única** `get_report_audit_findings(p_org uuid, p_start date, p_end date, p_unit uuid default null)` retornando JSON com `{ check_key, severity, count, total_value, sample }`. Agregação no banco conforme a regra do projeto (nada de View, nada de listar >1000 linhas no cliente).
- **RPCs de drilldown** por verificação (`get_audit_duplicate_clients`, `get_audit_missing_days`, `get_audit_subscription_commissions`, `get_audit_orphan_sales`), paginadas, para alimentar os modais sem estourar o limite de 1000 linhas.
- Limites de data via `manausDayStart` / `manausDayEnd` (`src/lib/dateUtils.ts`); dias puros `YYYY-MM-DD` na UI.
- `organization_id` obrigatório em todo filtro; RLS restringindo a gestores da própria organização + super admin.
- Novo componente `src/components/dashboard/manager/ReportsAuditPanel.tsx` + `AuditFindingModal.tsx`, aba registrada em `ManagerNavigation.tsx` e `ManagerDashboard.tsx` (grupo Relatórios).
- Modais seguindo o padrão do projeto: `max-h-[90vh]`, header fixo, corpo com `overflow-y-auto`, toques de 44px.

## Escopo desta etapa

O painel é **diagnóstico + navegação**: ele aponta, explica e leva ao registro. Não faz merge automático de clientes nem zera comissões em massa — correções em lote seriam uma etapa seguinte, depois de você validar os números que o painel mostrar.
