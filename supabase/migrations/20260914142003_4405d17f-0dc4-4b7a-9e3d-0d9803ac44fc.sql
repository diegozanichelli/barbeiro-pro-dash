ALTER TABLE public.monthly_goals
  ADD COLUMN IF NOT EXISTS target_new_clubs integer,
  ADD COLUMN IF NOT EXISTS target_products_revenue numeric,
  ADD COLUMN IF NOT EXISTS target_extras_per_client numeric,
  ADD COLUMN IF NOT EXISTS target_frequency_uplift_pct numeric,
  ADD COLUMN IF NOT EXISTS target_productivity_pct numeric;