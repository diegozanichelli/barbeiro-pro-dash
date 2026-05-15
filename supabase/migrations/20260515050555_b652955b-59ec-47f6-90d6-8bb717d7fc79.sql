
-- Trigger-only functions: revoke from PUBLIC entirely (only invoked by triggers)
REVOKE ALL ON FUNCTION public.calculate_sale_commission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_commission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_mobile_phone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_financeiro_integracao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_orphan_transactions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_daily_production_from_transactions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_barber_commissions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_monthly_goal_organization() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_client_names() FROM PUBLIC, anon, authenticated;

-- RPC-callable functions: revoke anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.calc_expected_pacing(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calc_expected_pacing_batch(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_organization_rankings(date, date, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_manager_report_stats(date, date, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_sale_and_ensure_production(uuid, uuid, date, jsonb, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auto_replicate_goals() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_organization(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.calc_expected_pacing(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_expected_pacing_batch(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_rankings(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_manager_report_stats(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_and_ensure_production(uuid, uuid, date, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_replicate_goals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization(uuid) TO authenticated;
