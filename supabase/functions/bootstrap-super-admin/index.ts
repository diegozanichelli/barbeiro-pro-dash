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
    logStep("Listing users from auth.users");
    const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    if (userError) {
      logStep("Error listing users", { error: userError.message });
      throw new Error(`User list error: ${userError.message}`);
    }

    const user = users.find(u => u.email === email);
    if (!user) {
      throw new Error("User not found");
    }
    logStep("User found", { userId: user.id });

    // Check existing roles
    logStep("Checking existing roles for user");
    const { data: existingRoles, error: checkError } = await supabaseAdmin
      .from("user_roles")
      .select("*")
      .eq("user_id", user.id);

    if (checkError) {
      logStep("Error checking existing roles", { 
        message: checkError.message,
        details: checkError.details,
        hint: checkError.hint,
        code: checkError.code 
      });
      throw new Error(`Check roles error: ${checkError.message}`);
    }
    
    logStep("Existing roles found", { roles: existingRoles });

    // Insert super_admin role (will fail if already exists, which is fine)
    logStep("Attempting to insert super_admin role");
    const { data: insertData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: user.id,
        role: "super_admin",
        organization_id: null,
      })
      .select();

    if (roleError) {
      // If it's a duplicate error, that's OK - user already has super_admin
      if (roleError.code === "23505") {
        logStep("Super admin role already exists (duplicate key)");
      } else {
        logStep("Role insert error details", { 
          message: roleError.message,
          details: roleError.details,
          hint: roleError.hint,
          code: roleError.code 
        });
        throw new Error(`Role insert error: ${roleError.message} (code: ${roleError.code})`);
      }
    } else {
      logStep("Super admin role assigned", { insertData });
    }

    // Find and activate organization
    logStep("Looking for organization to activate");
    const { data: userRole, error: orgLookupError } = await supabaseAdmin
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", user.id)
      .not("organization_id", "is", null)
      .maybeSingle();

    if (orgLookupError) {
      logStep("Error looking up organization", { error: orgLookupError.message });
      throw new Error(`Org lookup error: ${orgLookupError.message}`);
    }

    if (userRole?.organization_id) {
      logStep("Activating organization", { organizationId: userRole.organization_id });
      const { error: orgError } = await supabaseAdmin
        .from("organizations")
        .update({ subscription_status: "active" })
        .eq("id", userRole.organization_id);

      if (orgError) {
        logStep("Error activating organization", { 
          message: orgError.message,
          details: orgError.details 
        });
        throw new Error(`Org activation error: ${orgError.message}`);
      }
      logStep("Organization activated successfully");
    } else {
      logStep("No organization found to activate");
    }

    return new Response(JSON.stringify({ success: true, userId: user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : { raw: String(error) };
    logStep("CAUGHT ERROR", errorDetails);
    return new Response(JSON.stringify({ error: errorMessage, details: errorDetails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
