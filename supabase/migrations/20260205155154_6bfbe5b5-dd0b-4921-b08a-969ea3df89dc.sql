-- Function to recalculate commissions when barber rates change
CREATE OR REPLACE FUNCTION public.recalculate_barber_commissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date;
  v_today date;
BEGIN
  -- Only proceed if commission rates changed
  IF (OLD.services_commission = NEW.services_commission 
      AND OLD.products_commission = NEW.products_commission
      AND COALESCE(OLD.subscription_commission_rate, 0) = COALESCE(NEW.subscription_commission_rate, 0)) THEN
    RETURN NEW;
  END IF;

  v_today := CURRENT_DATE;
  v_month_start := date_trunc('month', v_today)::date;

  -- Update SERVICE transactions (only where catalog item has NO fixed commission)
  IF OLD.services_commission IS DISTINCT FROM NEW.services_commission THEN
    UPDATE sale_transactions st
    SET 
      commission_rate_used = NEW.services_commission,
      commission_amount = ROUND((st.price_sold * NEW.services_commission) / 100, 2)
    WHERE st.barber_id = NEW.id
      AND st.item_type = 'service'
      AND st.created_at >= v_month_start
      AND st.created_at < v_today + interval '1 day'
      AND (
        st.catalog_service_id IS NULL 
        OR NOT EXISTS (
          SELECT 1 FROM catalog_services cs 
          WHERE cs.id = st.catalog_service_id 
          AND cs.fixed_commission IS NOT NULL
        )
      );
  END IF;

  -- Update PRODUCT transactions (only where catalog item has NO fixed commission)
  IF OLD.products_commission IS DISTINCT FROM NEW.products_commission THEN
    UPDATE sale_transactions st
    SET 
      commission_rate_used = NEW.products_commission,
      commission_amount = ROUND((st.price_sold * NEW.products_commission) / 100, 2)
    WHERE st.barber_id = NEW.id
      AND st.item_type = 'product'
      AND st.created_at >= v_month_start
      AND st.created_at < v_today + interval '1 day'
      AND (
        st.catalog_product_id IS NULL 
        OR NOT EXISTS (
          SELECT 1 FROM catalog_products cp 
          WHERE cp.id = st.catalog_product_id 
          AND cp.fixed_commission IS NOT NULL
        )
      );
  END IF;

  -- Update SUBSCRIPTION transactions (subscriptions don't have fixed rates from catalog)
  IF COALESCE(OLD.subscription_commission_rate, 0) IS DISTINCT FROM COALESCE(NEW.subscription_commission_rate, 0) THEN
    UPDATE sale_transactions st
    SET 
      commission_rate_used = COALESCE(NEW.subscription_commission_rate, 0),
      commission_amount = ROUND((st.price_sold * COALESCE(NEW.subscription_commission_rate, 0)) / 100, 2)
    WHERE st.barber_id = NEW.id
      AND st.item_type = 'subscription'
      AND st.created_at >= v_month_start
      AND st.created_at < v_today + interval '1 day';
  END IF;

  RETURN NEW;
END;
$function$;

-- Create trigger that fires on commission rate changes
CREATE TRIGGER trigger_recalculate_barber_commissions
AFTER UPDATE OF services_commission, products_commission, subscription_commission_rate
ON public.barbers
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_barber_commissions();