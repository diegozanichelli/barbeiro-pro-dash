-- Enable realtime updates for daily_productions so DELETE/INSERT/UPDATE trigger UI refreshes
DO $$ BEGIN
  -- Ensure old row is available for DELETE events
  ALTER TABLE public.daily_productions REPLICA IDENTITY FULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  -- Add table to realtime publication if not already present
  ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_productions;
EXCEPTION WHEN others THEN NULL; END $$;