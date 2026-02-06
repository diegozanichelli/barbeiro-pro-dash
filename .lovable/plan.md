
# Plano: Relatório de Vendas de Assinaturas por Recepção/Unidade

## Problema Identificado

Atualmente, quando a recepção vende uma assinatura **sem atribuir a um barbeiro**, o registro fica com `barber_id = null` e **não há como saber de qual unidade foi a venda**. A tabela `sale_transactions` não possui uma coluna `unit_id`.

---

## Solução em 3 Partes

### Parte 1: Adicionar Coluna `unit_id` na Tabela

**Migração SQL necessária:**
- Adicionar coluna `unit_id` (uuid, nullable) na tabela `sale_transactions`
- Criar foreign key referenciando `units.id`

Isso permitirá rastrear de qual unidade cada venda foi realizada, especialmente para vendas da recepção.

---

### Parte 2: Atualizar o Wizard de Assinaturas

**Arquivo:** `SubscriptionWizardModal.tsx`

Quando o gestor selecionar **"Recepção"** como atribuição, adicionar um passo ou campo para selecionar a **unidade** onde a venda ocorreu.

```text
Fluxo Atualizado do Wizard:

Passo 1: Tipo de Cliente (Novo vs Da Casa)
Passo 2: Atribuição (Recepção vs Barbeiro)
         └─ Se Recepção: Mostrar seletor de Unidade
         └─ Se Barbeiro: Usa a unidade do barbeiro automaticamente
Passo 3: Detalhes do Plano
```

**No insert da transação:**
- Se atribuído a um barbeiro: buscar o `unit_id` do barbeiro
- Se recepção: usar o `unit_id` selecionado pelo gestor

---

### Parte 3: Criar o Relatório de Performance da Recepção

**Novo Componente:** `ReceptionPerformanceReport.tsx`

**Localização:** Adicionar como nova aba no `BarberEvolution.tsx` (junto com Barbearia, Comparativo, Barbeiro, Assinaturas)

**Nova aba:** "👩‍💼 Recepção" (ícone Building2)

**Conteúdo da Aba:**

```text
┌─────────────────────────────────────────────────────┐
│  📊 Performance de Vendas por Recepção              │
├─────────────────────────────────────────────────────┤
│  Filtros: [Mês ▼] [Ano ▼]                           │
│                                                     │
│  Cards de Resumo:                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Total    │ │ Média    │ │ Melhor   │            │
│  │ Vendas   │ │ por Und. │ │ Unidade  │            │
│  │ 45       │ │ 9        │ │ Centro   │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                     │
│  Tabela:                                            │
│  ┌───────────────────────────────────────────────┐  │
│  │ Unidade  │ Assinaturas │ Novas │ Casa │ Trend │  │
│  ├──────────┼─────────────┼───────┼──────┼───────┤  │
│  │ Centro   │     15      │   8   │  7   │  ⬆️   │  │
│  │ Norte    │     12      │   5   │  7   │  ⬇️   │  │
│  │ Sul      │      8      │   3   │  5   │  ➡️   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Query para o Relatório:**
```text
SELECT 
  unit_id,
  COUNT(*) as total_subscriptions,
  SUM(CASE WHEN is_new_client = true THEN 1 ELSE 0 END) as new_clients,
  SUM(CASE WHEN is_new_client = false THEN 1 ELSE 0 END) as existing_clients
FROM sale_transactions
WHERE 
  item_type = 'subscription'
  AND barber_id IS NULL  -- Vendas da Recepção
  AND created_at BETWEEN start_date AND end_date
GROUP BY unit_id
ORDER BY total_subscriptions DESC
```

---

## Arquivos a Modificar/Criar

| Arquivo | Ação |
|---------|------|
| Migração SQL | Adicionar coluna `unit_id` em `sale_transactions` |
| `SubscriptionWizardModal.tsx` | Adicionar seletor de unidade quando atribuição = recepção |
| `QuickSaleModal.tsx` | Incluir `unit_id` nas transações (buscar do barbeiro ou seletor) |
| `ReceptionPerformanceReport.tsx` | **NOVO** - Relatório de vendas por unidade/recepção |
| `BarberEvolution.tsx` | Adicionar 5ª aba "Recepção" com o novo componente |

---

## Fluxo Visual da Nova Aba

```text
BarberEvolution.tsx (atualizado):

┌───────────────────────────────────────────────────────────────────┐
│  [Barbearia] [Comparativo] [Barbeiro] [Assinaturas] [Recepção]   │
│                                                        ↑ NOVA    │
└───────────────────────────────────────────────────────────────────┘
```

---

## Considerações Importantes

1. **Retrocompatibilidade**: Vendas antigas com `unit_id = null` serão exibidas como "Unidade não informada"

2. **Vendas com Barbeiro**: Quando uma assinatura é atribuída a um barbeiro, o `unit_id` será preenchido automaticamente a partir do cadastro do barbeiro

3. **Vendas da Recepção**: O gestor será obrigado a selecionar a unidade para permitir o rastreamento correto

4. **Filtro por Unidade**: O relatório permitirá que gestores com múltiplas unidades vejam o desempenho de cada recepção separadamente
