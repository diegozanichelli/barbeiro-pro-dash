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

    // Step 2: Find or create the organization
    logStep("Looking for organization");
    const { data: existingOrgs, error: orgsError } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .limit(1);

    if (orgsError) throw new Error(`Organizations query error: ${orgsError.message}`);
    
    let organizationId: string;
    
    if (existingOrgs && existingOrgs.length > 0) {
      // Organization exists
      organizationId = existingOrgs[0].id;
      logStep("Existing organization found", { organizationId });
    } else {
      // Create new organization
      logStep("No organization found, creating new one");
      const { data: newOrg, error: createOrgError } = await supabaseAdmin
        .from("organizations")
        .insert({
          name: "Barbearia SGP-B",
          subscription_status: "active"
        })
        .select()
        .single();

      if (createOrgError) throw new Error(`Organization creation error: ${createOrgError.message}`);
      if (!newOrg) throw new Error("Failed to create organization");
      
      organizationId = newOrg.id;
      logStep("New organization created", { organizationId });

      // Link all existing barbers to this organization
      logStep("Linking barbers to organization");
      const { error: updateBarbersError } = await supabaseAdmin
        .from("barbers")
        .update({ organization_id: organizationId })
        .is("organization_id", null);

      if (updateBarbersError) {
        logStep("Warning: Could not link barbers", { error: updateBarbersError.message });
      }

      // Link all existing units to this organization
      logStep("Linking units to organization");
      const { error: updateUnitsError } = await supabaseAdmin
        .from("units")
        .update({ organization_id: organizationId })
        .is("organization_id", null);

      if (updateUnitsError) {
        logStep("Warning: Could not link units", { error: updateUnitsError.message });
      }

      // Link all existing daily_productions to this organization
      logStep("Linking daily productions to organization");
      const { error: updateProductionsError } = await supabaseAdmin
        .from("daily_productions")
        .update({ organization_id: organizationId })
        .is("organization_id", null);

      if (updateProductionsError) {
        logStep("Warning: Could not link productions", { error: updateProductionsError.message });
      }

      // Link all existing monthly_goals to this organization
      logStep("Linking monthly goals to organization");
      const { error: updateGoalsError } = await supabaseAdmin
        .from("monthly_goals")
        .update({ organization_id: organizationId })
        .is("organization_id", null);

      if (updateGoalsError) {
        logStep("Warning: Could not link goals", { error: updateGoalsError.message });
      }
    }

    // Step 3: Ensure organization is active
    logStep("Ensuring organization is active");
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
