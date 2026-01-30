
# Plano: Atualização Visual do PDV para Barbeiros

## Resumo da Mudança

O Dashboard do Barbeiro (`BarberDashboard.tsx`) atualmente usa o formulário antigo `DailyProductionForm.tsx` com inputs numéricos manuais. Vamos substituir essa experiência pela mesma interface visual de Cards/PDV que já existe no `QuickSaleModal.tsx` do Gestor.

---

## O Que Será Criado

### 1. Novo Componente: `BarberSaleForm.tsx`

Um componente moderno de PDV (Ponto de Venda) para o barbeiro, com:

```text
┌────────────────────────────────────────────────────────────────┐
│  💰 REGISTRAR VENDA                                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  🔍 Buscar serviço ou produto...                               │
│                                                                │
│  ┌────────────────┬────────────────┬────────────────┐         │
│  │  ✂️ Serviços   │  🧴 Produtos   │   # Manual     │         │
│  └────────────────┴────────────────┴────────────────┘         │
│                                                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Corte     │  │   Barba     │  │  Degradê    │            │
│  │   R$ 50     │  │   R$ 30     │  │   R$ 45     │            │
│  │    [✓]      │  │             │  │             │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ Progressiva │  │    Luzes    │  │  Relaxamento│            │
│  │   R$ 150    │  │   R$ 200    │  │   R$ 120    │            │
│  │   ⚡30%     │  │   ⚡25%     │  │             │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                │
│  ══════════════════════════════════════════════════════════   │
│  Item Selecionado: Corte Masculino                             │
│  Valor: [  R$ 50,00  ] (editável)                              │
│                                                                │
│               [  CONFIRMAR VENDA  ]                            │
└────────────────────────────────────────────────────────────────┘
```

---

## Comportamento do Novo Componente

### Fluxo Principal (Catálogo)
1. Barbeiro abre o Dashboard
2. Vê o grid de cards com serviços e produtos
3. Digita "Cor" na busca -> Filtra para "Corte Masculino"
4. Clica no card -> Card fica selecionado (borda colorida + checkmark)
5. Ajusta o valor se necessário (campo editável)
6. Clica "Confirmar Venda"
7. Sistema salva em `sale_transactions` (trigger calcula comissão híbrida)
8. Grid é atualizado, toast de sucesso aparece

### Fluxo Manual (Fallback)
1. Barbeiro clica na aba "Manual"
2. Digita o valor (com correção do bug do zero)
3. Seleciona categoria (Básico/Extra/Produto)
4. Clica "Confirmar Venda"
5. Sistema salva diretamente em `daily_productions` (fluxo legado)

---

## Correção do Bug do Zero à Esquerda

Será aplicada a mesma função `handleNumericInput` do `QuickSaleModal`:

```typescript
function handleNumericInput(currentValue, newValue, setter) {
  // Se valor atual é "0" e usuário digita "5"
  // Resultado: "5" (não "05")
  if ((currentValue === "0") && /^\d/.test(newValue)) {
    setter(newValue.replace(/^0+(?=\d)/, ""));
    return;
  }
  setter(newValue);
}
```

---

## Arquivos a Serem Modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/barber/BarberSaleForm.tsx` | **NOVO** - Componente PDV visual com Cards |
| `src/components/dashboard/BarberDashboard.tsx` | Substituir `DailyProductionForm` por `BarberSaleForm` |
| `src/components/dashboard/barber/DailyProductionForm.tsx` | Manter para edição de lançamentos passados (no modal) |

---

## Detalhes Técnicos

### Componente `BarberSaleForm.tsx`

O novo componente irá:

1. **Buscar catálogo** da organização do barbeiro (`catalog_services` e `catalog_products`)

2. **Renderizar interface PDV**:
   - Barra de busca com filtro em tempo real
   - Tabs para Serviços/Produtos/Manual
   - Grid de Cards 2-3 colunas (responsivo)
   - Badge de comissão fixa (ícone ⚡)

3. **Gerenciar seleção**:
   - Estado `selectedItem` para o card selecionado
   - Visual feedback (borda primary, checkmark)
   - Input de preço editável

4. **Salvar transação**:
   - Inserir em `sale_transactions` (modo catálogo)
   - Ou atualizar `daily_productions` (modo manual)
   - Incrementar `clients_count` automaticamente

5. **Props do componente**:
```typescript
interface BarberSaleFormProps {
  barberId: string;
  organizationId: string;
  onSuccess: () => void;
}
```

### Atualização do `BarberDashboard.tsx`

Substituir:
```tsx
<DailyProductionForm 
  barberId={barber.id} 
  onSuccess={handleFormSuccess}
  initialData={editingProduction}
/>
```

Por:
```tsx
<BarberSaleForm 
  barberId={barber.id}
  organizationId={barber.organization_id}
  onSuccess={handleFormSuccess}
/>
```

O `DailyProductionForm` será mantido apenas no modal de edição de lançamentos passados.

---

## Manutenção do Formulário Antigo

O `DailyProductionForm.tsx` continuará existindo e será usado exclusivamente no **modal de edição** (quando o barbeiro clica para corrigir um lançamento passado). Isso permite editar dados agregados de dias anteriores sem precisar recriar cada transação individual.

---

## Resultado Esperado

Após a implementação:

1. O barbeiro verá a mesma interface moderna de PDV que o gestor vê no QuickSaleModal
2. A experiência será "Clicou no Card -> Salvou" - rápida e gratificante
3. O bug do zero à esquerda estará corrigido
4. A busca filtrará itens instantaneamente
5. Itens com comissão fixa terão o badge visual (⚡30%)
6. O modo manual continuará disponível como fallback
7. Os dashboards e rankings continuarão funcionando (retrocompatibilidade via triggers)

