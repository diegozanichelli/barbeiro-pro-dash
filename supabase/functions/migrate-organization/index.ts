import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MIGRATE-ORG] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { 
      oldManagerEmail, 
      newManagerEmail, 
      newManagerPassword 
    } = await req.json();

    logStep("Received request", { oldManagerEmail, newManagerEmail });

    // Security: only allow cassiano.diego@gmail.com to trigger this
    if (oldManagerEmail !== "cassiano.diego@gmail.com") {
      throw new Error("Unauthorized");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Step 1: Find the old manager's user ID
    logStep("Finding old manager user");
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw new Error(`User list error: ${listError.message}`);

    const oldUser = users.find(u => u.email === oldManagerEmail);
    if (!oldUser) throw new Error("Old manager not found");
    logStep("Old manager found", { userId: oldUser.id });

    // Step 2: Find the organization
    logStep("Looking for organization");
    const { data: barbers, error: barbersError } = await supabaseAdmin
      .from("barbers")
      .select("organization_id")
      .limit(1);

    if (barbersError) throw new Error(`Barbers query error: ${barbersError.message}`);
    
    let organizationId: string | null = null;
    if (barbers && barbers.length > 0) {
      organizationId = barbers[0].organization_id;
    }

    if (!organizationId) {
      // Try to find from user_roles history
      const { data: oldRoles, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("organization_id")
        .eq("user_id", oldUser.id)
        .not("organization_id", "is", null)
        .limit(1);
      
      if (rolesError) throw new Error(`Roles query error: ${rolesError.message}`);
      if (oldRoles && oldRoles.length > 0) {
        organizationId = oldRoles[0].organization_id;
      }
    }

    if (!organizationId) throw new Error("Organization not found");
    logStep("Organization found", { organizationId });

    // Step 3: Activate the organization
    logStep("Activating organization");
    const { error: orgUpdateError } = await supabaseAdmin
      .from("organizations")
      .update({ subscription_status: "active" })
      .eq("id", organizationId);

    if (orgUpdateError) throw new Error(`Org update error: ${orgUpdateError.message}`);
    logStep("Organization activated");

    // Step 4: Create new manager user
    logStep("Creating new manager user");
    const { data: newUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: newManagerEmail,
      password: newManagerPassword,
      email_confirm: true,
    });

    if (createUserError) throw new Error(`User creation error: ${createUserError.message}`);
    if (!newUserData.user) throw new Error("User creation failed");
    
    const newUserId = newUserData.user.id;
    logStep("New manager created", { userId: newUserId });

    // Step 5: Create profile for new user
    logStep("Creating profile for new manager");
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newUserId,
        full_name: newManagerEmail.split("@")[0],
      });

    if (profileError) {
      logStep("Profile creation warning", { error: profileError.message });
    }

    // Step 6: Assign manager role to new user
    logStep("Assigning manager role to new user");
    const { error: newRoleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUserId,
        role: "manager",
        organization_id: organizationId,
      });

    if (newRoleError) throw new Error(`New role assignment error: ${newRoleError.message}`);
    logStep("Manager role assigned to new user");

    // Step 7: Verify super_admin setup
    logStep("Verifying super_admin configuration");
    const { data: superAdminRoles, error: checkError } = await supabaseAdmin
      .from("user_roles")
      .select("*")
      .eq("user_id", oldUser.id);

    if (checkError) throw new Error(`Super admin check error: ${checkError.message}`);
    logStep("Super admin roles verified", { roles: superAdminRoles });

    return new Response(JSON.stringify({ 
      success: true,
      organizationId,
      newUserId,
      newUserEmail: newManagerEmail,
      oldUserRoles: superAdminRoles
    }), {
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
    logStep("ERROR", errorDetails);
    return new Response(JSON.stringify({ error: errorMessage, details: errorDetails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
