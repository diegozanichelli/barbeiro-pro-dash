
## Contexto

Hoje o wizard de assinatura tem 3 atribuições: **Recepção**, **Barbeiro** e **Gestor (recuperação)**. Faltou uma situação real: renovações que o cliente paga **automaticamente** via cobrança recorrente no cartão (sistema paralelo). Isso **não é mérito de ninguém** — nem do barbeiro, nem do caixa, nem é falha operacional do gestor. Hoje, o gestor é obrigado a marcar como "Recuperação", o que infla incorretamente o relatório de falhas operacionais.

## Solução

Criar uma nova atribuição **"Cobrança automática"** (`auto_recurring`) com semântica neutra:
- Não pontua barbeiro nem recepção (zero pontos no Campeonato).
- **Não conta como falha operacional** (fica fora do relatório "Recuperações do Gestor").
- Aparece em um bloco próprio "Renovações automáticas (recorrência cartão)" nos relatórios, apenas como MRR sustentado pelo sistema.
- Disponível só para ações `renew` ou `upgrade` (não faz sentido para `new`, já que toda nova adesão exige toque humano).

## Mudanças

### 1. Banco
- Migração: adicionar índice parcial `idx_sale_transactions_auto_recurring` em `sale_transactions (organization_id, created_at) WHERE attribution_source = 'auto_recurring'`.
- Sem CHECK constraint nova (o campo já é `text` livre); validação fica no frontend.

### 2. Wizard (`SubscriptionWizardModal.tsx`)
- Estender o tipo `attributionType` para incluir `"auto_recurring"`.
- Mudar o grid de atribuição de 3 colunas para **2x2** (4 botões):
  - Recepção · Barbeiro · Gestor (recuperação) · **Cobrança automática** (novo, ícone `CreditCard`/`Repeat`, cor neutra)
- Quando `auto_recurring` selecionado:
  - Exigir seleção de **unidade** (mesma UI da recepção/gestor).
  - Banner azul informativo: "Renovação cobrada automaticamente pelo gateway de cartão. Nenhum ponto será atribuído e não conta como falha operacional."
  - Esconder/desabilitar o botão se `subscriptionAction === "new"` (com tooltip explicando).
- No resumo (step 3): "Pontos para: 💳 Cobrança automática (sem pontuação)".

### 3. Relatórios
- **`ManagerRescueReport.tsx`**: já filtra por `attribution_source = 'manager_rescue'`, então nada vaza para lá. Confirmado.
- Criar **`AutoRecurringReport.tsx`** análogo, mas com tom neutro/positivo (sem badge "falha operacional"):
  - KPIs: nº de cobranças automáticas, MRR sustentado, % do total de renovações.
  - Tabela por unidade.
  - Modal "Ver detalhes" com lista de transações.
- Plugar no `ManagerReports.tsx` ao lado do `ManagerRescueReport`.

### 4. Memória
- Atualizar `mem://features/manager-rescue-attribution` para refletir as **4 atribuições** e a regra "auto_recurring ≠ falha operacional".

## Detalhes técnicos

- `attributionType` type union: `"reception" | "barber" | "manager_rescue" | "auto_recurring" | null`.
- Submit (`handleSubmit`): quando `auto_recurring`, enviar `attribution_source: 'auto_recurring'`, `barber_id: null`, `unit_id: selectedUnitId`, sem chamada de pontuação no Campeonato (mesmo fluxo do `manager_rescue`).
- Validação `canProceed` no step de atribuição: `auto_recurring` exige `selectedUnitId` (igual rescue).
- Guarda no step de ação: se selecionar `auto_recurring`, forçar `subscriptionAction` a `renew` por padrão e bloquear `new`.

## Fora de escopo

- Integração automática com o gateway externo de recorrência (importação de webhooks). Por ora, o gestor lança manualmente quando vê o pagamento entrar no sistema paralelo.
