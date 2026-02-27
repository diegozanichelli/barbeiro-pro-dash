-- Garantir acesso da aplicação à view consolidada diária
GRANT SELECT ON v_consolidated_daily_production TO authenticated;
GRANT SELECT ON v_consolidated_daily_production TO service_role;

-- A view deve respeitar políticas das tabelas-base no contexto do usuário
ALTER VIEW v_consolidated_daily_production SET (security_invoker = on);
