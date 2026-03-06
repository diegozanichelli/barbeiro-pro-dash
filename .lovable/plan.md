

# Plano: Corrigir Tela Preta ao Selecionar "Cliente Novo" no QuickSaleModal

## Diagnóstico

Analisando o código do `QuickSaleModal.tsx`, identifiquei dois problemas potenciais que podem causar a tela preta:

### Causa Provável 1: Interação Focus Trap (Radix Dialog) + ToggleGroup em Mobile
O `ToggleGroupItem` do Radix pode causar um conflito de foco com o `Dialog` em dispositivos móveis. Quando o usuário toca no botão "Cliente Novo", o foco sai momentaneamente do Dialog, o que pode fazer o focus trap do Radix fechar o Dialog. O overlay escuro (`bg-black/80`) permanece por um instante, dando a impressão de "tela preta".

### Causa Provável 2: `fetchSubscriptionPlans` nunca é chamada
A função `fetchSubscriptionPlans` (linha 240) é **definida mas nunca executada** em nenhum `useEffect`. Isso significa que `subscriptionPlans` é sempre `[]`. Embora não cause crash diretamente, se algum código downstream depender de ter planos carregados quando `clientType` muda, pode gerar erro silencioso.

### Causa Provável 3: Promise rejection não tratada
Quando o `clientType` muda, o `useEffect` na linha 510 executa `resolveSubscriptionForClient()`. Se o componente for desmontado ou o state mudar durante essa chamada async, pode haver uma rejeição de promise não tratada que crash o React tree.

## Correções

### 1. Proteger interação do ToggleGroup no Dialog
- Adicionar `onPointerDown={(e) => e.preventDefault()}` nos `ToggleGroupItem` para evitar que o Radix Dialog interprete o clique como perda de foco.
- Garantir que `handleClientTypeChange` está envolvido em try/catch.

### 2. Chamar `fetchSubscriptionPlans` no `useEffect` de abertura
- Adicionar chamada no `useEffect` existente (linha 225) para carregar os planos de assinatura junto com o catálogo.

### 3. Proteção contra unmount em operações async
- Adicionar flag `isMounted` nos efeitos assíncronos de `resolveSubscriptionForClient` para evitar `setState` após unmount.
- Envolver `handleClientTypeChange` em try/catch com toast de erro.

### 4. Adicionar console.log de diagnóstico
- Adicionar logs em pontos críticos (seleção de tipo de cliente, abertura/fechamento do dialog) para capturar o erro caso persista.

## Detalhes Técnicos

| Arquivo | Mudança |
|---|---|
| `QuickSaleModal.tsx` | Proteger ToggleGroupItems contra conflito de foco |
| `QuickSaleModal.tsx` | Chamar `fetchSubscriptionPlans` no useEffect de abertura |
| `QuickSaleModal.tsx` | Proteção async com isMounted |
| `QuickSaleModal.tsx` | Console logs de diagnóstico nos handlers críticos |

