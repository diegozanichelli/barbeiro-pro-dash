import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[DELETE-ORGANIZATION] ${step}${detailsStr}`);
};

// Ordem importa: filhos antes dos pais
const CHILD_TABLES = [
  "client_purchase_history",
  "client_origin_recompute_logs",
  "sale_transactions",
  "daily_productions",
  "war_plan_executions",
  "performance_alerts",
  "ai_assistant_usage",
  "push_subscriptions",
  "presentation_slide_overrides",
  "ranking_custom_names",
  "monthly_goals",
  "organization_holidays",
  "unit_seasonality_config",
  "financeiro_integracao",
  "subscription_plan_services",
  "subscription_plans",
  "catalog_services",
  "catalog_products",
  "clients",
  "barbers",
  "units",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");

    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) throw new Error("Unauthorized: Only super admins can delete organizations");
    logStep("Super admin verified");

    const { organizationId, confirmationName } = await req.json();
    if (!organizationId) throw new Error("Missing organizationId");

    const { data: org, error: orgError } = await supabaseClient
      .from("organizations")
      .select("id, name, stripe_customer_id")
      .eq("id", organizationId)
      .single();

    if (orgError || !org) throw new Error("Organização não encontrada");

    if (
      typeof confirmationName !== "string" ||
      confirmationName.trim().toLowerCase() !== org.name.trim().toLowerCase()
    ) {
      throw new Error("Confirmação inválida: digite o nome exato da barbearia");
    }

    logStep("Deleting organization", { id: org.id, name: org.name });

    // 1. Cancelar assinaturas no Stripe (se existirem)
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (org.stripe_customer_id && stripeKey) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        for (const status of ["active", "trialing", "past_due"] as const) {
          const subs = await stripe.subscriptions.list({
            customer: org.stripe_customer_id,
            status,
          });
          for (const sub of subs.data) {
            await stripe.subscriptions.cancel(sub.id);
            logStep("Stripe subscription cancelled", { subscriptionId: sub.id });
          }
        }
      } catch (stripeError) {
        logStep("Stripe cancellation warning", {
          message: stripeError instanceof Error ? stripeError.message : String(stripeError),
        });
      }
    }

    // 2. Coletar usuários vinculados (gerentes + barbeiros)
    const userIds = new Set<string>();

    const { data: roles } = await supabaseClient
      .from("user_roles")
      .select("user_id")
      .eq("organization_id", organizationId);
    roles?.forEach((r) => r.user_id && userIds.add(r.user_id));

    const { data: barberUsers } = await supabaseClient
      .from("barbers")
      .select("user_id")
      .eq("organization_id", organizationId);
    barberUsers?.forEach((b) => b.user_id && userIds.add(b.user_id));

    logStep("Users to remove", { count: userIds.size });

    // 3. Apagar dados operacionais
    for (const table of CHILD_TABLES) {
      const { error } = await supabaseClient
        .from(table)
        .delete()
        .eq("organization_id", organizationId);
      if (error) {
        logStep("Error deleting table", { table, error: error.message });
        throw new Error(`Falha ao apagar dados de ${table}: ${error.message}`);
      }
    }
    logStep("Operational data deleted");

    // 4. Apagar roles e organização
    const { error: rolesError } = await supabaseClient
      .from("user_roles")
      .delete()
      .eq("organization_id", organizationId);
    if (rolesError) throw new Error(`Falha ao apagar permissões: ${rolesError.message}`);

    const { error: deleteOrgError } = await supabaseClient
      .from("organizations")
      .delete()
      .eq("id", organizationId);
    if (deleteOrgError) throw new Error(`Falha ao apagar organização: ${deleteOrgError.message}`);

    logStep("Organization row deleted");

    // 5. Apagar contas de autenticação
    let deletedUsers = 0;
    for (const userId of userIds) {
      if (userId === userData.user.id) continue; // nunca apagar o próprio super admin
      const { error } = await supabaseClient.auth.admin.deleteUser(userId);
      if (error) {
        logStep("Warning deleting auth user", { userId, error: error.message });
      } else {
        deletedUsers += 1;
      }
    }

    logStep("Done", { deletedUsers });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Barbearia "${org.name}" excluída definitivamente`,
        deletedUsers,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
