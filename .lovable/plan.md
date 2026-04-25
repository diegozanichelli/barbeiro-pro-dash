## Problema

Hoje o card **"Melhor Performance"** (aba Evolução → Comparativo de Unidades) mostra Ponta Negra como vencedora porque o cálculo é:

```
performance = (comissão da unidade ÷ meta da unidade) × 100
```

Isso mede apenas **% de atingimento de meta**, então uma unidade com metas baixas (ou barbeiros sem meta cadastrada) sempre ganha, mesmo faturando menos. Não reflete a realidade operacional.

## O que muda

O card "Melhor Performance" passa a representar **eficiência de conversão**: qual unidade extrai mais valor por cliente atendido.

**Fórmula:** `receita ÷ clientes atendidos = ticket médio`

Exemplo: Parque 10 atendeu 10 clientes e faturou R$ 12.000 → R$ 1.200/cliente vence Ponta Negra com 10 clientes e R$ 8.000 → R$ 800/cliente.

### Diferenciação dos 4 cards

Hoje há `Maior Receita`, `Maior Ticket`, `Mais Clientes` e `Melhor Performance`. Para evitar duplicação com "Maior Ticket", os papéis ficam assim:

| Card | O que mede | Para quem ganha |
|---|---|---|
| Maior Receita | Faturamento bruto (R$) | Quem vende mais em volume |
| Mais Clientes | Nº de atendimentos | Quem tem mais movimento |
| Maior Ticket | Receita ÷ clientes (sem filtro) | Maior valor por atendimento (mas pode ser unidade pequena com 1 venda alta) |
| **Melhor Performance** (novo) | **Ticket médio com piso mínimo** | **Quem converte melhor com volume relevante** |

### Regra do "piso mínimo"

Para o card "Melhor Performance" não premiar unidade que atendeu só 5 clientes no mês com 1 venda alta, aplicamos um filtro: **a unidade só concorre se atendeu pelo menos 30% dos clientes da unidade líder em volume**. Isso garante que a vencedora tenha movimento operacional real.

Caso nenhuma unidade atinja o piso (mês muito início ou dados zerados), cai no ticket médio puro como fallback.

### Texto do card

- Título: continua **"Melhor Performance"**
- Subtítulo (novo): **"Conversão de atendimento"**
- Linha grande: nome da unidade
- Linha pequena: `R$ X,XX por cliente · Y atendimentos`

## Arquivos afetados

- `src/components/dashboard/manager/UnitsComparison.tsx` — alterar a função `getLeader` para o card de performance e atualizar o JSX do card (linhas ~192-202 e ~316-327).

## Detalhes técnicos

```ts
// Substituir:
const performanceLeader = getLeader('performance');

// Por:
const conversionLeader = (() => {
  if (unitsMetrics.length === 0) return null;
  const maxClientes = Math.max(...unitsMetrics.map(u => u.clientes));
  const piso = maxClientes * 0.3;
  const candidatas = unitsMetrics.filter(u => u.clientes >= piso && u.clientes > 0);
  const pool = candidatas.length > 0 ? candidatas : unitsMetrics.filter(u => u.clientes > 0);
  if (pool.length === 0) return null;
  return pool.reduce((prev, cur) => cur.ticketMedio > prev.ticketMedio ? cur : prev);
})();
```

E o JSX do 4º card passa a exibir:
- `{conversionLeader?.unitName}`
- `R$ {conversionLeader?.ticketMedio.toFixed(2)} por cliente · {conversionLeader?.clientes} atendimentos`

Sem mudanças de banco de dados, sem mudanças nos outros cards, sem impacto em outros relatórios.
