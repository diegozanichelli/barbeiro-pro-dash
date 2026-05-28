## Causa

Em `SubscriptionPerformanceReport.tsx` (linha 941), o `SubscriptionWizardModal` do fluxo "Dar baixa legado" é aberto com `startStep="attribution"`, pulando direto para o Passo 2 (Atribuição de Pontos). O usuário precisa começar no Passo 1 para selecionar o tipo de cliente e o plano vendido.

## Mudança

**Arquivo:** `src/components/dashboard/manager/SubscriptionPerformanceReport.tsx` (linha ~941)

Remover a prop `startStep="attribution"` da instância do `SubscriptionWizardModal` usada na regularização legado. Com isso o wizard usa o default (`"client_type"`) e abre no Passo 1.

Os prefills (`prefillPhone`, `prefillName`, `prefillAction="legacy_import"`, `prefillIsNewClient={false}`, `prefillAttributionType="barber"`, `prefillBarberId`, `prefillUnitId`) permanecem intactos — o gestor avança normalmente pelos 3 passos e escolhe o plano no Passo 3 (Detalhes).

## Fora de escopo
- Não mexer na lógica interna do wizard nem em outros pontos de entrada.
- Não alterar a ordem dos passos do wizard.
