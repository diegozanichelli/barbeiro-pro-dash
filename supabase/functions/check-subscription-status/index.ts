import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
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

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error("User not authenticated");
    }

    logStep("User authenticated", { userId: userData.user.id });

    // Get user role and organization
    const { data: userRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role, organization_id, organizations(subscription_status)")
      .eq("user_id", userData.user.id)
      .single();

    if (roleError) {
      logStep("No role found for user", { error: roleError });
      return new Response(
        JSON.stringify({ 
          has_access: false, 
          message: "User not assigned to any organization" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    logStep("User role found", { role: userRole.role });

    // Super admins always have access
    if (userRole.role === "super_admin") {
      return new Response(
        JSON.stringify({ 
          has_access: true, 
          role: "super_admin",
          subscription_status: "active"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Check organization subscription status
    const org = userRole.organizations as any;
    const subscriptionStatus = org?.subscription_status;

    logStep("Subscription status checked", { status: subscriptionStatus });

    const hasAccess = subscriptionStatus === "trial" || subscriptionStatus === "active";

    return new Response(
      JSON.stringify({ 
        has_access: hasAccess,
        role: userRole.role,
        subscription_status: subscriptionStatus,
        organization_id: userRole.organization_id
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});