
CREATE OR REPLACE FUNCTION public.normalize_mobile_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mobile_phone IS NOT NULL THEN
    NEW.mobile_phone := regexp_replace(NEW.mobile_phone, '[^0-9]', '', 'g');
    IF NEW.mobile_phone = '' THEN
      NEW.mobile_phone := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_phone_clients ON public.clients;
CREATE TRIGGER trg_normalize_phone_clients
BEFORE INSERT OR UPDATE OF mobile_phone ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.normalize_mobile_phone();

DROP TRIGGER IF EXISTS trg_normalize_phone_sale_transactions ON public.sale_transactions;
CREATE TRIGGER trg_normalize_phone_sale_transactions
BEFORE INSERT OR UPDATE OF mobile_phone ON public.sale_transactions
FOR EACH ROW EXECUTE FUNCTION public.normalize_mobile_phone();
