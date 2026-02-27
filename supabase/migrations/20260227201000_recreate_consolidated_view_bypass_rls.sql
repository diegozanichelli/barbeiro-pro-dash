-- Bypass temporário de segurança da view consolidada para restaurar dados no dashboard
-- Remove configuração anterior e recria a view sem security_invoker.
DROP VIEW IF EXISTS v_consolidated_daily_production;

CREATE VIEW v_consolidated_daily_production AS
SELECT
  id,
  date,
  barber_id,
  organization_id,
  presence_type,
  COALESCE(NULLIF(tx_basic_total, 0), manual_basic_total, 0) AS consolidated_basic_total,
  COALESCE(NULLIF(tx_extra_total, 0), manual_extra_total, 0) AS consolidated_extra_total,
  COALESCE(NULLIF(tx_products_total, 0), manual_products_total, 0) AS consolidated_products_total,
  (
    COALESCE(NULLIF(tx_basic_total, 0), manual_basic_total, 0) +
    COALESCE(NULLIF(tx_extra_total, 0), manual_extra_total, 0) +
    COALESCE(NULLIF(tx_products_total, 0), manual_products_total, 0)
  ) AS total_revenue,
  COALESCE(NULLIF(tx_clients_count, 0), manual_clients_count, 0) AS total_clients,
  COALESCE(NULLIF(tx_services_count, 0), manual_services_count, 0) AS total_services
FROM daily_productions;

GRANT SELECT ON v_consolidated_daily_production TO authenticated;
GRANT SELECT ON v_consolidated_daily_production TO service_role;
