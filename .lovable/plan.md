

# Plano: Lançamento Atômico via RPC + Eliminação de Hardcode de Fuso

## Problemas Atuais

1. **Hardcode `-04:00`** no `created_at` das transações — frágil e quebra se houver unidades em outros fusos.
2. **3+ chamadas ao banco** no frontend (buscar production → inserir production → inserir transações) — lento em 3G/4G e sujeito a race conditions.
3. **`handleManualSale` ainda usa `.toISOString()`** na linha 809, contradizendo a padronização.
4. **Trigger `link_orphan_transactions`** usa comparação de timestamp em vez de data pura.

## Correções

### 1. Criar RPC `create_sale_and_ensure_production`

Função PostgreSQL que recebe:
- `p_organization_id`, `p_barber_id` (nullable para recepção), `p_date` (tipo `date`, apenas YYYY-MM-DD)
- `p_transactions` (tipo `jsonb[]` com os itens da venda)

Dentro de uma única transação SQL:
- Faz `INSERT ... ON CONFLICT (barber_id, date) DO NOTHING` + `SELECT` para obter o `daily_production_id`
- Insere todas as `sale_transactions` com o `daily_production_id` já vinculado
- Retorna o `daily_production_id` criado/encontrado

Isso elimina as 3 chamadas do frontend e garante atomicidade.

### 2. Corrigir `link_orphan_transactions` para comparação por data pura

Substituir:
```sql
AND created_at >= NEW.date::timestamp
AND created_at < v_next_day::timestamp
```
Por:
```sql
AND (created_at AT TIME ZONE 'America/Manaus')::date = NEW.date
```

Isso torna o trigger independente de fuso hardcoded.

### 3. Simplificar `QuickSaleModal.tsx`

- **`handleCartCheckout`**: Remover toda a lógica de buscar/criar `daily_production` (linhas 626-658). Substituir por uma única chamada `supabase.rpc('create_sale_and_ensure_production', { ... })`.
- **`handleManualSale`**: Mesma simplificação (linhas 752-781). Remover `.toISOString()` da linha 809.
- Enviar apenas `format(selectedDate, 'yyyy-MM-dd')` como string de data — sem horário, sem fuso.
- O `created_at` das transações será definido pelo banco (`DEFAULT now()` ou data pura + `12:00:00` calculado server-side).

### 4. Migração de resgate das 71 transações órfãs

```sql
UPDATE sale_transactions st
SET daily_production_id = dp.id
FROM daily_productions dp
WHERE st.daily_production_id IS NULL
  AND st.barber_id IS NOT NULL
  AND st.barber_id = dp.barber_id
  AND (st.created_at AT TIME ZONE 'America/Manaus')::date = dp.date;
```

Comparação data-por-data, sem depender de minutos/segundos.

---

## Detalhes Técnicos

| Componente | Mudança |
|---|---|
| **Migration SQL** | Criar RPC `create_sale_and_ensure_production` |
| **Migration SQL** | Corrigir trigger `link_orphan_transactions` (data pura) |
| **Migration SQL** | Vincular transações órfãs existentes |
| **QuickSaleModal.tsx** | Substituir lógica de upsert por chamada RPC única |
| **QuickSaleModal.tsx** | Remover hardcode `-04:00` e `.toISOString()` |

