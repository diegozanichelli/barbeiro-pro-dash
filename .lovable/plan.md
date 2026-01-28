
# Plano: Sistema de Comissão Híbrida com Catálogo de Itens

## Visão Geral

Implementação de um sistema completo de catálogo de serviços e produtos com comissão fixa opcional, permitindo rastrear cada venda individualmente enquanto mantém retrocompatibilidade com os dashboards existentes.

---

## Fase 1: Estrutura de Dados (Banco de Dados)

### 1.1 Criar Tabela `catalog_services`

```text
┌─────────────────────────────────────────────────────────────┐
│                    catalog_services                          │
├─────────────────────────────────────────────────────────────┤
│ id               │ uuid (PK)                                │
│ organization_id  │ uuid (FK → organizations)                │
│ name             │ text                                     │
│ default_price    │ numeric(10,2)                            │
│ category         │ text ('basic' | 'extra')                 │
│ fixed_commission │ numeric(5,2) NULLABLE ← A COLUNA CRÍTICA │
│ is_active        │ boolean (default: true)                  │
│ created_at       │ timestamp                                │
│ updated_at       │ timestamp                                │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Criar Tabela `catalog_products`

```text
┌─────────────────────────────────────────────────────────────┐
│                    catalog_products                          │
├─────────────────────────────────────────────────────────────┤
│ id               │ uuid (PK)                                │
│ organization_id  │ uuid (FK → organizations)                │
│ name             │ text                                     │
│ default_price    │ numeric(10,2)                            │
│ fixed_commission │ numeric(5,2) NULLABLE ← A COLUNA CRÍTICA │
│ is_active        │ boolean (default: true)                  │
│ created_at       │ timestamp                                │
│ updated_at       │ timestamp                                │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Criar Tabela `sale_transactions` (Histórico Granular)

```text
┌─────────────────────────────────────────────────────────────┐
│                    sale_transactions                         │
├─────────────────────────────────────────────────────────────┤
│ id                    │ uuid (PK)                           │
│ organization_id       │ uuid (FK → organizations)           │
│ barber_id             │ uuid (FK → barbers)                 │
│ daily_production_id   │ uuid (FK → daily_productions)       │
│ item_type             │ text ('service' | 'product')        │
│ catalog_service_id    │ uuid NULLABLE (FK → catalog_services)│
│ catalog_product_id    │ uuid NULLABLE (FK → catalog_products)│
│ item_name             │ text (snapshot do nome)             │
│ price_sold            │ numeric(10,2)                       │
│ commission_rate_used  │ numeric(5,2)                        │
│ commission_amount     │ numeric(10,2)                       │
│ created_at            │ timestamp                           │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 Políticas RLS

- Gestor pode gerenciar catálogo da sua organização
- Barbeiro pode inserir transações de venda (próprias)
- Gestor pode visualizar todas as transações da organização

---

## Fase 2: Lógica de Cálculo de Comissão

### 2.1 Criar Função `calculate_item_commission()`

Esta função será chamada ao inserir uma `sale_transaction`:

```text
Algoritmo:
1. Buscar o item no catálogo (catalog_services ou catalog_products)
2. SE item.fixed_commission IS NOT NULL:
     → taxaFinal = item.fixed_commission
3. SENÃO:
     → Buscar barber.services_commission ou barber.products_commission
     → taxaFinal = barber.commission_rate
4. commission_amount = (price_sold * taxaFinal) / 100
5. Salvar commission_rate_used e commission_amount na transação
```

### 2.2 Criar Trigger `after_sale_transaction_insert`

Após cada inserção em `sale_transactions`:
1. Calcula a comissão usando a lógica híbrida
2. Atualiza os totais agregados em `daily_productions`

### 2.3 Função de Sincronização `sync_daily_production_totals()`

Agrega automaticamente os valores de `sale_transactions` para manter `daily_productions` atualizado:

```text
UPDATE daily_productions SET
  services_basic_total = (SUM from transactions WHERE category='basic'),
  services_extra_total = (SUM from transactions WHERE category='extra'),
  products_total = (SUM from transactions WHERE item_type='product'),
  commission_earned = (SUM of commission_amount)
