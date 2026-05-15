
-- 1) client_purchase_history: remove barber SELECT (PII leak)
DROP POLICY IF EXISTS "Barbers can view purchase history in their organization" ON public.client_purchase_history;

-- 2) organizations: restrict SELECT to managers/super_admins only (hide stripe_customer_id from barbers)
DROP POLICY IF EXISTS "Managers can view their organization" ON public.organizations;
CREATE POLICY "Managers and super admins can view their organization"
  ON public.organizations FOR SELECT
  USING (
    (id = public.get_user_organization(auth.uid()) AND public.has_role(auth.uid(), 'manager'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 2b) Barbers still need org id/name for UI; expose via security-invoker view with safe columns only
CREATE OR REPLACE VIEW public.organizations_public
WITH (security_invoker=on) AS
  SELECT id, name, championship_name, has_subscription_module, subscription_status
  FROM public.organizations
  WHERE id = public.get_user_organization(auth.uid());

GRANT SELECT ON public.organizations_public TO authenticated;

-- 3) push_subscriptions: revoke manager SELECT on cryptographic keys
DROP POLICY IF EXISTS "Managers can view subscriptions in their organization" ON public.push_subscriptions;

-- 4) subscription_plan_services: allow org members to read plan composition
CREATE POLICY "Org members can view subscription plan services"
  ON public.subscription_plan_services FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

-- 5) get_user_organization: deterministic resolution
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT organization_id
  FROM public.user_roles
  WHERE user_id = _user_id
    AND organization_id IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1
$function$;

-- 6) Fix mutable search_path on normalize_mobile_phone
CREATE OR REPLACE FUNCTION public.normalize_mobile_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.mobile_phone IS NOT NULL THEN
    NEW.mobile_phone := regexp_replace(NEW.mobile_phone, '[^0-9]', '', 'g');
    IF NEW.mobile_phone = '' THEN
      NEW.mobile_phone := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 7) Revoke EXECUTE from anon on all SECURITY DEFINER functions in public
REVOKE EXECUTE ON FUNCTION public.calc_expected_pacing(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calc_expected_pacing_batch(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_organization_rankings(date, date, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_manager_report_stats(date, date, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_sale_and_ensure_production(uuid, uuid, date, jsonb, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_replicate_goals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_organization(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_client_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_client_names() FROM authenticated;
