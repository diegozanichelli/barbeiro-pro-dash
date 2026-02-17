

# Otimizacao UX Mobile - Campos de Preco

## Resumo

Criar componente `CurrencyInput` com mascara de centavos em tempo real, Quick Price Chips, auto-select (select all) no foco, altura 48px e fonte 16px. Aplicar em BarberSaleForm e DailyProductionForm.

## 1. Criar `src/components/ui/currency-input.tsx`

Componente reutilizavel com:

- **Mascara de centavos**: valor interno em centavos, cada digito desloca a virgula (digitar 3-0-0-0 exibe "30,00")
- **Backspace**: remove ultimo digito (Math.floor(cents / 10))
- **Quick Price Chips**: prop `quickValues` renderiza botoes horizontais com scroll, min-height 44px, estilo outline
- **Auto-select**: `onFocus` faz `e.target.select()` com setTimeout para compatibilidade mobile (preserva dados em vez de limpar)
- **Acessibilidade**: `inputMode="numeric"`, `h-12` (48px), `text-base` (16px), `autoComplete="off"`
- **Interface**: `value: number` (reais), `onChange: (val: number) => void`, `quickValues?: number[]`

## 2. Alterar `src/components/dashboard/barber/BarberSaleForm.tsx`

- Importar `CurrencyInput`
- Substituir o `Input` de preco editavel no carrinho (~linha 490-505) por `CurrencyInput` com `quickValues={[30, 50, 80, 100]}`
- Adaptar o handler `updateCartItemPrice` para receber number direto

## 3. Alterar `src/components/dashboard/barber/DailyProductionForm.tsx`

- Importar `CurrencyInput`
- Substituir `MobileNumericInput` com `isDecimal` nos 3 campos monetarios (servicesBasicTotal, servicesExtraTotal, productsTotal) por `CurrencyInput`
- Quick Chips: `[100, 200, 300, 500]` para totais diarios
- Para `MobileNumericInput` (campos inteiros: clientes, servicos, produtos): adicionar classes `h-12 text-base` para garantir 48px e 16px

## Secao Tecnica

### Logica da mascara

```text
Estado interno: centavos (inteiro)
Digitar "3"    -> cents=3     -> exibe "0,03"
Digitar "0"    -> cents=30    -> exibe "0,30"
Digitar "0"    -> cents=300   -> exibe "3,00"
Digitar "0"    -> cents=3000  -> exibe "30,00"
Backspace      -> cents=300   -> exibe "3,00"
```

### Arquivos

| Arquivo | Acao |
|---------|------|
| `src/components/ui/currency-input.tsx` | Criar |
| `src/components/dashboard/barber/BarberSaleForm.tsx` | Alterar campo de preco no checkout |
| `src/components/dashboard/barber/DailyProductionForm.tsx` | Alterar 3 campos R$ + aumentar toque nos contadores |

