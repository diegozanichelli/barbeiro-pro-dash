
-- Add mobile_phone column to sale_transactions
ALTER TABLE public.sale_transactions ADD COLUMN mobile_phone TEXT;

-- Create index for fast phone lookups
CREATE INDEX idx_sale_transactions_mobile_phone ON public.sale_transactions(mobile_phone) WHERE mobile_phone IS NOT NULL;
