

# Plano: Adicionar opção "Nova Assinatura" para clientes da casa

## Problema
Quando o gestor seleciona "Já é Cliente" (cliente da casa que corta avulso), as únicas ações disponíveis são Renovação, Upgrade e Downgrade. Falta a opção "Nova Assinatura" para clientes que nunca tiveram plano e decidem assinar pela primeira vez.

## Mudança em `src/components/dashboard/manager/SubscriptionWizardModal.tsx`

### 1. Adicionar botão "Nova" no grid de ações (linhas 618-660)
- Mudar o grid de `grid-cols-3` para `grid-cols-4`
- Adicionar um botão "Nova" com `subscriptionAction === "new"` antes de Renovação
- Usar ícone `Crown` ou `Plus` para representar primeira assinatura
- Label: "Nova" / sublabel: "1ª assinatura"

### 2. Lógica existente já suporta
- O tipo `SubscriptionAction` já inclui `"new"` (linha 80)
- O `handleSubmit` já trata `action === "new"` no `actionLabel` (linha 335)
- O `canProceed` já valida corretamente para qualquer `subscriptionAction !== null`
- Nenhuma mudança de lógica necessária, apenas UI

