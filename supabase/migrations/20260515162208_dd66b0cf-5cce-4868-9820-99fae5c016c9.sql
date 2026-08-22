
-- ============================================================
-- FASE A: Backfill e proteção de unit_id
-- ============================================================

-- A1. Backfill: preencher unit_id em sale_transactions a partir do barbeiro
UPDATE public.sale_transactions st
SET unit_id = b.unit_id
FROM public.barbers b
WHERE st.barber_id = b.id
  AND st.unit_id IS NULL
  AND b.unit_id IS NOT NULL;

-- A2. Trigger: popular unit_id automaticamente quando barber_id existe e unit_id está vazio
CREATE OR REPLACE FUNCTION public.fill_sale_transaction_unit_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_id IS NULL AND NEW.barber_id IS NOT NULL THEN
    SELECT unit_id INTO NEW.unit_id
    FROM public.barbers
    WHERE id = NEW.barber_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_sale_transaction_unit_id ON public.sale_transactions;
CREATE TRIGGER trg_fill_sale_transaction_unit_id
BEFORE INSERT OR UPDATE ON public.sale_transactions
FOR EACH ROW
EXECUTE FUNCTION public.fill_sale_transaction_unit_id();

-- ============================================================
-- FASE B: Backfill best-effort e proteção de mobile_phone
-- ============================================================

-- B1. Backfill best-effort: cruzar com clients por nome normalizado quando match único na org
WITH unique_matches AS (
  SELECT
    st.id AS tx_id,
    c.mobile_phone
  FROM public.sale_transactions st
  JOIN public.clients c
    ON c.organization_id = st.organization_id
   AND c.normalized_name IS NOT NULL
   AND c.normalized_name = lower(regexp_replace(trim(st.client_name), '\s+', ' ', 'g'))
  WHERE (st.mobile_phone IS NULL OR st.mobile_phone = '')
    AND st.client_name IS NOT NULL
    AND length(trim(st.client_name)) >= 3
  GROUP BY st.id, c.mobile_phone
  HAVING COUNT(*) = 1
)
UPDATE public.sale_transactions st
SET mobile_phone = um.mobile_phone
FROM unique_matches um
WHERE st.id = um.tx_id
  AND um.mobile_phone IS NOT NULL
  AND um.mobile_phone <> '';

-- B2. Trigger guard: bloquear inserção/edição de cliente novo ou nova adesão sem telefone
CREATE OR REPLACE FUNCTION public.enforce_mobile_phone_for_new_clients()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  v_phone := COALESCE(NEW.mobile_phone, '');

  IF NEW.is_new_client = true AND v_phone = '' THEN
    RAISE EXCEPTION 'Cliente novo precisa ter celular cadastrado (mobile_phone obrigatorio quando is_new_client=true)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.item_type = 'subscription'
     AND NEW.subscription_action = 'new'
     AND v_phone = '' THEN
    RAISE EXCEPTION 'Nova adesao de assinatura exige celular do cliente (mobile_phone obrigatorio)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_mobile_phone_for_new_clients ON public.sale_transactions;
CREATE TRIGGER trg_enforce_mobile_phone_for_new_clients
BEFORE INSERT OR UPDATE ON public.sale_transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mobile_phone_for_new_clients();
