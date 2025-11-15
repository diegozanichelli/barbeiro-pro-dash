-- Drop the insecure is_manager() function
-- It lacks SET search_path protection and has been replaced with direct queries
DROP FUNCTION IF EXISTS public.is_manager();