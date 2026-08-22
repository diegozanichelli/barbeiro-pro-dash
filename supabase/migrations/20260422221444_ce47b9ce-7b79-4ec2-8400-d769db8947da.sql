CREATE OR REPLACE FUNCTION public.create_sale_and_ensure_production(
  p_organization_id uuid,
  p_barber_id uuid DEFAULT NULL::uuid,
  p_date date DEFAULT CURRENT_DATE,
  p_transactions jsonb DEFAULT '[]'::jsonb,
  p_source text DEFAULT 'manager'::text,
  p_unit_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_production_id uuid;
  v_tx jsonb;
  v_item_type text;
  v_fixed_rate numeric;
  v_barber_rate numeric;
  v_final_rate numeric;
  v_commission_amount numeric;
  v_price_sold numeric;
  v_created_at timestamptz;
  v_unit_id uuid;
BEGIN
  -- Resolve unit: explicit param > barber's unit > NULL
  v_unit_id := COALESCE(
    p_unit_id,
    (SELECT unit_id FROM barbers WHERE id = p_barber_id)
  );

  -- Use current time but on the target date for uniqueness per checkout
  v_created_at := (p_date || ' ' || to_char(now(), 'HH24:MI:SS'))::timestamp AT TIME ZONE 'America/Manaus';

  -- Step 1: Ensure daily_production exists (only if barber specified)
  IF p_barber_id IS NOT NULL THEN
    INSERT INTO daily_productions (
      organization_id, barber_id, date,
      services_total, products_total, clients_count,
      services_count, products_count, commission_earned,
      confirmed_presence
    ) VALUES (
      p_organization_id, p_barber_id, p_date,
      0, 0, 0, 0, 0, 0, false
    )
    ON CONFLICT (barber_id, date) DO NOTHING;

    SELECT id INTO v_production_id
    FROM daily_productions
    WHERE barber_id = p_barber_id AND date = p_date;
  END IF;

  -- Step 2: Insert each transaction
  FOR v_tx IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_item_type := v_tx->>'item_type';
    v_price_sold := (v_tx->>'price_sold')::numeric;

    -- Calculate commission
    v_fixed_rate := NULL;
    v_barber_rate := NULL;

    IF v_item_type = 'service' AND v_tx->>'catalog_service_id' IS NOT NULL THEN
      SELECT fixed_commission INTO v_fixed_rate
      FROM catalog_services WHERE id = (v_tx->>'catalog_service_id')::uuid;
    ELSIF v_item_type = 'product' AND v_tx->>'catalog_product_id' IS NOT NULL THEN
      SELECT fixed_commission INTO v_fixed_rate
      FROM catalog_products WHERE id = (v_tx->>'catalog_product_id')::uuid;
    END IF;

    IF v_fixed_rate IS NULL AND p_barber_id IS NOT NULL THEN
      IF v_item_type = 'service' THEN
        SELECT services_commission INTO v_barber_rate FROM barbers WHERE id = p_barber_id;
      ELSIF v_item_type = 'product' THEN
        SELECT products_commission INTO v_barber_rate FROM barbers WHERE id = p_barber_id;
      ELSIF v_item_type = 'subscription' THEN
        SELECT COALESCE(subscription_commission_rate, 0) INTO v_barber_rate FROM barbers WHERE id = p_barber_id;
      END IF;
      v_final_rate := COALESCE(v_barber_rate, 50);
    ELSIF v_fixed_rate IS NOT NULL THEN
      v_final_rate := v_fixed_rate;
    ELSE
      v_final_rate := 0;
    END IF;

    v_commission_amount := ROUND((v_price_sold * v_final_rate) / 100, 2);

    INSERT INTO sale_transactions (
      organization_id, barber_id, daily_production_id,
      item_type, item_name, service_category,
      catalog_service_id, catalog_product_id,
      price_sold, commission_rate_used, commission_amount,
      is_new_client, client_name, mobile_phone,
      source, subscription_plan_id, subscription_action, downgrade_reason,
      unit_id,
      created_at
    ) VALUES (
      p_organization_id,
      p_barber_id,
      v_production_id,
      v_item_type,
      v_tx->>'item_name',
      v_tx->>'service_category',
      CASE WHEN v_tx->>'catalog_service_id' IS NOT NULL THEN (v_tx->>'catalog_service_id')::uuid ELSE NULL END,
      CASE WHEN v_tx->>'catalog_product_id' IS NOT NULL THEN (v_tx->>'catalog_product_id')::uuid ELSE NULL END,
      v_price_sold,
      v_final_rate,
      v_commission_amount,
      COALESCE((v_tx->>'is_new_client')::boolean, false),
      v_tx->>'client_name',
      v_tx->>'mobile_phone',
      p_source,
      CASE WHEN v_tx->>'subscription_plan_id' IS NOT NULL THEN (v_tx->>'subscription_plan_id')::uuid ELSE NULL END,
      v_tx->>'subscription_action',
      v_tx->>'downgrade_reason',
      v_unit_id,
      v_created_at
    );
  END LOOP;

  RETURN v_production_id;
END;
$function$;