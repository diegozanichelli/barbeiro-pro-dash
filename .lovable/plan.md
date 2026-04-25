## Problemas

1. **Auto-scroll não desce até o card de Atribuição.** O `attributionCardRef.scrollIntoView` é executado dentro de um `DialogContent` Radix com container scrollável próprio (`<div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">`). Como o conteúdo ainda está mudando de altura no momento da chamada (banner "Verificando ciclo da assinatura..." aparece/some), o `scrollIntoView` falha em chegar até o card.

2. **Ao clicar em "Venda Recepção" o seletor de unidades não abre sozinho.** O `Select` aparece, mas o usuário precisa clicar nele para ver as unidades disponíveis. Deveria abrir automaticamente quando há mais de uma unidade.

## Mudanças

Arquivo: `src/components/dashboard/manager/QuickSaleModal.tsx`

### 1. Scroll programático confiável (substitui `scrollIntoView`)

No `useEffect` que dispara o highlight (~linha 825-857):

- Aguardar **~180ms** com `setTimeout` antes do scroll, dando tempo para o banner do ciclo de assinatura entrar/sair e o layout estabilizar.
- **Subir a árvore** a partir de `attributionCardRef.current` até encontrar o ancestral com `overflow-y: auto|scroll` (que é o container do Step 1).
- Calcular `top` via `getBoundingClientRect()` + `scrollTop` do scroller, com offset de 16px de folga visual acima.
- Chamar `scroller.scrollTo({ top, behavior: "smooth" })`.
- Fallback para `scrollIntoView` caso nenhum scroller seja encontrado.
- Limpar `setTimeout` e `requestAnimationFrame` no cleanup.

### 2. Abrir o Select de unidade automaticamente ao escolher Recepção

Adicionar um `useEffect` (perto dos outros effects de atribuição):

- Quando `attribution === "reception"` **E** `units.length > 1` **E** ainda não há `selectedUnitId`, setar `setUnitSelectOpen(true)` após um `requestAnimationFrame` (para o `<Select>` já estar montado no DOM).
- Não reabrir se o usuário fechou e selecionou — o estado `selectedUnitId` evita o loop.

## Resultado esperado

- Quando o cliente é identificado, o painel desce sozinho até o card de Atribuição da Venda (com 16px de folga acima), pulsando em laranja por 3s.
- O usuário escolhe **Venda Recepção** → o dropdown de unidades **abre imediatamente** mostrando todas as unidades disponíveis para ele apenas clicar e escolher.
- Se for unidade única, o `Select` nem aparece (comportamento atual mantido).