-- Ensure correct commission calculation and trigger on daily_productions
CREATE OR REPLACE FUNCTION public.calculate_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_services_commission_rate DECIMAL(5,2);
  v_products_commission_rate DECIMAL(5,2);
  v_services_total_to_calc NUMERIC;
  v_commission_from_services NUMERIC;
  v_commission_from_products NUMERIC;
BEGIN
  -- 1) Fetch barber commission rates
  SELECT services_commission, products_commission
  INTO v_services_commission_rate, v_products_commission_rate
  FROM public.barbers
  WHERE id = NEW.barber_id;

  -- 2) Determine which services total to use (retrocompatible)
  IF (NEW.services_basic_total IS NOT NULL) OR (NEW.services_extra_total IS NOT NULL) THEN
    -- New record style: sum Basic + Extra
    v_services_total_to_calc := COALESCE(NEW.services_basic_total, 0) + COALESCE(NEW.services_extra_total, 0);
  ELSE
    -- Old record style: use legacy services_total
    v_services_total_to_calc := COALESCE(NEW.services_total, 0);
  END IF;

  -- 3) Calculate commissions separately
  v_commission_from_services := COALESCE(v_services_total_to_calc, 0) * COALESCE(v_services_commission_rate, 0) / 100;
  v_commission_from_products := COALESCE(NEW.products_total, 0) * COALESCE(v_products_commission_rate, 0) / 100;

  -- 4) Sum at the end
  NEW.commission_earned := COALESCE(v_commission_from_services, 0) + COALESCE(v_commission_from_products, 0);

  RETURN NEW;
END;
$$;

-- Recreate trigger to ensure it exists and uses the latest function
DROP TRIGGER IF EXISTS calculate_commission_trigger ON public.daily_productions;
CREATE TRIGGER calculate_commission_trigger
BEFORE INSERT OR UPDATE ON public.daily_productions
FOR EACH ROW
EXECUTE FUNCTION public.calculate_commission();