WHERE id = NEW.daily_production_id
```

---

## Fase 3: Interface de Gestão - Central de Comissões

### 3.1 Nova Aba no ManagerDashboard: "Catálogo"

Adicionar nova tab com ícone `Package` chamada "Catálogo"

### 3.2 Componente `CatalogManagement.tsx`

```text
┌────────────────────────────────────────────────────────────────┐
│  📦 Central de Catálogo e Comissões                            │
├────────────────────────────────────────────────────────────────┤
│  [+ Novo Serviço]  [+ Novo Produto]                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ═══ SERVIÇOS ═══                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Nome          │ Preço    │ Categoria │ Comissão Fixa?   │  │
│  ├───────────────┼──────────┼───────────┼──────────────────┤  │
│  │ Corte Simples │ R$ 50,00 │ Básico    │ [ OFF ]          │  │
│  │ Barba         │ R$ 30,00 │ Básico    │ [ OFF ]          │  │
│  │ Progressiva   │ R$150,00 │ Extra     │ [●ON ] → 30%     │  │
│  │ Luzes         │ R$200,00 │ Extra     │ [●ON ] → 25%     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ═══ PRODUTOS ═══                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Nome          │ Preço    │ Comissão Fixa?               │  │
│  ├───────────────┼──────────┼──────────────────────────────┤  │
│  │ Pomada        │ R$ 45,00 │ [ OFF ]                      │  │
│  │ Minoxidil     │ R$ 80,00 │ [●ON ] → 20%                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 3.3 Modal de Criação/Edição de Item

Campos:
- Nome do item
- Preço padrão (R$)
- Categoria (só para serviços: Básico/Extra)
- Toggle "Comissão Fixa?"
  - Se ON: Input para % fixa (0-100)
  - Se OFF: Mostra "Usa plano de carreira do barbeiro"

---

## Fase 4: Fluxo de Venda por Item

### 4.1 Atualizar `QuickSaleModal.tsx`

Transformar de entrada manual para seleção de itens do catálogo:

```text
┌─────────────────────────────────────────────────────────────┐
│  💰 Venda Rápida - João Silva                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Selecione o item:                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🔍 Buscar...                                            ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ SERVIÇOS                                                ││
│  │  ○ Corte Simples ................ R$ 50,00              ││
│  │  ○ Barba ........................ R$ 30,00              ││
│  │  ● Progressiva .................. R$ 150,00  ⚡30%      ││
│  │                                                         ││
│  │ PRODUTOS                                                ││
│  │  ○ Pomada ....................... R$ 45,00              ││
│  │  ○ Minoxidil .................... R$ 80,00   ⚡20%      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Valor: [  R$ 150,00  ] (editável)                          │
│                                                             │
│  Comissão: R$ 45,00 (30% fixa)                              │
│                                                             │
│  [Cancelar]                              [Registrar Venda]  │
└─────────────────────────────────────────────────────────────┘
```

O ícone ⚡ indica itens com comissão fixa definida.

### 4.2 Opção de "Venda Manual"

Manter botão para venda sem item do catálogo (retrocompatibilidade):
- Permite digitar valor e categoria manualmente
- Usa comissão do plano de carreira do barbeiro

---

## Fase 5: Retrocompatibilidade

### 5.1 Trigger de Sincronização Bidirecional

Quando `sale_transactions` é inserida:
1. Cria/atualiza `daily_productions` do dia
2. Recalcula os totais agregados

Quando `daily_productions` é atualizada diretamente (fluxo antigo):
1. Continua funcionando com a trigger `calculate_commission()` existente
2. Não cria `sale_transactions` (manter como legado)

