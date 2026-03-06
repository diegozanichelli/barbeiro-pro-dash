

# Plano: Proteções de Dados no QuickSaleModal

## Contexto

O componente `QuickSaleModal.tsx` não utiliza um padrão `handleCustomerCreated` com objeto `newCustomer` — ele usa `clientName` (string) e `mobilePhone` (string) diretamente. Também não há `selectedCustomer` como objeto. Vou adaptar as proteções ao padrão real do código.

## Mudanças

### 1. Validação de dados do cliente antes de prosseguir (`handleCartCheckout` e `handleManualSale`)
- Antes de chamar `registerClientOrThrow`, validar que `clientName.trim().length >= 3` e `phoneSanitized.length === 11`
- Já existe validação parcial — vou reforçar com early return explícito e mensagem clara

### 2. Fallback seguro na exibição do nome do cliente
- Nos locais onde `registeredClient.clientName` é usado em toasts e na construção de transações, adicionar fallback: `registeredClient.clientName || clientName.trim() || "Cliente"`
- No `toast.info` da linha 641, proteger contra `clientName` vazio

### 3. Tratamento de planos vazio
- Na renderização do `Select` de assinatura (linha 1064), envolver com `subscriptionPlans.length > 0` para mostrar mensagem "Nenhum plano cadastrado" quando vazio
- No `selectedSubscriptionPlan` memo (linha 447), já retorna `null` se não encontrar — está seguro
- No `getEffectiveItemPrice`, garantir que `selectedPlanIncludedServiceIds` funciona mesmo com planos vazios (já é array, seguro)

## Arquivo afetado

| Arquivo | Mudança |
|---|---|
| `QuickSaleModal.tsx` | Validação reforçada nos handlers + fallback de nome + guard de planos vazios |

