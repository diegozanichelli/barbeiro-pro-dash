ALTER TABLE public.sale_transactions
  ADD COLUMN IF NOT EXISTS attribution_source text;

CREATE INDEX IF NOT EXISTS idx_sale_transactions_manager_rescue
  ON public.sale_transactions (organization_id, created_at)
  WHERE attribution_source = 'manager_rescue';