
-- Criar constraint UNIQUE se não existir (necessário para ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'daily_productions_barber_id_date_key'
  ) THEN
    ALTER TABLE public.daily_productions 
    ADD CONSTRAINT daily_productions_barber_id_date_key UNIQUE (barber_id, date);
  END IF;
END $$;

-- Trigger de segurança: auto-vincula transações órfãs
CREATE OR REPLACE FUNCTION public.ensure_daily_production_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date date;
  v_production_id uuid;
  v_org_id uuid;
BEGIN
  IF NEW.daily_production_id IS NOT NULL OR NEW.barber_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_date := (NEW.created_at AT TIME ZONE 'America/Manaus')::date;
  v_org_id := COALESCE(NEW.organization_id, (SELECT organization_id FROM barbers WHERE id = NEW.barber_id));

  INSERT INTO daily_productions (barber_id, organization_id, date, clients_count, services_count, products_count)
  VALUES (NEW.barber_id, v_org_id, v_date, 0, 0, 0)
  ON CONFLICT (barber_id, date) DO NOTHING;

  SELECT id INTO v_production_id
  FROM daily_productions
  WHERE barber_id = NEW.barber_id AND date = v_date;

  NEW.daily_production_id := v_production_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_daily_production_link
  BEFORE INSERT ON sale_transactions
  FOR EACH ROW
  EXECUTE FUNCTION ensure_daily_production_link();
