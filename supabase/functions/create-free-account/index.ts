import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-FREE-ACCOUNT] ${step}${detailsStr}`);
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
      { auth: { persistSession: false, autoRefreshToken: false } }
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
      throw new Error("Unauthorized: Only super admins can create free accounts");
    }

    logStep("Super admin verified");

    // Parse request body
    const { organizationName, managerEmail, managerPassword } = await req.json();

    if (!organizationName || !managerEmail || !managerPassword) {
      throw new Error("Missing required fields: organizationName, managerEmail, managerPassword");
    }

    // Validate password (8+ characters with complexity)
    const passwordStr = String(managerPassword);
    if (passwordStr.length < 8) {
      throw new Error("Senha deve ter no mínimo 8 caracteres");
    }
    
    // Check password complexity (must have uppercase and lowercase or numbers)
    const hasComplexity = /^(?=.*[a-z])(?=.*[A-Z\d])/.test(passwordStr);
    if (!hasComplexity) {
      throw new Error("Senha deve conter letras maiúsculas e minúsculas ou números");
    }

    logStep("Creating organization", { organizationName });

    // Create organization with gratuita status
    const { data: orgData, error: orgError } = await supabaseClient
      .from("organizations")
      .insert({
        name: organizationName,
        stripe_customer_id: null,
        subscription_status: "gratuita",
      })
      .select()
      .single();

    if (orgError) {
      logStep("Error creating organization", { error: orgError });
      throw new Error(`Failed to create organization: ${orgError.message}`);
    }

    logStep("Organization created", { orgId: orgData.id });

    // Create manager user
    const { data: newUser, error: createUserError } = await supabaseClient.auth.admin.createUser({
      email: managerEmail,
      password: managerPassword,
      email_confirm: true,
      user_metadata: {
        full_name: organizationName,
      },
    });

    if (createUserError) {
      logStep("Error creating user", { error: createUserError });
      // Rollback organization
      await supabaseClient.from("organizations").delete().eq("id", orgData.id);
      throw new Error(`Failed to create user: ${createUserError.message}`);
    }

    logStep("User created", { userId: newUser.user.id });

    // Create user role
    const { error: roleError } = await supabaseClient
      .from("user_roles")
      .insert({
        user_id: newUser.user.id,
        role: "manager",
        organization_id: orgData.id,
      });

    if (roleError) {
      logStep("Error creating role", { error: roleError });
      // Rollback
      await supabaseClient.auth.admin.deleteUser(newUser.user.id);
      await supabaseClient.from("organizations").delete().eq("id", orgData.id);
      throw new Error(`Failed to create user role: ${roleError.message}`);
    }

    logStep("Free account created successfully");

    return new Response(
      JSON.stringify({
        success: true,
        organization: orgData,
        message: "Conta gratuita criada com sucesso",
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
