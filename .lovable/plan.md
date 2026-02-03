
# Plano: Corrigir Erro de Digitação de Preço no PDV

## Problema Identificado

No modal de "Venda Rápida" (QuickSaleModal), quando o gestor tenta alterar o preço de um serviço ou produto no carrinho, a digitação fica "travada" ou apresenta comportamento estranho.

### Causa Raiz

O input de preço do carrinho usa uma abordagem problemática:

```tsx
// PROBLEMA: value derivado diretamente do número
value={item.customPrice.toFixed(2).replace(".", ",")}
onChange={(e) => {
  const cleaned = e.target.value.replace(/[^\d,.\-]/g, "");
  updateCartItemPrice(item.id, cleaned); // Converte para número imediatamente
}}
```

**Fluxo do bug:**
1. Usuário clica no campo com valor "80,00"
2. Tenta apagar e digitar "75"
3. Ao apagar, `parseFloat("")` retorna `0`
4. O React re-renderiza com `value="0,00"`
5. O cursor perde a posição, a digitação fica inconsistente

**Diferença para o input que funciona (Manual):**
- O input manual usa `handleNumericInput` com estado de **string** separado
- Isso permite manter o estado intermediário durante a digitação

---

## Solução Proposta

### Estratégia: Manter Estado de String por Item

Adicionar um estado separado para armazenar o valor como **string** durante a digitação, convertendo para número apenas ao sair do campo (onBlur) ou ao submeter.

### Alterações no Código

**1. Atualizar interface CartItem** (linha 43-46)

Adicionar campo `customPriceInput` para manter o valor como string:

```typescript
interface CartItem extends CatalogItem {
  customPrice: number;
  customPriceInput: string;  // NOVO: estado de string para digitação
  quantity: number;
}
```

**2. Inicializar customPriceInput ao adicionar ao carrinho** (linha 167-176)

```typescript
const handleToggleCart = (item: CatalogItem) => {
  setCart(prev => {
    const exists = prev.find(i => i.id === item.id);
    if (exists) {
      return prev.filter(i => i.id !== item.id);
    } else {
      return [...prev, { 
        ...item, 
        customPrice: item.default_price, 
        customPriceInput: item.default_price.toFixed(2).replace(".", ","),  // NOVO
        quantity: 1 
      }];
    }
  });
};
```

**3. Criar nova função para atualizar o input** (após linha 195)

```typescript
const updateCartItemPriceInput = (itemId: string, newValue: string) => {
  setCart(prev => prev.map(item => {
    if (item.id !== itemId) return item;
    
    // Usar a mesma lógica do handleNumericInput para consistência
    let cleanedValue = newValue;
    
    if (newValue === "") {
      cleanedValue = "";
    } else {
      const cleaned = newValue.replace(/[^\d,.\-]/g, "");
      // Remover zeros à esquerda se necessário
      if ((item.customPriceInput === "0" || item.customPriceInput === "0,00") && /^\d/.test(cleaned)) {
        cleanedValue = cleaned.replace(/^0+(?=\d)/, "") || cleaned;
      } else {
        cleanedValue = cleaned;
      }
    }
    
    // Atualizar o valor numérico também para cálculos em tempo real
    const parsed = parseFloat(cleanedValue.replace(",", ".")) || 0;
    
    return { 
      ...item, 
      customPriceInput: cleanedValue,
      customPrice: parsed
    };
  }));
};

const finalizeCartItemPrice = (itemId: string) => {
  setCart(prev => prev.map(item => {
    if (item.id !== itemId) return item;
    
    // Ao sair do campo, formatar o valor corretamente
    const formattedInput = item.customPrice > 0 
      ? item.customPrice.toFixed(2).replace(".", ",")
      : "0,00";
    
    return { ...item, customPriceInput: formattedInput };
  }));
};
```

**4. Atualizar o Input de Preço no Carrinho** (linhas 635-644)

```tsx
{/* Price */}
<Input
  type="text"
  inputMode="decimal"
  value={item.customPriceInput}
  onChange={(e) => updateCartItemPriceInput(item.id, e.target.value)}
  onBlur={() => finalizeCartItemPrice(item.id)}
  className="w-20 text-right font-bold text-xs h-7"
/>
```

---

## Resumo das Mudanças

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/manager/QuickSaleModal.tsx` | Adicionar `customPriceInput` à interface, criar funções de handling, atualizar input |

## Resultado Esperado

- **Antes**: Gestor tenta digitar "75" e o campo mostra "0,00" ou valores estranhos
- **Depois**: Gestor consegue apagar e digitar livremente, valor é formatado ao sair do campo

---

## Seção Técnica

### Fluxo de Dados Corrigido

```text
┌────────────────────────────────────────────────────────────────┐
│                    Input de Preço (Carrinho)                   │
├────────────────────────────────────────────────────────────────┤
│ 1. value={item.customPriceInput}  ← Estado de STRING           │
│ 2. onChange → updateCartItemPriceInput()                       │
│    └─→ Limpa caracteres inválidos                              │
│    └─→ Remove zeros à esquerda                                 │
│    └─→ Atualiza customPriceInput (string)                      │
│    └─→ Atualiza customPrice (número) para cálculos             │
│ 3. onBlur → finalizeCartItemPrice()                            │
│    └─→ Formata valor final ("45,50")                           │
└────────────────────────────────────────────────────────────────┘
```

### Compatibilidade

- Mantém compatibilidade com cálculos existentes (cartTotal usa customPrice)
- Não afeta lógica de checkout
- Segue padrão já usado no input Manual (handleNumericInput)
