
-- 1. Atualizar trigger calculate_commission para ignorar tx_* (apenas produção do barbeiro)
CREATE OR REPLACE FUNCTION public.calculate_commission()
RETURNS TRIGGER AS $$
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

  -- APENAS produção do barbeiro (sem tx_*)
  IF (NEW.services_basic_total IS NOT NULL) OR (NEW.services_extra_total IS NOT NULL) THEN
    v_services_total_to_calc := COALESCE(NEW.services_basic_total, 0) + COALESCE(NEW.services_extra_total, 0);
  ELSE
    v_services_total_to_calc := COALESCE(NEW.services_total, 0);
  END IF;

  v_products_total_to_calc := COALESCE(NEW.products_total, 0);

  v_commission_from_services := COALESCE(v_services_total_to_calc, 0) * COALESCE(v_services_commission_rate, 0) / 100;
  v_commission_from_products := COALESCE(v_products_total_to_calc, 0) * COALESCE(v_products_commission_rate, 0) / 100;

  NEW.commission_earned := COALESCE(v_commission_from_services, 0) + COALESCE(v_commission_from_products, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 2. Recalcular todas as comissões de fevereiro (forçar trigger)
UPDATE daily_productions
SET updated_at = now()
WHERE date >= '2026-02-01' AND date <= '2026-02-12';
