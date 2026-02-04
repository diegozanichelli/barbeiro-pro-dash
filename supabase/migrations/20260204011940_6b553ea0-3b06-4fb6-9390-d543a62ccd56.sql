-- Update trigger to handle NULL daily_production_id (reception sales)
CREATE OR REPLACE FUNCTION public.sync_daily_production_from_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_production_id uuid;
  v_basic_total NUMERIC;
  v_extra_total NUMERIC;
  v_products_total NUMERIC;
  v_commission_total NUMERIC;
  v_services_count INTEGER;
  v_products_count INTEGER;
BEGIN
  -- Determinar qual daily_production_id usar baseado no tipo de operação
  IF TG_OP = 'DELETE' THEN
    v_production_id := OLD.daily_production_id;
  ELSE
    v_production_id := NEW.daily_production_id;
  END IF;

  -- Se daily_production_id é NULL (venda da recepção), não precisa sincronizar
  IF v_production_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Calcular totais das transações restantes
  SELECT 
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'basic' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'service' AND service_category = 'extra' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'product' THEN price_sold ELSE 0 END), 0),
    COALESCE(SUM(commission_amount), 0),
    COUNT(CASE WHEN item_type = 'service' THEN 1 END),
    COUNT(CASE WHEN item_type = 'product' THEN 1 END)
  INTO v_basic_total, v_extra_total, v_products_total, v_commission_total, v_services_count, v_products_count
  FROM public.sale_transactions
  WHERE daily_production_id = v_production_id;

  -- Atualizar daily_productions
  UPDATE public.daily_productions
  SET 
    services_basic_total = v_basic_total,
    services_extra_total = v_extra_total,
    products_total = v_products_total,
    commission_earned = v_commission_total,
    services_count = v_services_count,
    products_count = v_products_count,
    updated_at = now()
  WHERE id = v_production_id;

  -- Retornar o registro apropriado
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;