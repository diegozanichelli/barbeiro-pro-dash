
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