### 5.2 Dashboards Existentes

- **Leaderboard**: Continua lendo de `daily_productions` (sem alteração)
- **LiveDashboard**: Continua lendo de `daily_productions` (sem alteração)
- **Relatórios**: Continua funcionando (sem alteração)

---

## Arquivos a Serem Criados/Modificados

### Novos Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/XXXXX_catalog_system.sql` | Criação das tabelas, triggers e RLS |
| `src/components/dashboard/manager/CatalogManagement.tsx` | Tela de gestão do catálogo |
| `src/components/dashboard/manager/CatalogItemModal.tsx` | Modal de criar/editar item |
| `src/lib/validations/catalog.ts` | Schema Zod para validação |

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/ManagerDashboard.tsx` | Adicionar tab "Catálogo" |
| `src/components/dashboard/manager/QuickSaleModal.tsx` | Integrar seleção de itens do catálogo |
| `src/integrations/supabase/types.ts` | Tipos atualizados automaticamente |

---

## Sequência de Implementação

1. **Migração do banco** - Criar tabelas e triggers
2. **Tela de Catálogo** - Permitir cadastrar "Progressiva com 30%"
3. **Atualizar QuickSaleModal** - Selecionar itens do catálogo
4. **Testar retrocompatibilidade** - Garantir dashboards funcionando

---

## Detalhes Técnicos

### Trigger de Cálculo Híbrido

```sql
CREATE OR REPLACE FUNCTION calculate_sale_commission()
RETURNS TRIGGER AS $$
DECLARE
  v_fixed_rate NUMERIC;
  v_barber_rate NUMERIC;
  v_final_rate NUMERIC;
BEGIN
  -- Buscar taxa fixa do item (se existir)
  IF NEW.item_type = 'service' AND NEW.catalog_service_id IS NOT NULL THEN
    SELECT fixed_commission INTO v_fixed_rate
    FROM catalog_services WHERE id = NEW.catalog_service_id;
  ELSIF NEW.item_type = 'product' AND NEW.catalog_product_id IS NOT NULL THEN
    SELECT fixed_commission INTO v_fixed_rate
    FROM catalog_products WHERE id = NEW.catalog_product_id;
  END IF;

  -- Se não tem taxa fixa, usar do barbeiro
  IF v_fixed_rate IS NULL THEN
    IF NEW.item_type = 'service' THEN
      SELECT services_commission INTO v_barber_rate
      FROM barbers WHERE id = NEW.barber_id;
    ELSE
      SELECT products_commission INTO v_barber_rate
      FROM barbers WHERE id = NEW.barber_id;
    END IF;
    v_final_rate := v_barber_rate;
  ELSE
    v_final_rate := v_fixed_rate;
  END IF;

  -- Calcular e salvar
  NEW.commission_rate_used := v_final_rate;
  NEW.commission_amount := (NEW.price_sold * v_final_rate) / 100;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Validação Zod para Catálogo

```typescript
export const catalogServiceSchema = z.object({
  name: z.string().min(2).max(100),
  default_price: z.number().min(0).max(99999),
  category: z.enum(["basic", "extra"]),
  fixed_commission: z.number().min(0).max(100).nullable(),
  is_active: z.boolean()
});

export const catalogProductSchema = z.object({
  name: z.string().min(2).max(100),
  default_price: z.number().min(0).max(99999),
  fixed_commission: z.number().min(0).max(100).nullable(),
  is_active: z.boolean()
});
```

---

## Resultado Esperado

Após a implementação, você poderá:

1. Cadastrar "Progressiva" com **30% de comissão fixa**
2. Quando um barbeiro vender uma Progressiva, o sistema automaticamente:
   - Ignora a comissão do plano de carreira (50%)
   - Aplica os 30% fixos do item
   - Registra a transação individual para rastreamento
3. Os dashboards existentes continuam funcionando normalmente
4. O financeiro terá visibilidade granular de cada venda

