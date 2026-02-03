-- Add championship_name column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN championship_name TEXT NOT NULL DEFAULT 'Campeonato Anual';