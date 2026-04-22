-- Backfill: mark the first appearance of each mobile_phone (per organization)
-- as is_new_client = true, restricted to manager-sourced sales.
-- This corrects historical reports where only subscription sales were flagged.
WITH first_visit AS (
  SELECT DISTINCT ON (organization_id, mobile_phone)
    id
  FROM public.sale_transactions
  WHERE mobile_phone IS NOT NULL
    AND mobile_phone <> ''
    AND source = 'manager'
  ORDER BY organization_id, mobile_phone, created_at ASC
)
UPDATE public.sale_transactions st
SET is_new_client = true
FROM first_visit fv
WHERE st.id = fv.id
  AND st.is_new_client IS DISTINCT FROM true;