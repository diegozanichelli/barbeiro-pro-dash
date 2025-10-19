-- Add trigger to compute commission before insert/update
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_daily_productions_commission'
  ) THEN
    CREATE TRIGGER trg_daily_productions_commission
    BEFORE INSERT OR UPDATE ON public.daily_productions
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_commission();
  END IF;
END $$;

-- Keep updated_at in sync on updates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_daily_productions_updated_at'
  ) THEN
    CREATE TRIGGER update_daily_productions_updated_at
    BEFORE UPDATE ON public.daily_productions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;