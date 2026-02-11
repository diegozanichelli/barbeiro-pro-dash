

# Otimizar UX Mobile do BarberEditProductionModal

## Resumo

Aplicar as correcoes de UX mobile no `BarberEditProductionModal` seguindo o feedback do usuario: ocultar totalmente o Alert "Lancamento atual" no mobile, minimizar o cabecalho ao maximo, garantir touch targets seguros (min 44px), individualizar o carrinho com `tempId`, e restaurar o scroll funcional do catalogo.

---

## Alteracoes

### 1. Cabecalho ultra-compacto no mobile

- Titulo: apenas "Editar" + botao X nativo do Dialog. Remover a data do titulo no mobile.
- `DialogDescription`: ocultar completamente no mobile com `hidden md:block`.
- Padding do header: `px-4 pt-3 pb-2` no mobile, manter `px-6 pt-6 pb-4` no desktop.
- Borda inferior mantida para separacao visual.

### 2. Alert "Lancamento atual" -- ocultar no mobile

- Adicionar `hidden md:block` no container do Alert.
- No mobile, o barbeiro foca 100% em selecionar itens. O resumo financeiro aparece apenas no footer ao salvar.

### 3. Individualizar carrinho com `tempId`

Portar a mesma logica do `BarberSaleForm`:

- Alterar interface `CartItem`: adicionar `tempId: string`, remover `quantity: number`.
- Substituir `handleToggleCart` por `handleAddToCart` que gera `tempId` unico.
- Remover `isInCart` e `updateCartItemQuantity`.
- Adicionar `countInCart(itemId)` para exibir badge nos cards.
- Atualizar `updateCartItemPriceInput` e `finalizeCartItemPrice` para usar `tempId`.
- Remover botao: filtrar por `tempId`.

### 4. Cards de catalogo com modo compacto e badge de contagem

- Atualizar `CatalogCard` local para aceitar `countInCart` e `compact` em vez de `isSelected`.
- No mobile com itens no carrinho: padding `p-2`, fonte `text-xs`, preco `text-sm`.
- Badge de contagem (ex: "x2") no canto superior direito quando `countInCart > 0`.
- Remover checkmark de selecao (nao e mais toggle).

### 5. Corrigir scroll do catalogo

- Container dos grids: remover `px-6 py-4` fixo, usar `px-3 py-2` no mobile.
- Adicionar `-webkit-overflow-scrolling: touch` e `touch-pan-y` no container scrollavel.
- O container `flex-1 min-h-0 overflow-y-auto` ja existe mas precisa de `overscroll-contain`.

### 6. Footer compacto com touch targets seguros

- Cart items no footer: cada linha com `min-h-[44px]` para garantir area de toque.
- Botao de remover (lixeira/X): `h-10 w-10` como area clicavel (icone pequeno, area grande).
- Remover botoes +/- de quantidade (nao existe mais).
- Manter botao "Salvar Alteracoes" com `h-10` minimo.
- Contador de clientes: botoes `h-10 w-10`.

### 7. Atualizar `handleSubmit` para carrinho individualizado

- Remover loop `for (let i = 0; i < item.quantity; i++)`.
- Cada item do array `cart` gera 1 transacao direta:

```text
const transactions = cart.map(item => ({
  ...campos,
  price_sold: item.customPrice,
  source: "barber",
}));
```

### 8. Atualizar calculos de total

```text
const cartTotal = cart.reduce((sum, item) => sum + item.customPrice, 0);
const cartItemsTotal = cart.length;
```

---

## Secao Tecnica

### Arquivo modificado

`src/components/dashboard/barber/BarberEditProductionModal.tsx`

### Layout do DialogContent (estrutura final)

```text
DialogContent (max-h-[95vh] flex flex-col p-0 overflow-hidden)
  |-- DialogHeader (px-4 pt-3 pb-2 | apenas "Editar" no mobile)
  |-- Search input (px-3 py-2)
  |-- Tabs header (px-3)
  |-- Catalogo grid (flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y)
  |     |-- grid (px-3 py-2, cols-2, gap-2, cards compact)
  |-- Footer (border-t px-3 py-2 bg-muted/30)
        |-- Cart items (cada linha min-h-[44px], botao X com h-10 w-10)
        |-- Clientes counter (botoes h-10 w-10)
        |-- Botao Salvar (h-10+)
```

### Touch targets

Todos os botoes interativos mantem area minima de 44x44px conforme diretrizes de acessibilidade mobile:
- Icone do botao pode ser pequeno (w-4 h-4)
- Area clicavel do botao: `h-10 w-10` ou `min-h-[44px]`

