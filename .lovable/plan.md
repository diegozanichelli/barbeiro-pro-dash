

# Corrigir contagem de "Clientes Novos" e alinhar métricas de assinaturas

## Diagnóstico (com prova SQL — abril/2026, todas as orgs)

| Onde | Card | Hoje | Verdade |
|---|---|---|---|
| Inteligência | "Novas Assinaturas" | 62 (todas com `action='new'`) | ✅ correto |
| Inteligência | Funil "Clientes Novos Atendidos" | 1.903 (celulares únicos) | ✅ correto |
| Inteligência | Funil "Assinaturas Vendidas" | 57 (`new` + cliente novo) | ✅ correto |
| **Performance** | **Coluna "Clientes Novos"** | **1.907 (linhas)** | ❌ **deveria ser pessoas únicas** |
| **Performance** | **Coluna "Assinaturas Vendidas"** | **40 (`new` + `is_new_client`)** | ❌ **rótulo enganoso, deveria refletir o mesmo critério da aba Inteligência** |

### Causas

1. **`SubscriptionPerformanceReport.tsx` (linha 97-99)** conta "novos clientes" incrementando uma variável a cada **transação** com `is_new_client=true`. Um cliente novo que tomou 3 itens vira 3.
2. **Mesmo arquivo, linhas 103-109** define "Assinaturas Vendidas" como `action='new' AND is_new_client=true`. Isso **subconta**: quem já era cliente da casa e pegou a 1ª assinatura também é uma adesão nova legítima.
3. **Linha 74** filtra `barber_id IS NOT NULL`, **excluindo assinaturas da recepção** (sem barbeiro). Esses números somem dos relatórios.

## Solução

### Mudança 1 — `SubscriptionPerformanceReport.fetchPerformanceData`

Trocar contagem por linhas → contagem por **celulares únicos**, e alinhar critério de "Assinaturas Vendidas" com a aba Inteligência (`action='new'`, sem exigir `is_new_client`).

```ts
// trocar select para incluir mobile_phone
.select(`barber_id, is_new_client, item_type, subscription_action,
         mobile_phone,
         barbers!sale_transactions_barber_id_fkey(name, units(name))`)

// trocar acumulador para Set de telefones
const barberMap = new Map<string, {
  name: string; unit: string;
  newClientPhones: Set<string>;
  subscriptions: number;
}>();

transactions?.forEach((tx) => {
  if (!tx.barber_id) return;
  const existing = barberMap.get(tx.barber_id) || {
    name: ..., unit: ...,
    newClientPhones: new Set<string>(),
    subscriptions: 0,
  };
  if (tx.is_new_client && tx.mobile_phone) {
    existing.newClientPhones.add(tx.mobile_phone);
  }
  // alinhado com Inteligência → conta TODA assinatura nova
  if (tx.item_type === "subscription" && tx.subscription_action === "new") {
    existing.subscriptions++;
  }
  barberMap.set(tx.barber_id, existing);
});

// usar phones.size na conversão
newClientsCount: data.newClientPhones.size,
```

### Mudança 2 — Renomear coluna para clareza

A coluna "Assinaturas Vendidas" passa a contar **todas** as adesões novas do barbeiro (independente de cliente novo/casa). O texto do card resumo "Conversão" continua `subs / clientes_novos_unicos`, agora consistente com Inteligência.

### Mudança 3 — Recepção

Manter o filtro `barber_id IS NOT NULL` (relatório é por barbeiro), **mas** adicionar uma linha agregada "Recepção / Sem barbeiro" no rodapé da tabela quando houver assinaturas com `barber_id=NULL` no período. Isso devolve as 5 assinaturas de balcão à visibilidade do gestor sem quebrar a estrutura por profissional.

## Resultado esperado (org do usuário, abril/2026)

| Antes | Depois |
|---|---|
| Clientes Novos: 282 (linhas) | Clientes Novos: ~ pessoas únicas reais |
| Assinaturas Vendidas: 23 | Assinaturas Vendidas: ~60 (alinhado com Inteligência) |
| Assinaturas de recepção: invisíveis | Linha "Recepção" no rodapé |

## Arquivos afetados

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `src/components/dashboard/manager/SubscriptionPerformanceReport.tsx` | `fetchPerformanceData`: trocar contagem por `Set<mobile_phone>`; remover `is_new_client` da contagem de assinaturas; adicionar query agregada para vendas sem barbeiro e linha "Recepção" na tabela |

## Impacto / risco

- **Zero migration**, zero schema.
- **Zero impacto** em outros relatórios (Inteligência continua igual; ela já está correta).
- Após o fix, **Performance e Inteligência mostram o mesmo número** de assinaturas no período — fim da confusão.
- Conversão por barbeiro fica mais justa (denominador = pessoas, não itens).

