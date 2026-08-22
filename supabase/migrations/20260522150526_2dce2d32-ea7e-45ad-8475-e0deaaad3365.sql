CREATE INDEX IF NOT EXISTS idx_sale_transactions_auto_recurring
  ON public.sale_transactions (organization_id, created_at)
  WHERE attribution_source = 'auto_recurring';