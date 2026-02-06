
# Plano: Seletor Global de "Tipo de Cliente" + Relatório de Conversão

## Resumo Executivo

Adicionar um seletor visual obrigatório (Cliente Novo vs Cliente da Casa) em todos os pontos de venda para capturar métricas de conversão precisas. Em seguida, criar um relatório de Performance de Assinaturas que mostre a taxa de conversão real (Assinaturas / Clientes Novos Atendidos).

---

## Parte 1: Seletor no Painel do Gestor

### Arquivo: `QuickSaleModal.tsx`

**Localização**: No topo do modal, logo abaixo do toggle "Venda Recepção / Loja" (linha ~458)

**Componente**:
- Usar ToggleGroup com dois botões:
  - "🏠 Cliente da Casa" (default selecionado)
  - "🆕 Cliente Novo"
- Estado: `isNewClient: boolean` (default: `false`)

**Integração no Submit** (função `handleCartCheckout`):
- Adicionar `is_new_client: isNewClient` em cada transação do array `transactions[]`
- Resetar estado no `resetForm()`

---

## Parte 2: Seletor no App do Barbeiro

### Arquivo: `BarberSaleForm.tsx`

**Localização A - Card Principal**: Após o Date Picker (linha ~378), adicionar o mesmo ToggleGroup

**Localização B - Modal de Checkout**: Mostrar o tipo selecionado como informação visual no resumo (linha ~564)

**Integração no Submit** (função `handleConfirmCheckout`):
- Adicionar `is_new_client: isNewClient` em cada transação
- Estado: `isNewClient: boolean` (default: `false`)

---

## Parte 3: Relatório de Conversão

### Arquivo: `BarberEvolution.tsx`

**Adicionar Nova Tab**: "Assinaturas" com ícone Crown

**Novo Componente**: `SubscriptionPerformanceChart`

**Dados a Buscar** (da tabela `sale_transactions`):
```text
Por Barbeiro:
1. oportunidades = COUNT(*) WHERE is_new_client = true
2. assinaturas = COUNT(*) WHERE item_type = 'subscription'
3. conversao = (assinaturas / oportunidades) * 100
```

**Colunas da Tabela**:
| Barbeiro | Unidade | Clientes Novos | Assinaturas | Conversão |
|----------|---------|----------------|-------------|-----------|
| Ageu     | Centro  | 10             | 3           | 30% ⭐    |
| João     | Norte   | 5              | 0           | 0% 🔴     |

**Regras Visuais**:
- `0%` = Badge vermelha (alerta)
- `1-29%` = Badge amarela
- `30%+` = Badge verde com estrela

---

## Fluxo Visual dos Componentes

```text
┌─────────────────────────────────────────┐
│  QuickSaleModal (Gestor)                │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │ Toggle: Venda Recepção / Loja     │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  TIPO DE CLIENTE (NOVO!)          │  │
│  │  ┌──────────┐  ┌──────────────┐   │  │
│  │  │🏠 Da Casa│  │🆕 Novo       │   │  │
│  │  │(default) │  │              │   │  │
│  │  └──────────┘  └──────────────┘   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [Serviços] [Produtos] [Manual]         │
│  ... grid de itens ...                  │
└─────────────────────────────────────────┘
```

```text
┌─────────────────────────────────────────┐
│  BarberEvolution                        │
├─────────────────────────────────────────┤
│  [Barbearia] [Comparativo] [Barbeiro]   │
│                           [Assinaturas] │ ← NOVA TAB
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  📊 Performance de Conversão      │  │
│  ├───────────────────────────────────┤  │
│  │  Barbeiro │ Novos │ Vendas │ %    │  │
│  │  Ageu     │  10   │   3    │ 30%⭐ │  │
│  │  João     │   5   │   0    │ 0% 🔴 │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## Detalhes Técnicos

### Alterações por Arquivo

| Arquivo | Alteração |
|---------|-----------|
| `QuickSaleModal.tsx` | Adicionar estado `isNewClient`, ToggleGroup visual, incluir no insert |
| `BarberSaleForm.tsx` | Adicionar estado `isNewClient`, ToggleGroup visual, incluir no insert |
| `BarberEvolution.tsx` | Adicionar 4ª tab "Assinaturas" com novo componente |

### Novo Componente a Criar

**`SubscriptionPerformanceReport.tsx`**:
- Query para buscar:
  - Clientes novos atendidos por barbeiro (`is_new_client = true`)
  - Assinaturas vendidas por barbeiro (`item_type = 'subscription'`)
- Cálculo de conversão
- Tabela com cores condicionais

### Imports Necessários

```typescript
// Em QuickSaleModal.tsx e BarberSaleForm.tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Home, UserPlus } from "lucide-react";
```

---

## Considerações

1. **Valor Padrão**: "Cliente da Casa" vem selecionado para agilizar o fluxo (maioria dos atendimentos são recorrentes)

2. **Retroatividade**: Atendimentos antigos terão `is_new_client = false` (null tratado como false)

3. **Venda Manual**: O modo manual no BarberSaleForm também deve capturar o tipo de cliente (inserir na daily_productions como referência visual, já que não gera transaction)

4. **Denominador Correto**: A fórmula de conversão usa apenas clientes novos como denominador, não o total de atendimentos

---

## Sequência de Implementação

1. Adicionar seletor no `QuickSaleModal.tsx` (gestor)
2. Adicionar seletor no `BarberSaleForm.tsx` (barbeiro)
3. Criar componente `SubscriptionPerformanceReport.tsx`
4. Integrar nova tab no `BarberEvolution.tsx`
5. Testar fluxo completo
