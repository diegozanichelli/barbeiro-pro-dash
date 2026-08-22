
CREATE OR REPLACE FUNCTION public.calculate_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_services_commission_rate DECIMAL(5,2);
  v_products_commission_rate DECIMAL(5,2);
  v_services_total_to_calc NUMERIC;
  v_products_total_to_calc NUMERIC;
  v_commission_from_services NUMERIC;
  v_commission_from_products NUMERIC;
BEGIN
  SELECT services_commission, products_commission
  INTO v_services_commission_rate, v_products_commission_rate
  FROM public.barbers WHERE id = NEW.barber_id;

  -- PRIORIDADE: tx (gestor) > manual (barbeiro) > legado
  IF COALESCE(NEW.tx_basic_total, 0) + COALESCE(NEW.tx_extra_total, 0) + COALESCE(NEW.tx_products_total, 0) > 0 THEN
    -- Usar dados do gestor (AO VIVO)
    v_services_total_to_calc := COALESCE(NEW.tx_basic_total, 0) + COALESCE(NEW.tx_extra_total, 0);
    v_products_total_to_calc := COALESCE(NEW.tx_products_total, 0);
  ELSIF (NEW.services_basic_total IS NOT NULL) OR (NEW.services_extra_total IS NOT NULL) THEN
    v_services_total_to_calc := COALESCE(NEW.services_basic_total, 0) + COALESCE(NEW.services_extra_total, 0);
    v_products_total_to_calc := COALESCE(NEW.products_total, 0);
  ELSE
    v_services_total_to_calc := COALESCE(NEW.services_total, 0);
    v_products_total_to_calc := COALESCE(NEW.products_total, 0);
  END IF;

  v_commission_from_services := COALESCE(v_services_total_to_calc, 0) * COALESCE(v_services_commission_rate, 0) / 100;
  v_commission_from_products := COALESCE(v_products_total_to_calc, 0) * COALESCE(v_products_commission_rate, 0) / 100;

  NEW.commission_earned := COALESCE(v_commission_from_services, 0) + COALESCE(v_commission_from_products, 0);
  RETURN NEW;
END;
$function$;
