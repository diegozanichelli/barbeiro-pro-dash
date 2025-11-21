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
    if (!authHeader) {
      logStep("Missing authorization header");
      return new Response(
        JSON.stringify({ 
          has_access: false, 
          message: "No authorization header" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError) {
      logStep("Auth error", { error: userError.message });
      return new Response(
        JSON.stringify({ 
          has_access: false, 
          message: "Invalid or expired token" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    if (!userData.user) {
      logStep("No user data");
      return new Response(
        JSON.stringify({ 
          has_access: false, 
          message: "User not found" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    logStep("User authenticated", { userId: userData.user.id });

    // Get user role (without organization join for now)
    const { data: userRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role, organization_id")
      .eq("user_id", userData.user.id)
      .single();

    if (roleError) {
      logStep("No role found for user", { error: roleError.message });
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

    logStep("User role found", { role: userRole.role, organizationId: userRole.organization_id });

    // Super admins always have access
    if (userRole.role === "super_admin") {
      logStep("Super admin access granted");
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

    // Check organization subscription status for non-super-admins
    if (!userRole.organization_id) {
      logStep("No organization assigned");
      return new Response(
        JSON.stringify({ 
          has_access: false,
          role: userRole.role,
          message: "No organization assigned"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const { data: org, error: orgError } = await supabaseClient
      .from("organizations")
      .select("subscription_status")
      .eq("id", userRole.organization_id)
      .single();

    if (orgError) {
      logStep("Error fetching organization", { error: orgError.message });
      return new Response(
        JSON.stringify({ 
          has_access: false,
          role: userRole.role,
          message: "Organization not found"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const subscriptionStatus = org.subscription_status;
    logStep("Subscription status checked", { status: subscriptionStatus });

    const hasAccess = subscriptionStatus === "trial" || subscriptionStatus === "active" || subscriptionStatus === "gratuita";

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
    const errorStack = error instanceof Error ? error.stack : "";
    logStep("CRITICAL ERROR", { message: errorMessage, stack: errorStack });
    return new Response(
      JSON.stringify({ 
        error: "Operação falhou. Tente novamente.",
        details: errorMessage
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});