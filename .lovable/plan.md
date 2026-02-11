

# Refatorar QuickSaleModal em Wizard de 2 Etapas + Cards 30% Menores

## Resumo

Dividir o QuickSaleModal em 2 telas flutuantes para liberar espaco de tela no mobile. Aplicar os 3 ajustes criticos do usuario: cabecalho limpo no Step 2, grid forcado em 2 colunas no mobile, e resumo claro no rodape.

---

## Alteracoes

### 1. Wizard de 2 Etapas

**Step 1 -- Dados do Cliente:**
- Data da Venda (DatePicker)
- Nome do Cliente (opcional)
- Toggle Venda Recepcao / Loja
- Tipo de Cliente (Da Casa / Novo)
- Botoes: Cancelar | Continuar

**Step 2 -- Catalogo de Itens:**
- Cabecalho compacto com botao Voltar + titulo
- Busca, Tabs, Grid de cards, Carrinho, Confirmar

### 2. Cabecalho Limpo no Step 2 (Ajuste Critico 1)

Apenas:
- Botao icone `<` (Voltar, ghost, h-10 w-10)
- Titulo: "Selecionar Itens" (ou nome do cliente truncado se preenchido)
- Badge de resumo do carrinho no canto direito: "3 itens - R$ 150,00"
- SEM data, SEM nome do barbeiro -- foco total na venda

### 3. Grid Mobile em 2 Colunas (Ajuste Critico 2)

- Mobile: `grid-cols-2` (fixo, sem 3 colunas)
- Desktop: `md:grid-cols-3`
- Gap: `gap-2` no mobile, `md:gap-3` no desktop

### 4. Resumo de Selecao no Rodape (Ajuste Critico 3)

Linha clara antes dos botoes:
```text
3 itens - R$ 150,00
```
Substitui qualquer resumo no topo. O barbeiro/gestor sabe exatamente o que esta no carrinho.

### 5. Cards 30% Menores

| Propriedade | Antes | Depois |
|---|---|---|
| Padding | p-4 | p-2.5 |
| Nome fonte | text-sm | text-xs |
| Preco fonte | text-xl | text-base |
| Gap interno | space-y-2 | space-y-1 |
| Badge comissao | texto normal | text-[10px] |
| Badge categoria | texto normal | text-[10px] |

### 6. Carrinho Individualizado com tempId

Consistencia com BarberSaleForm e BarberEditProductionModal:

- `CartItem` usa `tempId: string` em vez de `quantity: number`
- Cada clique em card = nova linha no carrinho
- Badge de contagem no card (ex: "2") em vez de checkmark
- Sem botoes +/- de quantidade
- Cada item do cart gera 1 transacao direta no submit
- Remocao por `tempId` (botao X com h-10 w-10)

### 7. Footer Compacto com Touch Targets

- Cart items: `min-h-[44px]`, nome truncado + input de preco + botao X (h-10 w-10)
- Contador de clientes: botoes h-10 w-10
- Linha de resumo: "N itens - R$ X,XX" em texto bold
- Botoes: "Voltar" (outline, com icone `<`) | "Confirmar Venda" (primary, flex-1)

### 8. Navegacao

- `resetForm()`: volta step para 1
- Botao "Voltar" no Step 2: `setStep(1)`, mantendo dados do Step 1
- Ao fechar modal: reseta tudo

---

## Secao Tecnica

### Arquivo modificado

`src/components/dashboard/manager/QuickSaleModal.tsx`

### Novo estado

```text
const [step, setStep] = useState<1 | 2>(1);
```

### CartItem atualizado

```text
interface CartItem extends CatalogItem {
  tempId: string;
  customPrice: number;
  customPriceInput: string;
}
```

### Layout Step 1

```text
DialogContent (max-h-[95vh] flex flex-col p-0)
  |-- DialogHeader ("Venda Rapida -- NomeBarbeiro")
  |-- Body (flex-1 overflow-y-auto, 4 campos com padding generoso)
  |-- Footer (Cancelar | Continuar)
```

### Layout Step 2

```text
DialogContent (max-h-[95vh] flex flex-col p-0)
  |-- Header compacto (< Voltar | "Selecionar Itens" | Badge "3 itens")
  |-- Search input (px-3 pt-2)
  |-- Tabs (Servicos | Produtos | Manual)
  |-- Grid cards (flex-1 min-h-0 overflow-y-auto, grid-cols-2, gap-2)
  |-- Footer (cart items + "3 itens - R$150" + Voltar | Confirmar)
```

### Imports adicionados

- `ChevronLeft` e `X` do lucide-react (substituem ChevronDown/ChevronUp que nao sao mais necessarios)

### Removidos

- Estado `headerExpanded` e `shouldAutoCompactHeader` (nao necessarios com wizard)
- `handleToggleCart`, `isInCart`, `updateCartItemQuantity` (substituidos por logica individualizada)

