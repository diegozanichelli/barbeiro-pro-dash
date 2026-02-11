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

    // Validate organization name
    const trimmedOrgName = String(organizationName).trim();
    if (trimmedOrgName.length < 2 || trimmedOrgName.length > 100) {
      throw new Error("Nome da organização deve ter entre 2 e 100 caracteres");
    }

    // Validate email format and length
    const trimmedEmail = String(managerEmail).trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 255) {
      throw new Error("Email inválido ou muito longo (máx. 255 caracteres)");
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
        name: trimmedOrgName,
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

    // Create manager user (or reuse existing)
    let userId: string;
    const { data: newUser, error: createUserError } = await supabaseClient.auth.admin.createUser({
      email: trimmedEmail,
      password: passwordStr,
      email_confirm: true,
      user_metadata: {
        full_name: trimmedOrgName,
      },
    });

    if (createUserError) {
      // If user already exists, try to find and reuse them
      if (createUserError.message.includes("already been registered")) {
        logStep("User already exists, checking if available");
        const { data: { users }, error: listError } = await supabaseClient.auth.admin.listUsers();
        if (listError) {
          await supabaseClient.from("organizations").delete().eq("id", orgData.id);
          throw new Error("Não foi possível verificar o usuário existente");
        }
        const existingUser = users.find(u => u.email === trimmedEmail);
        if (!existingUser) {
          await supabaseClient.from("organizations").delete().eq("id", orgData.id);
          throw new Error("Usuário não encontrado após verificação");
        }
        // Check if user already has a role (already belongs to an org)
        const { data: existingRole } = await supabaseClient
          .from("user_roles")
          .select("id")
          .eq("user_id", existingUser.id)
          .maybeSingle();
        if (existingRole) {
          await supabaseClient.from("organizations").delete().eq("id", orgData.id);
          throw new Error("Este email já está vinculado a outra organização");
        }
        userId = existingUser.id;
        logStep("Reusing existing user", { userId });
      } else {
        logStep("Error creating user", { error: createUserError });
        await supabaseClient.from("organizations").delete().eq("id", orgData.id);
        throw new Error(`Failed to create user: ${createUserError.message}`);
      }
    } else {
      userId = newUser.user.id;
    }

    logStep("User ready", { userId });

    // Create user role
    const { error: roleError } = await supabaseClient
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "manager",
        organization_id: orgData.id,
      });

    if (roleError) {
      logStep("Error creating role", { error: roleError });
      // Rollback
      await supabaseClient.auth.admin.deleteUser(userId);
      await supabaseClient.from("organizations").delete().eq("id", orgData.id);
      throw new Error(`Falha ao criar role do usuário: ${roleError.message}`);
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
