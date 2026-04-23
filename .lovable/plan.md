

# Alerta preditivo de renovação de assinatura

## Resumo

Mostrar status de vencimento da assinatura **dinamicamente calculado** (último `new`/`renew` + 1 mês) já no momento que a recepção identifica o cliente no PDV, com 3 estados visuais e ação de 1-clique para renovar. Antecipações somam à data original (não "queimam" dias pagos) — fidelização real.

## Como o ciclo será calculado

**Não existe campo de vencimento no banco** (verifiquei `clients` e `sale_transactions`). O ciclo será derivado em tempo real:

1. Buscar a **última transação** do cliente onde `item_type='subscription'` e `subscription_action IN ('new','renew','upgrade')`, filtrando por `mobile_phone` e `organization_id`.
2. `dataInicio = created_at` dessa transação (em fuso `America/Manaus`).
3. `dataVencimento = addMonths(dataInicio, 1)` via `date-fns`.
4. `diffDias = differenceInCalendarDays(dataVencimento, todayManaus)`.

Para **antecipação na renovação**: a nova data-base passa a ser `dataVencimento` (não `today`). Ex: vence 15/05, renova dia 12/05 → próximo vencimento = 15/06. Vencimento já passado (inadimplente) → base = `today`. Isso será calculado no momento do registro, gravado como `description` JSON na transação (`{"cycle_anchor":"2026-05-15"}`) — sem migration. Leitura futura: se houver `cycle_anchor` no `description`, usa ele; senão, usa `created_at`.

## 3 estados visuais (no QuickSaleModal e botão "Renovar Plano" do Live)

| Estado | Condição | UI |
|---|---|---|
| **EM DIA** | `diffDias > 5` | Badge verde discreto: `Assinatura ativa (Próx. 15/05)` — botão renovação normal |
| **RENOVAÇÃO DISPONÍVEL** | `0 ≤ diffDias ≤ 5` | Botão dourado com `animate-pulse-slow`: `Renovar agora (Vence em 3 dias)` |
| **VENCIDO** | `diffDias < 0` | Botão `bg-destructive`: `BLOQUEADO: Vencida em 14/04 — Renovar` (não bloqueia outras vendas, só sinaliza) |

Quando o cliente é identificado por telefone, o status aparece num **banner no topo do step 1** do QuickSaleModal e como **ícone-status** ao lado do botão "Renovar Plano" no LiveDashboard.

## Ação 1-clique "Renovar agora"

Botão único em qualquer estado do banner. Ao clicar:

1. Adiciona o plano atual ao carrinho com `action='renew'` (já existe via `inferSubscriptionAction`).
2. Calcula e armazena `cycle_anchor`:
   - Se `EM DIA` ou `RENOVAÇÃO DISPONÍVEL`: `anchor = dataVencimento` (atual)
   - Se `VENCIDO`: `anchor = todayManaus`
3. Grava no `description` da transação como JSON `{"cycle_anchor":"YYYY-MM-DD","next_due":"YYYY-MM-DD"}`.
4. Toast: `Renovado! Próximo vencimento: 15/06/2026 (mantidos 3 dias do ciclo anterior)`.

## Arquivos afetados

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/lib/subscriptionCycle.ts` *(novo)* | Funções puras: `computeCycleStatus(lastTx, today)`, `computeNextAnchor(currentAnchor, today, status)`. Retorna `{status, dueDate, daysLeft, label, variant}`. Usa `date-fns` + `date-fns-tz` (`TIMEZONE='America/Manaus'`). |
| 2 | `src/hooks/useSubscriptionCycle.ts` *(novo)* | Hook que recebe `mobile_phone + organizationId`, busca a última transação `subscription` (`new`/`renew`/`upgrade`) ordenada por `created_at desc limit 1`, parseia `description` para `cycle_anchor` quando presente, e devolve o objeto de status. |
| 3 | `src/components/dashboard/manager/SubscriptionCycleBanner.tsx` *(novo)* | Banner visual reutilizável com os 3 estados + botão "Renovar agora". Props: `status`, `onRenew`. Usa `bg-emerald-500/10`, `bg-amber-500/15 animate-pulse-slow`, `bg-destructive/15`. |
| 4 | `src/components/dashboard/manager/QuickSaleModal.tsx` | Após `autoDetectSubscription`, chamar `useSubscriptionCycle`; renderizar `SubscriptionCycleBanner` no step 1 quando o cliente tem assinatura. Botão "Renovar agora" injeta o plano no carrinho + grava `cycle_anchor` no `description`. |
| 5 | `src/components/dashboard/manager/LiveDashboard.tsx` | (opcional, mínimo) — nada novo aqui; o banner já cobre o fluxo principal via PDV. |

## Lógica do cycle_anchor (sem migration, zero risco)

- `description` da `sale_transactions` já existe como `text` nullable. Vamos gravar JSON simples lá.
- Função utilitária `parseCycleAnchor(description)` → tenta `JSON.parse`, retorna `null` em qualquer erro.
- Backwards-compatible: transações antigas sem `cycle_anchor` usam `created_at` como base.

## Impacto / risco

- **Zero migration**, zero schema, zero RPC nova.
- Cálculo 100% no frontend a partir de dados que já existem.
- A política de antecipação (não queima dias) fica **transparente para o cliente** via toast.
- Reutiliza `inferSubscriptionAction`, `useClientHistory` e o fluxo atual do PDV — nenhuma regra de comissão/relatório muda.
- Os 3 relatórios de assinaturas (Conversão, Recepção, Carteira) continuam idênticos: o `cycle_anchor` é apenas metadado.

## Detalhes técnicos relevantes

- Fuso: `formatInTimeZone(date, 'America/Manaus', 'yyyy-MM-dd')` para todas as comparações de data pura.
- `addMonths` lida automaticamente com meses curtos (31/01 + 1 mês = 28/02 ou 29/02).
- Hook usa cache via `useMemo` por telefone para evitar refetch ao trocar abas do modal.
- Se a busca falhar (sem internet/sem permissão), banner não aparece (degradação graciosa).

