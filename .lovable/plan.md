

# Limpeza Retroativa de Transacoes Duplicadas - Fevereiro 2026

## Diagnostico

- **241 producoes** afetadas com transacoes duplicadas
- **505 registros** a serem removidos (mantendo 1.317 registros corretos)
- **55 barbeiros** impactados com comissoes infladas

## Causa

Cada vez que o barbeiro editava um lancamento, o sistema tentava deletar as transacoes antigas (bloqueado pelo RLS) e inseria as novas em cima. O resultado: acumulo de registros duplicados.

## Estrategia de Limpeza

Para cada producao afetada:
1. Identificar o **ultimo lote** de edicao (timestamp mais recente = `MAX(created_at)`)
2. **Manter** apenas as transacoes desse ultimo lote (estado final correto apos a ultima edicao)
3. **Deletar** todas as transacoes anteriores (as que deveriam ter sido removidas pela edicao)

O trigger `recalculate_daily_production_from_transactions` sera disparado automaticamente apos cada exclusao, recalculando os totais e comissoes corretos na tabela `daily_productions`.

## Script SQL

A migration executara um unico comando DELETE usando CTEs:

```sql
-- 1. Identificar producoes com duplicatas
-- 2. Para cada uma, encontrar o timestamp do ultimo lote
-- 3. Deletar tudo que NAO pertence ao ultimo lote
-- O trigger recalcula comissoes automaticamente

WITH affected_productions AS (
  SELECT DISTINCT daily_production_id
  FROM sale_transactions
  WHERE source = 'barber' AND created_at >= '2026-02-01'
  GROUP BY daily_production_id, item_name, price_sold
  HAVING COUNT(*) > 1
),
latest_batch AS (
  SELECT daily_production_id, MAX(created_at) as max_ts
  FROM sale_transactions
  WHERE source = 'barber'
    AND daily_production_id IN (SELECT daily_production_id FROM affected_productions)
  GROUP BY daily_production_id
)
DELETE FROM sale_transactions
WHERE source = 'barber'
  AND daily_production_id IN (SELECT daily_production_id FROM affected_productions)
  AND created_at < (
    SELECT max_ts FROM latest_batch lb
    WHERE lb.daily_production_id = sale_transactions.daily_production_id
  );
```

## Seguranca

- Apenas transacoes com `source = 'barber'` sao afetadas (transacoes do gestor intactas)
- Apenas registros de fevereiro 2026 sao considerados
- O trigger reconstroi automaticamente os valores corretos de comissao

## Resultado Esperado

- 505 registros duplicados removidos
- Comissoes recalculadas automaticamente para os 55 barbeiros
- Jesus e todos os demais verao os valores corretos no dashboard imediatamente
