import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CANCEL-ORG-SUB] ${step}${detailsStr}`);
};

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
      { auth: { persistSession: false } }
    );

    // Verify super admin
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");

    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) throw new Error("Unauthorized: Only super admins can cancel subscriptions");
    logStep("Super admin verified");

    const { organizationId } = await req.json();
    if (!organizationId) throw new Error("Missing organizationId");

    // Fetch organization
    const { data: org, error: orgError } = await supabaseClient
      .from("organizations")
      .select("id, name, stripe_customer_id, subscription_status")
      .eq("id", organizationId)
      .single();

    if (orgError || !org) throw new Error("Organization not found");
    logStep("Organization found", { name: org.name, stripeCustomerId: org.stripe_customer_id });

    // Cancel Stripe subscriptions if customer exists
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (org.stripe_customer_id && stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      const subscriptions = await stripe.subscriptions.list({
        customer: org.stripe_customer_id,
        status: "active",
      });

      logStep("Active Stripe subscriptions found", { count: subscriptions.data.length });

      for (const sub of subscriptions.data) {
        await stripe.subscriptions.cancel(sub.id);
        logStep("Cancelled Stripe subscription", { subscriptionId: sub.id });
      }

      // Also cancel trialing subscriptions
      const trialingSubs = await stripe.subscriptions.list({
        customer: org.stripe_customer_id,
        status: "trialing",
      });

      for (const sub of trialingSubs.data) {
        await stripe.subscriptions.cancel(sub.id);
        logStep("Cancelled trialing subscription", { subscriptionId: sub.id });
      }
    } else {
      logStep("No Stripe customer or key, skipping Stripe cancellation");
    }

    // Update organization status to trial
    const { error: updateError } = await supabaseClient
      .from("organizations")
      .update({ subscription_status: "trial", updated_at: new Date().toISOString() })
      .eq("id", organizationId);

    if (updateError) throw new Error("Failed to update organization status");

    logStep("Organization status updated to trial");

    return new Response(
      JSON.stringify({ success: true, message: "Assinatura cancelada com sucesso" }),
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
