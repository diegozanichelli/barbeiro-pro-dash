-- Add is_active column to ranking_custom_names table
ALTER TABLE public.ranking_custom_names 
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Create index for faster filtering
CREATE INDEX idx_ranking_custom_names_active 
ON public.ranking_custom_names(organization_id, is_active);