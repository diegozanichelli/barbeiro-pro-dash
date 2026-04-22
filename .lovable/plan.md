

# Corrigir card "Meta Mensal da Equipe" zerado no Ao Vivo

## Diagnóstico (com prova SQL)

Para a Barbearia SGP-B em abril/2026:

| Fonte | Valor |
|---|---|
| **Card "Meta Mensal da Equipe" mostra** | **R$ 1.358** ❌ |
| Verdade — soma de `sale_transactions` `source='manager'` | R$ 127.065 ✅ |
| `daily_productions.tx_*` (agregado do gestor) | R$ 126.971 ✅ |
| `daily_productions.manual_*` (barbeiro) | R$ 1.358 |
| `daily_productions.services_basic_total + extra + products` | R$ 1.358 |

### Causa raiz

O `useMemo` `teamMonthlyGoal` em `LiveDashboard.tsx` (linhas 711–735) lê **só** os campos legados/manuais:

```ts
if ((Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0) > 0) {
  return s + (services_basic_total) + (services_extra_total) + (products_total);
}
return s + (services_total) + (products_total);
```

Após a deduplicação retroativa do Bug #1 (que executamos hoje), o trigger `recalculate_daily_production_from_transactions` espelha `services_basic_total = manual_basic_total`. Como as `source='barber'` foram deletadas para evitar duplicação, o `manual_*` virou quase zero, e o legado também. **A verdade do gestor está em `tx_*`, que o card não consulta.**

Outros componentes do sistema (RPCs `get_manager_report_stats`, `get_organization_rankings`) já aplicam a prioridade correta **tx > manual > legado**. Esse card ficou para trás.

## Solução

### Mudança 1 — Backend (consulta)
Em `LiveDashboard.tsx`, adicionar `tx_basic_total, tx_extra_total, tx_products_total` ao `select` de `monthProductions` (linhas 229–246) e à interface `MonthProduction` (linhas 86–98).

### Mudança 2 — Cálculo
Substituir a soma do `teamMonthlyGoal.totalEarned` (linhas 723–731) por lógica de prioridade:

```ts
const totalEarned = relevantBarbers.reduce((sum, b) => {
  const barberProds = monthProductions.filter(p => p.barber_id === b.id);
  return sum + barberProds.reduce((s, p) => {
    const txTotal = (Number(p.tx_basic_total) || 0)
      + (Number(p.tx_extra_total) || 0)
      + (Number(p.tx_products_total) || 0);
    if (txTotal > 0) return s + txTotal;                  // 1ª: gestor
    
    const splitTotal = (Number(p.services_basic_total) || 0)
      + (Number(p.services_extra_total) || 0)
      + (Number(p.products_total) || 0);
    if (splitTotal > 0) return s + splitTotal;            // 2ª: itemizado/manual
    
    return s + (Number(p.services_total) || 0) + (Number(p.products_total) || 0); // 3ª: legado
  }, 0);
}, 0);
```

## Resultado esperado (SGP-B abril/2026)

| Antes | Depois |
|---|---|
| Vendas: R$ 1.358 | Vendas: **R$ ~127.000** |
| % barra: ~1% | % barra: valor real |

## Arquivos afetados

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/components/dashboard/manager/LiveDashboard.tsx` | Adicionar `tx_*` ao select e à interface; aplicar prioridade tx > split > legado no `teamMonthlyGoal.totalEarned` |

## Impacto / risco

- **Zero migration**, zero schema.
- **Zero impacto** nas outras orgs — quem ainda não tem `tx_*` populado cai automaticamente no fallback (split/legado) com mesmo valor de hoje.
- Alinha o card à mesma regra usada por todos os outros relatórios (`tx > manual > legado`).
- Resolve também o caso da Atlas Barbearia (card_calc=0, mas tem R$ 25.281 em tx).

## Pergunta antes de implementar

Verifiquei outros 3 lugares que podem ter o mesmo bug — me diz se você quer corrigir tudo no mesmo passo:

1. **`monthRevenueTotal`/`monthClientsTotal`** (KPIs "Faturamento do mês" e "Ticket médio do mês" do Ao Vivo) — leio agora pra confirmar, mas provavelmente sofre do mesmo problema.
2. **`MonthlyOccurrencesSummary`** — pode estar lendo só legado também.

Confirma se aplico **só o card "Meta Mensal da Equipe"** agora, ou faço varredura nos 3 e corrijo todos juntos?

