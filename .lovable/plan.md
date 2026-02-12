

# Correcao de Emergencia: Comissoes e Faturamento dos Barbeiros

## Problema

O dashboard do barbeiro (`BarberDashboard.tsx`) ignora completamente as colunas `tx_*` (vendas lancadas pelo gestor/recepcao), causando:

1. **Faturamento exibido menor** -- soma apenas `services_basic_total + services_extra_total + products_total`, ignorando `tx_basic_total + tx_extra_total + tx_products_total`
2. **Comissao recalculada errada** -- linha 248 recalcula comissao no frontend usando percentual simples, sobrescrevendo o valor correto do banco (`commission_earned`) que ja considera taxas fixas de catalogo + ambas fontes
3. **Historico incompleto** -- `ProductionHistory.tsx` mostra R$ 0 em servicos/produtos quando apenas o gestor lancou

## Correcoes

### 1. BarberDashboard.tsx - fetchMonthlyStats (linhas 234-249)

**Receita de servicos** -- adicionar `tx_basic_total` e `tx_extra_total` na soma:
```text
// ANTES (linha 237):
return sum + (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0);

// DEPOIS:
return sum + (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0)
           + (Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0);
```

**Receita de produtos** -- adicionar `tx_products_total`:
```text
// ANTES (linha 243):
const totalProductsRevenue = productions.reduce((sum, p) => sum + Number(p.products_total || 0), 0);

// DEPOIS:
const totalProductsRevenue = productions.reduce((sum, p) => 
  sum + (Number(p.products_total) || 0) + (Number(p.tx_products_total) || 0), 0);
```

**Comissao** -- usar `commission_earned` do banco ao inves de recalcular:
```text
// ANTES (linhas 248-249):
const recalculatedCommission = (totalServicesRevenue * (barber.services_commission / 100)) + 
                                (totalProductsRevenue * (barber.products_commission / 100));

// DEPOIS:
const accumulatedCommission = productions.reduce((sum, p) => sum + (Number(p.commission_earned) || 0), 0);
```

**Dias trabalhados** -- incluir `tx_*` na contagem (linhas 253-256):
```text
// Incluir tx_* na deteccao de producao real
const total = (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0) + 
              (Number(p.products_total) || 0) + (Number(p.tx_basic_total) || 0) + 
              (Number(p.tx_extra_total) || 0) + (Number(p.tx_products_total) || 0);
```

**Producao de hoje** -- incluir `tx_*` no total exibido (linhas 265-267):
```text
const todayTotal = (Number(todayProd.services_basic_total) || 0) +
                  (Number(todayProd.services_extra_total) || 0) +
                  (Number(todayProd.products_total) || 0) +
                  (Number(todayProd.tx_basic_total) || 0) +
                  (Number(todayProd.tx_extra_total) || 0) +
                  (Number(todayProd.tx_products_total) || 0);
```

**Usar `accumulatedCommission`** na atribuicao do stats (linha 285):
```text
accumulated_commission: accumulatedCommission,
```

### 2. ProductionHistory.tsx

**Interface** -- adicionar campos `tx_*`:
```text
interface DailyProduction {
  // ... campos existentes ...
  tx_basic_total?: number | null;
  tx_extra_total?: number | null;
  tx_products_total?: number | null;
}
```

**getServicesTotal** -- incluir `tx_*`:
```text
return (production.services_basic_total || 0) + (production.services_extra_total || 0)
     + (production.tx_basic_total || 0) + (production.tx_extra_total || 0);
```

**Celula de Produtos** -- somar ambas fontes:
```text
{formatCurrency((production.products_total || 0) + (production.tx_products_total || 0))}
```

### Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `src/components/dashboard/BarberDashboard.tsx` | Incluir `tx_*` em receita, dias, e producao de hoje; usar `commission_earned` do banco |
| `src/components/dashboard/barber/ProductionHistory.tsx` | Incluir `tx_*` na interface, servicos total e produtos |

### Impacto

- 54 barbeiros verao o faturamento e comissao corretos imediatamente
- Nenhuma alteracao no banco de dados necessaria (dados ja estao corretos)
- Blindagem com `(Number(x) || 0)` em todas as somas previne NaN
- Realtime listener ja ativo garante atualizacao em tempo real

