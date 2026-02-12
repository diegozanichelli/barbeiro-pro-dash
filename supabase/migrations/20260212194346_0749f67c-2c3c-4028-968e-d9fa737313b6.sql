
-- 1. Drop the trigger
DROP TRIGGER IF EXISTS trg_ensure_daily_production_link ON sale_transactions;

-- 2. Drop the function
DROP FUNCTION IF EXISTS ensure_daily_production_link();

-- 3. Unlink sale_transactions from empty daily_productions on Feb 12
UPDATE sale_transactions
SET daily_production_id = NULL
WHERE daily_production_id IN (
  SELECT dp.id
  FROM daily_productions dp
  WHERE dp.date = '2026-02-12'
    AND COALESCE(dp.manual_basic_total, 0) = 0
    AND COALESCE(dp.manual_extra_total, 0) = 0
    AND COALESCE(dp.manual_products_total, 0) = 0
    AND COALESCE(dp.services_basic_total, 0) = 0
    AND COALESCE(dp.services_extra_total, 0) = 0
    AND COALESCE(dp.products_total, 0) = 0
    AND COALESCE(dp.services_total, 0) = 0
    AND dp.commission_earned = 0
    AND dp.confirmed_presence = false
    AND dp.presence_type IS NULL
);

-- 4. Delete empty daily_productions on Feb 12
DELETE FROM daily_productions
WHERE date = '2026-02-12'
  AND COALESCE(manual_basic_total, 0) = 0
  AND COALESCE(manual_extra_total, 0) = 0
  AND COALESCE(manual_products_total, 0) = 0
  AND COALESCE(services_basic_total, 0) = 0
  AND COALESCE(services_extra_total, 0) = 0
  AND COALESCE(products_total, 0) = 0
  AND COALESCE(services_total, 0) = 0
  AND commission_earned = 0
  AND confirmed_presence = false
  AND presence_type IS NULL;
