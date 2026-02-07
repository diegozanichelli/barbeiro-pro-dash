
# Plano: Corrigir Layout do Grid de Cards no Modal de Venda Rápida

## Problema Identificado

Quando o gestor seleciona um serviço no modal de venda rápida ("AO VIVO"), os cards ficam "espremidos" e não é possível selecionar mais itens. Isso acontece porque:

1. O footer do modal cresce dinamicamente quando itens são adicionados ao carrinho
2. O grid de itens tem `max-h-[50vh]` fixo que não se adapta ao espaço disponível
3. A combinação de `flex-1` com altura fixa causa conflito de layout
4. O espaço para os cards diminui drasticamente quando o resumo do carrinho aparece

---

## Estrutura Atual (Problemática)

```text
┌──────────────────────────────────────────┐
│  DialogContent (max-h-[90vh])            │
│  ┌────────────────────────────────────┐  │
│  │  Header (altura fixa ~200px)       │  │
│  │  - Toggle Recepção                 │  │
│  │  - Toggle Tipo Cliente             │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Search Bar (altura fixa)          │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Tabs + Grid (flex-1)              │  │
│  │  └── max-h-[50vh] ← CONFLITO!      │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Footer (cresce com carrinho)      │  │
│  │  - Cart Summary (dinâmico)         │  │← CRESCE!
│  │  - Botões                          │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## Solução Proposta

Reestruturar o layout do modal para:
1. Remover a altura fixa `max-h-[50vh]` do grid de itens
2. Usar layout flex correto para que o grid ocupe o espaço restante
3. Limitar o tamanho do cart summary com scroll interno
4. Garantir que o grid seja sempre scrollável e visível

---

## Alterações no Arquivo `QuickSaleModal.tsx`

### 1. Ajustar o Grid de Serviços (linha 571-583)

**Antes:**
```tsx
<div className="flex-1 px-6 py-4 overflow-y-auto max-h-[50vh] overscroll-contain touch-pan-y">
```

**Depois:**
```tsx
<div className="flex-1 min-h-0 px-6 py-4 overflow-y-auto overscroll-contain touch-pan-y">
```

O truque é usar `min-h-0` para permitir que o container flexível encolha, e remover o `max-h-[50vh]` fixo.

### 2. Ajustar o Grid de Produtos (linha 601-613)

Mesma correção aplicada à aba de produtos.

### 3. Limitar o Tamanho do Cart Summary (linha 666-763)

Adicionar altura máxima e scroll interno no resumo do carrinho quando há muitos itens:

```tsx
{cart.length > 0 && activeTab !== "manual" && (
  <div className="space-y-3 max-h-[30vh] overflow-y-auto overscroll-contain">
    {cart.map((item) => (
      // ... item cards
    ))}
  </div>
)}
```

### 4. Ajustar TabsContent para Flex Correto

Garantir que o `TabsContent` tenha `min-h-0` para funcionar corretamente em flex containers:

```tsx
<TabsContent value="services" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col">
```

---

## Estrutura Corrigida

```text
┌──────────────────────────────────────────┐
│  DialogContent (max-h-[90vh])            │
│  ┌────────────────────────────────────┐  │
│  │  Header (altura fixa)              │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Search Bar (altura fixa)          │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Tabs + Grid (flex-1 min-h-0)      │  │ ← ADAPTA!
│  │  └── overflow-y-auto               │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Footer (altura limitada)          │  │
│  │  - Cart Summary (max-h-[30vh])     │  │ ← SCROLL!
│  │  - Botões (fixo)                   │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## Resumo das Alterações

| Linha | Alteração |
|-------|-----------|
| 558 | Adicionar `min-h-0 flex flex-col` ao TabsContent de serviços |
| 571 | Trocar `max-h-[50vh]` por `min-h-0` no grid de serviços |
| 588 | Adicionar `min-h-0 flex flex-col` ao TabsContent de produtos |
| 601 | Trocar `max-h-[50vh]` por `min-h-0` no grid de produtos |
| 667 | Adicionar `max-h-[30vh] overflow-y-auto` no cart summary |

---

## Resultado Esperado

Após as correções:
- Os cards de serviços/produtos sempre terão espaço adequado para scroll
- O cart summary terá scroll próprio se houver muitos itens
- Selecionar múltiplos itens não irá comprimir o grid
- A experiência de uso será fluida em dispositivos móveis e desktop
