CREATE OR REPLACE FUNCTION public.get_barber_report_range(
  p_barber_id uuid,
  p_start date,
  p_end date,
  p_unit_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_result jsonb;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  v_org := get_user_organization(auth.uid());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'User does not belong to any organization';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM barbers b WHERE b.id = p_barber_id AND b.organization_id = v_org) THEN
    RAISE EXCEPTION 'Barber not found in organization';
  END IF;

  v_start := (p_start::text || ' 00:00:00-04')::timestamptz;
  v_end   := (p_end::text   || ' 23:59:59.999-04')::timestamptz;

  WITH tx AS (
    SELECT t.*,
      CASE
        WHEN t.item_type = 'product' THEN 'product'
        WHEN t.item_type = 'subscription' THEN 'subscription'
        ELSE 'service'
      END AS cat
    FROM sale_transactions t
    WHERE t.organization_id = v_org
      AND t.barber_id = p_barber_id
      AND t.created_at BETWEEN v_start AND v_end
      AND (p_unit_id IS NULL OR t.unit_id = p_unit_id)
      AND COALESCE(t.subscription_action, '') <> 'legacy_import'
  ),
  totals AS (
    SELECT
      COALESCE(SUM(price_sold), 0) AS revenue,
      COALESCE(SUM(commission_amount), 0) AS commission,
      COUNT(DISTINCT created_at) AS visits,
      COUNT(DISTINCT NULLIF(mobile_phone, '')) AS unique_clients,
      COALESCE(SUM(price_sold) FILTER (WHERE cat <> 'subscription'), 0) AS operational_revenue
    FROM tx
  ),
  by_cat AS (
    SELECT cat,
      COUNT(*) AS qty,
      COALESCE(SUM(price_sold), 0) AS revenue,
      COALESCE(SUM(commission_amount), 0) AS commission
    FROM tx GROUP BY cat
  ),
  by_subcat AS (
    SELECT COALESCE(service_category, 'basic') AS subcat,
      COUNT(*) AS qty, COALESCE(SUM(price_sold), 0) AS revenue
    FROM tx WHERE cat = 'service' GROUP BY 1
  ),
  by_item AS (
    SELECT cat, COALESCE(NULLIF(item_name, ''), 'Sem nome') AS item_name,
      COUNT(*) AS qty, COALESCE(SUM(price_sold), 0) AS revenue,
      COALESCE(SUM(commission_amount), 0) AS commission
    FROM tx GROUP BY 1, 2
  ),
  client_items AS (
    SELECT COALESCE(NULLIF(mobile_phone, ''), '__sem_telefone__') AS phone_key,
      COALESCE(NULLIF(item_name, ''), 'Sem nome') AS item_name,
      COUNT(*) AS qty, COALESCE(SUM(price_sold), 0) AS revenue
    FROM tx GROUP BY 1, 2
  ),
  client_totals AS (
    SELECT COALESCE(NULLIF(t.mobile_phone, ''), '__sem_telefone__') AS phone_key,
      MAX(NULLIF(t.mobile_phone, '')) AS phone,
      COUNT(DISTINCT t.created_at) AS visits,
      COALESCE(SUM(t.price_sold), 0) AS revenue,
      MIN(t.created_at) AS first_visit,
      MAX(t.created_at) AS last_visit,
      bool_or(t.is_new_client IS TRUE) AS was_new
    FROM tx t GROUP BY 1
  ),
  clients_agg AS (
    SELECT ct.phone_key, ct.phone, ct.visits, ct.revenue, ct.first_visit, ct.last_visit, ct.was_new,
      COALESCE(c.name, 'Cliente sem cadastro') AS client_name,
      (SELECT jsonb_agg(jsonb_build_object('item_name', ci.item_name, 'qty', ci.qty, 'revenue', ci.revenue)
              ORDER BY ci.revenue DESC)
       FROM client_items ci WHERE ci.phone_key = ct.phone_key) AS items
    FROM client_totals ct
    LEFT JOIN LATERAL (
      SELECT cl.name FROM clients cl
      WHERE cl.organization_id = v_org AND cl.mobile_phone = ct.phone
      LIMIT 1
    ) c ON TRUE
  ),
  sold_services AS (SELECT DISTINCT catalog_service_id FROM tx WHERE catalog_service_id IS NOT NULL),
  sold_products AS (SELECT DISTINCT catalog_product_id FROM tx WHERE catalog_product_id IS NOT NULL),
  never_sold AS (
    SELECT jsonb_build_object('name', s.name, 'kind', 'service', 'category', s.category, 'price', s.default_price) AS obj
    FROM catalog_services s
    WHERE s.organization_id = v_org AND s.is_active
      AND s.id NOT IN (SELECT catalog_service_id FROM sold_services)
    UNION ALL
    SELECT jsonb_build_object('name', p.name, 'kind', 'product', 'category', NULL, 'price', p.default_price)
    FROM catalog_products p
    WHERE p.organization_id = v_org AND p.is_active
      AND p.id NOT IN (SELECT catalog_product_id FROM sold_products)
  )
  SELECT jsonb_build_object(
    'barber', (SELECT jsonb_build_object('id', b.id, 'name', b.name, 'unit_name', u.name)
               FROM barbers b LEFT JOIN units u ON u.id = b.unit_id WHERE b.id = p_barber_id),
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'totals', (SELECT to_jsonb(t) FROM totals t),
    'by_category', (SELECT COALESCE(jsonb_object_agg(cat, jsonb_build_object('qty', qty, 'revenue', revenue, 'commission', commission)), '{}'::jsonb) FROM by_cat),
    'service_breakdown', (SELECT COALESCE(jsonb_object_agg(subcat, jsonb_build_object('qty', qty, 'revenue', revenue)), '{}'::jsonb) FROM by_subcat),
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('category', cat, 'item_name', item_name, 'qty', qty, 'revenue', revenue, 'commission', commission) ORDER BY cat, revenue DESC), '[]'::jsonb) FROM by_item),
    'clients', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'client_name', client_name, 'phone', phone, 'visits', visits, 'revenue', revenue,
        'first_visit', first_visit, 'last_visit', last_visit, 'was_new', was_new,
        'items', COALESCE(items, '[]'::jsonb)) ORDER BY revenue DESC), '[]'::jsonb) FROM clients_agg),
    'never_sold', (SELECT COALESCE(jsonb_agg(obj ORDER BY obj->>'kind', obj->>'name'), '[]'::jsonb) FROM never_sold)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_barber_report_range(uuid, date, date, uuid) TO authenticated;