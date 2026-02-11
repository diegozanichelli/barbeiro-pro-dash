

# Individualizar Itens no Carrinho do Barbeiro

## Resumo

Refatorar o carrinho do `BarberSaleForm` para que cada clique em um servico/produto adicione uma nova linha independente, com preco editavel individualmente. Isso elimina o agrupamento por `service_id` e permite lancar o mesmo servico varias vezes com precos diferentes.

---

## Alteracoes

### 1. Alterar a interface `CartItem`

Adicionar um campo `tempId` (string unico) gerado no momento da adicao. Remover o campo `quantity` (cada linha sera sempre quantidade 1).

```text
interface CartItem extends CatalogItem {
  tempId: string;      // ID unico por linha (ex: "1707600000000_abc")
  customPrice: number;
}
// quantity removido - cada linha = 1 unidade
```

### 2. Alterar `handleToggleCart` para `handleAddToCart`

- Deixa de ser toggle (adicionar/remover). Agora SEMPRE adiciona uma nova entrada.
- Gera `tempId` com `crypto.randomUUID()` ou `Date.now() + Math.random()`.
- Para remover, o barbeiro usa o botao X no checkout.

```text
const handleAddToCart = (item: CatalogItem) => {
  const tempId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  setCart(prev => [...prev, { ...item, tempId, customPrice: item.default_price }]);
};
```

### 3. Atualizar `CatalogCard` e grid de selecao

- Remover logica de `isSelected` (toggle visual). O card agora funciona como botao de "adicionar".
- Exibir um pequeno contador no card indicando quantas vezes aquele item esta no carrinho (ex: badge "x3").
- Cada clique adiciona +1 ao carrinho.

```text
// No grid de catalogo:
const countInCart = (itemId: string) => cart.filter(i => i.id === itemId).length;
```

O card mostra o contador quando > 0 em vez do checkmark.

### 4. Atualizar funcoes de edicao/remocao no checkout

- `updateCartItemPrice`: filtrar por `tempId` em vez de `item.id`.
- Remover `updateCartItemQuantity` (nao ha mais quantidade por linha).
- Botao de remover: `setCart(prev => prev.filter(i => i.tempId !== tempId))`.

### 5. Simplificar o modal de checkout

- Remover os botoes +/- de quantidade de cada linha.
- Cada linha mostra: nome do item, badge de categoria, campo de preco editavel, botao X.
- O subtotal por linha = `customPrice` (sem multiplicar por quantity).

### 6. Atualizar calculos de total

```text
const cartTotal = cart.reduce((sum, item) => sum + item.customPrice, 0);
const cartItemsTotal = cart.length;
```

### 7. Atualizar `handleConfirmCheckout`

- Remover o loop de `for (let i = 0; i < item.quantity; i++)`.
- Cada item do array `cart` gera exatamente 1 transacao no banco.
- Simplifica o codigo de batch insert.

```text
const transactions = cart.map(item => ({
  barber_id: barberId,
  organization_id: organizationId,
  daily_production_id: dailyProductionId,
  item_type: item.type,
  item_name: item.name,
  price_sold: item.customPrice,
  service_category: item.type === "service" ? item.category : null,
  catalog_service_id: item.type === "service" ? item.id : null,
  catalog_product_id: item.type === "product" ? item.id : null,
  commission_rate_used: 0,
  commission_amount: 0,
  source: "barber",
  is_new_client: false,
}));
```

### 8. Footer fixo (badge do carrinho)

Atualizar o badge do icone do carrinho para mostrar `cart.length` (quantidade total de linhas).

---

## Compatibilidade

- Nenhuma alteracao de banco de dados necessaria.
- O backend ja recebe transacoes individuais (o loop de `quantity` atual ja fazia isso). A diferenca e que agora cada transacao pode ter preco diferente.
- O `QuickSaleModal` do gestor NAO sera alterado nesta etapa (pode ser feito depois para manter consistencia).

---

## Resumo Visual

Antes: Barbeiro clica "Barba Spa" -> aparece 1 linha com qty 2 -> mesmo preco para ambas.

Depois: Barbeiro clica "Barba Spa" 2x -> aparecem 2 linhas separadas -> cada uma com preco editavel independente.

