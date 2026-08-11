# Relatório de Clientes Inativos (30 / 60 / 90 dias)

Novo relatório para o gestor identificar clientes que pararam de voltar, com filtro por unidade e por barbeiro, para acionar resgate.

## O que o gestor vê

Nova aba **Relatórios → Clientes Inativos**, com:

- **Filtros**: unidade (todas / específica), barbeiro (todos / específico), data de referência (padrão: hoje).
- **Três blocos exclusivos** (sem sobreposição), cada um com sua contagem:
  - Inativos 30–59 dias
  - Inativos 60–89 dias
  - Inativos 90+ dias
- **Cards de resumo**: total de clientes inativos, quantos são assinantes, quantos avulsos, valor histórico gasto por faixa.
- **Tabela por faixa**, ordenada por valor gasto (melhores clientes primeiro):

```text
# | Cliente | Telefone | Tipo | Última visita (dias) | Visita anterior | Últ. barbeiro | Últ. unidade | Visitas | Total gasto
```

- **Tipo**: badge "Assinante" ou "Avulso" — assinantes inativos aparecem destacados como prioridade de resgate.
- **Visita anterior**: data da penúltima vinda, entre parênteses, para o barbeiro saber se o cliente já vinha com outro profissional.
- **Filtro por barbeiro = qualquer atendimento no histórico**: o cliente aparece na lista de todo barbeiro que já o atendeu (o mesmo cliente pode aparecer em mais de uma lista, por isso a coluna de visita anterior).
- **Exportação**: botão **PDF** (mesmo padrão visual do Relatório do Barbeiro) e botão **CSV** (telefone + nome + faixa + última visita), para uso em disparo de WhatsApp.

## Regras de cálculo

- Cliente = telefone normalizado (`mobile_phone`); nome vem do cadastro mais recente.
- Última visita = data da venda mais recente do cliente na organização (respeitando os filtros de unidade/barbeiro aplicados).
- Dias de inatividade contados na data de referência, fuso Manaus, em dias puros.
- Clientes que nunca compraram ou sem telefone ficam fora.
- Assinante = cliente com plano de assinatura vigente no cadastro.
- Atendimentos de valor zero (benefício de assinatura) contam como visita — o cliente veio.

## Detalhes técnicos

1. **Nova RPC `get_inactive_clients(p_unit_id, p_barber_id, p_ref_date)`** (security definer, isolada por `organization_id` via `get_user_organization`), agregando `sale_transactions` por `mobile_phone`:
   - última e penúltima data de venda (`max` e segundo `max` por janela),
   - último `barber_id`/`unit_id` atendido,
   - total de visitas (comandas distintas por dia) e total gasto,
   - flag de assinante via join em `clients.subscription_plan_id`,
   - faixa calculada (`30_59`, `60_89`, `90_plus`), retornando só clientes com 30+ dias.
   Agregação no banco evita o limite de 1.000 linhas do PostgREST (padrão já adotado nos outros relatórios).
2. **Grants + RLS**: `GRANT EXECUTE` para `authenticated`; a RPC filtra pela organização do usuário e exige papel de gestor/super admin.
3. **Frontend**:
   - `src/components/dashboard/manager/InactiveClientsReport.tsx` (filtros, cards, três tabelas, badges).
   - `src/lib/inactiveClients.ts` (tipos, formatação, agrupamento, CSV).
   - `src/lib/inactiveClientsPdf.ts` (PDF com `jspdf-autotable`, mesmo estilo do relatório do barbeiro).
   - Reutiliza `BarberCombobox` (com `unitId`) e o padrão de `DateField` do Relatório do Barbeiro.
4. **Navegação**: item `inactive-clients` em `ManagerNavigation.tsx` (grupo Relatórios) + `TabsContent` em `ManagerDashboard.tsx`.
5. Textos em pt-BR, datas em fuso Manaus via `dateUtils`, alvos de toque 44px e tabelas com `overflow-x-auto` para mobile.
