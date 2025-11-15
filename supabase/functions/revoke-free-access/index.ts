import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REVOKE-FREE-ACCESS] ${step}${detailsStr}`);
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
    
    if (userError || !userData.user) {
      throw new Error("User not authenticated");
    }

    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      throw new Error("Unauthorized: Only super admins can revoke free access");
    }

    logStep("Super admin verified");

    // Parse request body
    const { organizationId } = await req.json();

    if (!organizationId) {
      throw new Error("Missing required field: organizationId");
    }

    logStep("Revoking access", { organizationId });

    // Update organization status to past_due
    const { error: updateError } = await supabaseClient
      .from("organizations")
      .update({ subscription_status: "past_due" })
      .eq("id", organizationId)
      .eq("subscription_status", "gratuita");

    if (updateError) {
      logStep("Error revoking access", { error: updateError });
      throw new Error("Operação falhou. Tente novamente.");
    }

    logStep("Free access revoked successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Acesso gratuito revogado com sucesso",
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
      JSON.stringify({ error: "Operação falhou. Tente novamente." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
