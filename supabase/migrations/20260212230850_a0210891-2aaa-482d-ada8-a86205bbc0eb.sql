
-- Trigger de Vínculo Tardio: quando barbeiro cria daily_production, vincula transações órfãs
CREATE OR REPLACE FUNCTION public.link_orphan_transactions()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_next_day date;
BEGIN
  v_next_day := NEW.date + interval '1 day';

  UPDATE sale_transactions
  SET daily_production_id = NEW.id
  WHERE barber_id = NEW.barber_id
    AND daily_production_id IS NULL
    AND created_at >= NEW.date::timestamp
    AND created_at < v_next_day::timestamp;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_orphans_on_production_start
  AFTER INSERT ON daily_productions
  FOR EACH ROW
  EXECUTE FUNCTION link_orphan_transactions();
