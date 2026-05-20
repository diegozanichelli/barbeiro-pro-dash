## Objetivo

Na aba **Gestão → Clientes**, permitir que o gestor resolva inadimplentes direto do card — sem precisar abrir o POS — registrando o pagamento que já entrou no sistema externo (Stripe/maquininha), com data retroativa do pagamento real.

## O que muda na UI

No card de cada cliente com plano (especialmente quando o filtro **Inadimplentes >30d** está ativo, mas também disponível em qualquer card de assinante), aparece um botão de ação rápida no lado direito:

```text
[ João Silva  👑 Plano Gold  ⚠ 45d sem pagar ]   [ Registrar pagamento ▾ ]
[ (11) 99999-0000 · Desde 02/24 ]
```

O botão abre um pop-over com 3 opções, conforme o estado do cliente:

1. **Renovar plano atual** — quando o cliente já tem `subscription_plan_id` e o plano ainda existe ativo. Pré-seleciona ação `renew` e o plano atual.
2. **Reativar assinatura** — quando o cliente está sem plano (`subscription_plan_id = null`) ou o plano antigo foi desativado. Pede para escolher um plano e usa ação `new`.
3. **Trocar de plano (upgrade/downgrade)** — abre o wizard completo deixando o gestor escolher o novo plano; o sistema decide `upgrade` ou `downgrade` pelo preço.

Cada opção abre o **SubscriptionWizardModal já existente**, pré-preenchido:

- Telefone e nome do cliente travados (vindo do registro)
- `isNewClient = false` (cliente recorrente)
- `subscriptionAction` definido pela opção escolhida
- `selectedPlanId` definido quando aplicável
- Avança automaticamente para a etapa **Atribuição** (recepção/barbeiro) — o gestor decide quem leva o crédito da renovação.

## Data retroativa do pagamento

Hoje o `SubscriptionWizardModal` aceita uma prop `selectedDate` mas só é usada via POS. Vamos:

- Adicionar no passo final do wizard (**Detalhes**) um campo **"Data do pagamento"** opcional, com Date Picker, default = hoje, limitado a hoje no máximo e ~90 dias no passado no mínimo.
- Quando preenchida, sobrescreve `selectedDate` e o registro vira retroativo (mesmo fluxo já usado no POS retroativo — RPC `create_sale_and_ensure_production` já trata isso corretamente).
- Aviso visual em âmbar: "Pagamento será lançado em DD/MM/AAAA — confira antes de salvar."

Esse campo fica visível para **todas** as entradas do wizard (não só pelo botão de Clientes), porque resolve o mesmo problema em outros pontos.

## Atualização imediata pós-pagamento

Depois que o wizard chama `onComplete()`, o `ClientsManagement` re-executa o fetch de `sale_transactions`, o `lastSubByPhone` é atualizado e:

- O badge "45d sem pagar" desaparece automaticamente.
- A contagem da pílula **Inadimplentes >30d** diminui.
- Se o cliente estava sem plano, o `subscription_plan_id` da tabela `clients` é atualizado pela própria RPC (já é o comportamento atual do wizard).

## Detalhes técnicos

Arquivos:

- **`src/components/dashboard/manager/ClientsManagement.tsx`**
  - Adicionar action button por card (com `stopPropagation` no clique para não abrir o modal de detalhe).
  - Pop-over (`@/components/ui/popover` ou `dropdown-menu` já no projeto) com as 3 opções.
  - Novo state: `wizardOpen`, `wizardPrefill: { phone, name, action, planId? }`.
  - Renderiza `<SubscriptionWizardModal>` controlado, passando `onComplete={() => { setWizardOpen(false); fetchData(); }}`.

- **`src/components/dashboard/manager/SubscriptionWizardModal.tsx`**
  - Adicionar props opcionais: `prefillPhone`, `prefillName`, `prefillAction`, `prefillPlanId`, `prefillIsNewClient`, `startStep` (para pular client_type quando vier pré-preenchido).
  - Aplicar pré-preenchimento num `useEffect([open])` e setar `step` inicial conforme `startStep` (default mantém `client_type`).
  - Adicionar input **Data do pagamento** no passo `details` (Date Picker), persistido em state local `paymentDate`. No submit, se preenchida, usar `paymentDate` no lugar de `selectedDate` ao montar payload da RPC.
  - Limitar range: `min = subDays(today, 90)`, `max = today`.

Sem alteração de schema. A RPC `create_sale_and_ensure_production` já aceita data customizada e cria o `daily_production` correspondente, então o backfill retroativo funciona out-of-the-box.

## Segurança e multi-tenant

- Toda a operação reusa o wizard existente, que já é escopado por `organization_id` via `useOrganization` e RLS de manager.
- Janela máxima de 90 dias de retroação evita lançamentos errados em períodos muito antigos.
- Sem mudança em RLS, schema ou Edge Function.

## Fora de escopo

- Integração automática com Stripe/maquininha (continua manual — esse fluxo só facilita o lançamento manual).
- Conciliação automática de pagamentos passados (não vamos varrer Stripe).
- Notificação WhatsApp ao cliente após renovação (pode ser próximo passo).
