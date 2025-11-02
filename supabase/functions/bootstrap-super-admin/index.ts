import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[BOOTSTRAP-SUPER-ADMIN] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { email } = await req.json();
    logStep("Received email", { email });

    // Security: only allow this specific email
    if (email !== "cassiano.diego@gmail.com") {
      throw new Error("Unauthorized email");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Find user by email
    const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    if (userError) throw userError;

    const user = users.find(u => u.email === email);
    if (!user) {
      throw new Error("User not found");
    }
    logStep("User found", { userId: user.id });

    // Delete any existing super_admin role for this user, then insert
    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", user.id)
      .eq("role", "super_admin");

    if (deleteError) {
      logStep("Error deleting existing role (may not exist)", { error: deleteError.message });
    }

    // Insert super_admin role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: user.id,
        role: "super_admin",
        organization_id: null,
      });

    if (roleError) {
      logStep("Role insert error details", { 
        message: roleError.message,
        details: roleError.details,
        hint: roleError.hint,
        code: roleError.code 
      });
      throw roleError;
    }
    logStep("Super admin role assigned");

    // Find and activate organization
    const { data: userRole } = await supabaseAdmin
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", user.id)
      .not("organization_id", "is", null)
      .single();

    if (userRole?.organization_id) {
      const { error: orgError } = await supabaseAdmin
        .from("organizations")
        .update({ subscription_status: "active" })
        .eq("id", userRole.organization_id);

      if (orgError) throw orgError;
      logStep("Organization activated", { organizationId: userRole.organization_id });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : { raw: error };
    logStep("ERROR", errorDetails);
    return new Response(JSON.stringify({ error: errorMessage, details: errorDetails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
