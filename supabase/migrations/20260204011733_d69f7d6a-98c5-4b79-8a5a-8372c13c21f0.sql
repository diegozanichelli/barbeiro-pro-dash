-- Allow reception/store sales without a specific barber
-- This is for subscriptions and other items sold by reception staff

-- 1. Make barber_id nullable for reception sales
ALTER TABLE public.sale_transactions 
ALTER COLUMN barber_id DROP NOT NULL;

-- 2. Make daily_production_id nullable for reception sales (no production record needed)
ALTER TABLE public.sale_transactions 
ALTER COLUMN daily_production_id DROP NOT NULL;

-- 3. Add index for filtering reception sales
CREATE INDEX IF NOT EXISTS idx_sale_transactions_reception 
ON public.sale_transactions (organization_id, item_type) 
WHERE barber_id IS NULL;