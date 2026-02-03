
# Plano: Corrigir Cálculo de "Cortes Restantes" no Dashboard Ao Vivo

## Problema Identificado

O cálculo de "Faltam X cortes para bater a meta" está incorreto porque:

1. **Ticket médio padrão muito baixo**: Quando não há clientes registrados hoje, o sistema usa R$ 50,00 como fallback
2. **Cálculo inconsistente**: `357,14 / 50 = 7,14` → arredonda para **8 cortes**, quando na verdade deveria considerar o ticket real (ex: R$ 80)

### Exemplo do Werlen:
- Meta do dia: R$ 357,14
- Ticket médio real: ~R$ 80 (corte padrão)
- Cortes necessários corretos: `357,14 / 80 = 4,5` → **5 cortes**
- Sistema atual (bug): `357,14 / 50 = 7,14` → **8 cortes**

---

## Solução Proposta

### 1. Buscar Ticket Médio Histórico do Mês

Usar os dados de produção mensal (`monthProductions`) para calcular o ticket médio real baseado no histórico:

```text
Lógica:
1. Somar faturamento total do mês (da unidade/organização)
2. Somar clientes atendidos no mês
3. Calcular: faturamento_mes / clientes_mes
4. Se não houver histórico: usar fallback mais realista (R$ 70-80)
```

### 2. Alterações no LiveDashboard.tsx

**A. Expandir dados buscados do mês** (linhas ~118-128)

Adicionar campos `services_total`, `services_basic_total`, `services_extra_total`, `products_total`, e `clients_count` na query de `monthProductionsData`:

```typescript
// Buscar mais dados do mês para calcular ticket médio histórico
const { data: monthProductionsData } = await supabase
  .from("daily_productions")
  .select(`
    barber_id, 
    commission_earned, 
    confirmed_presence,
    services_total,
    services_basic_total,
    services_extra_total,
    products_total,
    clients_count
  `)
  .eq("organization_id", organizationId)
  .gte("date", startOfMonth)
  .lte("date", todayStr);
```

**B. Atualizar interface MonthProduction** (linhas ~39-43)

```typescript
interface MonthProduction {
  barber_id: string;
  commission_earned: number;
  confirmed_presence: boolean;
  services_total: number;
  services_basic_total: number | null;
  services_extra_total: number | null;
  products_total: number;
  clients_count: number;
}
```

**C. Corrigir função getAverageTicket()** (linhas ~270-281)

```typescript
const getAverageTicket = () => {
  // Primeiro: tentar calcular do mês inteiro (histórico mais robusto)
  const filteredMonthProductions = selectedUnit === "all"
    ? monthProductions
    : monthProductions.filter((p) => {
        const barber = barbers.find((b) => b.id === p.barber_id);
        return barber?.unit_id === selectedUnit;
      });

  const totalClientsMonth = filteredMonthProductions.reduce(
    (sum, p) => sum + (p.clients_count || 0), 
    0
  );
  
  const totalRevenueMonth = filteredMonthProductions.reduce((sum, p) => {
    const servicesTotal =
      p.services_basic_total !== null || p.services_extra_total !== null
        ? (p.services_basic_total || 0) + (p.services_extra_total || 0)
        : p.services_total || 0;
    return sum + servicesTotal + (p.products_total || 0);
  }, 0);

  // Se há histórico no mês, usar ticket médio mensal
  if (totalClientsMonth > 0) {
    return totalRevenueMonth / totalClientsMonth;
  }

  // Fallback: usar dados de hoje
  const filteredProductions = selectedUnit === "all"
    ? productions
    : productions.filter((p) => {
        const barber = barbers.find((b) => b.id === p.barber_id);
        return barber?.unit_id === selectedUnit;
      });

  const totalClients = filteredProductions.reduce(
    (sum, p) => sum + p.clients_count, 
    0
  );
  
  if (totalClients > 0) {
    return totalRevenue / totalClients;
  }

  // Fallback final: valor padrão mais realista (R$ 70)
  return 70;
};
```

---

## Resumo das Mudanças

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/manager/LiveDashboard.tsx` | Expandir query de produções mensais, atualizar interface, corrigir `getAverageTicket()` |

## Resultado Esperado

- **Antes**: Werlen com meta R$ 357,14 → "Faltam 8 cortes" (ticket R$ 50)
- **Depois**: Werlen com meta R$ 357,14 → "Faltam 5 cortes" (ticket ~R$ 75 baseado no histórico real)

O sistema passará a usar o ticket médio **histórico do mês** para calcular quantos cortes faltam, tornando a informação muito mais precisa e útil para o gestor.

---

## Seção Técnica

### Fluxo de Dados Atualizado

```text
┌─────────────────────────────────────────────────────────────────┐
│                    getAverageTicket()                          │
├─────────────────────────────────────────────────────────────────┤
│ 1. Filtrar produções do mês (por unidade se aplicável)         │
│ 2. Somar faturamento total do mês                              │
│ 3. Somar total de clientes do mês                              │
│ 4. SE clientes_mes > 0:                                        │
│    └─→ Retorna: faturamento_mes / clientes_mes                 │
│ 5. SENÃO, tentar com dados de hoje                             │
│ 6. SE clientes_hoje > 0:                                       │
│    └─→ Retorna: faturamento_hoje / clientes_hoje               │
│ 7. SENÃO:                                                      │
│    └─→ Retorna: R$ 70 (fallback realista)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Dependências de Dados

- `monthProductions`: Precisa incluir campos de faturamento e clientes
- Nenhuma mudança no banco de dados necessária
- Compatível com lógica existente de filtro por unidade
