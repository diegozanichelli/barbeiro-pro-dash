-- Adicionar novas colunas para divisão de serviços (nullable para retrocompatibilidade)
ALTER TABLE public.daily_productions
ADD COLUMN services_basic_total numeric DEFAULT NULL,
ADD COLUMN services_extra_total numeric DEFAULT NULL;

-- Atualizar a função de cálculo de comissão para ser retrocompatível
CREATE OR REPLACE FUNCTION public.calculate_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_services_commission DECIMAL(5,2);
  v_products_commission DECIMAL(5,2);
  v_services_total_calc NUMERIC;
BEGIN
  -- Buscar as comissões do barbeiro
  SELECT services_commission, products_commission
  INTO v_services_commission, v_products_commission
  FROM public.barbers
  WHERE id = NEW.barber_id;

  -- Lógica retrocompatível para calcular o total de serviços
  IF (NEW.services_basic_total IS NOT NULL) OR (NEW.services_extra_total IS NOT NULL) THEN
    -- É um LANÇAMENTO NOVO: usar os novos campos
    v_services_total_calc := COALESCE(NEW.services_basic_total, 0) + COALESCE(NEW.services_extra_total, 0);
  ELSE
    -- É um LANÇAMENTO ANTIGO: usar o campo services_total
    v_services_total_calc := COALESCE(NEW.services_total, 0);
  END IF;

  -- Calcular comissão total do dia
  NEW.commission_earned := 
    (v_services_total_calc * v_services_commission / 100) +
    (NEW.products_total * v_products_commission / 100);

  RETURN NEW;
END;
$function$;