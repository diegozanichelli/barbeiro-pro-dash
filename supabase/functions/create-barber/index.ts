// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      const missing = {
        SUPABASE_URL: Boolean(supabaseUrl),
        SUPABASE_ANON_KEY: Boolean(Deno.env.get("SUPABASE_ANON_KEY")),
        SUPABASE_PUBLISHABLE_KEY: Boolean(Deno.env.get("SUPABASE_PUBLISHABLE_KEY")),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceRoleKey),
      };
      return new Response(
        JSON.stringify({ error: "Missing environment configuration", missing }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");

    // Client context for RBAC check (uses caller's JWT)
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    // Service role client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("[CREATE-BARBER] User not found in JWT");
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify user is a manager with direct query (secure)
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'manager')
      .maybeSingle();
    
    if (!roleData) {
      console.error("[CREATE-BARBER] User is not a manager");
      return new Response(
        JSON.stringify({ error: "Acesso negado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get manager's organization_id
    console.log("[CREATE-BARBER] Manager user_id:", user.id);

    const { data: managerOrgData, error: orgErr } = await supabase
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (orgErr || !managerOrgData?.organization_id) {
      console.error("[CREATE-BARBER] Manager organization not found:", orgErr);
      return new Response(JSON.stringify({ error: "Organização não encontrada" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const organization_id = managerOrgData.organization_id;
    console.log("[CREATE-BARBER] Organization ID:", organization_id);

    const body = await req.json();
    const {
      name,
      email,
      password,
      unit_id,
      services_commission,
      products_commission,
      subscription_commission_rate,
      status,
    } = body as {
      name: string;
      email: string;
      password: string;
      unit_id: string;
      services_commission: number | string;
      products_commission: number | string;
      subscription_commission_rate?: number | string;
      status: string;
    };

    // Basic validation
    if (!name || !email || !password || !unit_id) {
      console.error("[CREATE-BARBER] Missing required fields");
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate name length
    const trimmedName = String(name).trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      console.error("[CREATE-BARBER] Invalid name length");
      return new Response(
        JSON.stringify({ error: "Nome deve ter entre 2 e 100 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format and length
    const trimmedEmail = String(email).trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 255) {
      console.error("[CREATE-BARBER] Invalid email");
      return new Response(
        JSON.stringify({ error: "Email inválido ou muito longo (máx. 255 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Validate password (8+ characters with complexity)
    const passwordStr = String(password);
    if (passwordStr.length < 8) {
      console.error("[CREATE-BARBER] Password too short");
      return new Response(
        JSON.stringify({ error: "Senha deve ter no mínimo 8 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Check password complexity (must have uppercase and lowercase or numbers)
    const hasComplexity = /^(?=.*[a-z])(?=.*[A-Z\d])/.test(passwordStr);
    if (!hasComplexity) {
      console.error("[CREATE-BARBER] Password lacks complexity");
      return new Response(
        JSON.stringify({ error: "Senha deve conter letras maiúsculas e minúsculas ou números" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate commission percentages (0-100)
    const servicesCommNum = Number(services_commission);
    const productsCommNum = Number(products_commission);
    if (isNaN(servicesCommNum) || servicesCommNum < 0 || servicesCommNum > 100) {
      console.error("[CREATE-BARBER] Invalid services commission");
      return new Response(
        JSON.stringify({ error: "Comissão de serviços deve estar entre 0% e 100%" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (isNaN(productsCommNum) || productsCommNum < 0 || productsCommNum > 100) {
      console.error("[CREATE-BARBER] Invalid products commission");
      return new Response(
        JSON.stringify({ error: "Comissão de produtos deve estar entre 0% e 100%" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate status
    if (status && !["active", "inactive"].includes(status)) {
      console.error("[CREATE-BARBER] Invalid status");
      return new Response(
        JSON.stringify({ error: "Status deve ser 'active' ou 'inactive'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[CREATE-BARBER] Creating user:", email);

    // 1) Create auth user (email confirmed so they can login immediately)
    let newUser: any = null;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password: passwordStr,
      email_confirm: true,
      user_metadata: { full_name: trimmedName, role: "barber" },
    });

    if (createErr) {
      const isExists = (createErr as any)?.code === "email_exists" ||
        createErr.message?.includes("already been registered");

      if (!isExists) {
        console.error("[CREATE-BARBER] Auth user creation failed:", createErr);
        return new Response(JSON.stringify({ error: "Falha ao criar usuário. Tente novamente." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Email já existe no Auth: verificar se é um usuário órfão (sem role e sem barbeiro)
      console.log("[CREATE-BARBER] Email exists, checking for orphan auth user");
      let existing: any = null;
      for (let page = 1; page <= 10 && !existing; page++) {
        const { data: listed, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr) {
          console.error("[CREATE-BARBER] listUsers failed:", listErr);
          break;
        }
        existing = listed.users.find((u) => u.email?.toLowerCase() === trimmedEmail.toLowerCase()) ?? null;
        if (listed.users.length < 1000) break;
      }

      if (!existing) {
        return new Response(
          JSON.stringify({ error: "Este email já está cadastrado no sistema. Use outro email." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id, role, organization_id")
        .eq("user_id", existing.id)
        .maybeSingle();

      const { data: existingBarber } = await supabaseAdmin
        .from("barbers")
        .select("id")
        .eq("user_id", existing.id)
        .maybeSingle();

      if (existingRole || existingBarber) {
        console.error("[CREATE-BARBER] Email already linked to an account");
        return new Response(
          JSON.stringify({ error: "Este email já está em uso por outro usuário do sistema. Use outro email." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Reaproveitar usuário órfão: redefinir senha e metadados
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: passwordStr,
        email_confirm: true,
        user_metadata: { full_name: trimmedName, role: "barber" },
      });
      if (updErr) {
        console.error("[CREATE-BARBER] Failed to recycle orphan user:", updErr);
        return new Response(JSON.stringify({ error: "Falha ao reaproveitar o acesso existente. Tente novamente." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.log("[CREATE-BARBER] Orphan auth user recycled:", existing.id);
      newUser = existing;
    } else {
      newUser = created.user;
    }

    if (!newUser) {
      console.error("[CREATE-BARBER] No user returned from auth");
      return new Response(JSON.stringify({ error: "Falha ao criar usuário" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[CREATE-BARBER] Auth user created:", newUser.id);

    // 2) Ensure profile exists
    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: newUser.id,
      full_name: trimmedName,
    });
    if (profileErr) {
      // If duplicate, ignore conflict
      if (profileErr.code !== "23505") {
        console.error("[CREATE-BARBER] Profile creation failed:", profileErr);
        return new Response(JSON.stringify({ error: "Falha ao criar perfil. Tente novamente." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    console.log("[CREATE-BARBER] Profile created");

    // 3) Create barber row linked to user with organization_id
    const subscriptionCommNum = Number(subscription_commission_rate) || 0;
    const { error: barberErr } = await supabaseAdmin.from("barbers").insert({
      name: trimmedName,
      unit_id,
      services_commission: servicesCommNum,
      products_commission: productsCommNum,
      subscription_commission_rate: subscriptionCommNum,
      status: status || "active",
      user_id: newUser.id,
      organization_id: organization_id,
    });
    if (barberErr) {
      console.error("[CREATE-BARBER] Barber creation failed:", barberErr);
      return new Response(JSON.stringify({ error: "Falha ao criar barbeiro. Tente novamente." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[CREATE-BARBER] Barber row created");

    // 4) Create user_role for the barber
    const { error: userRoleErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUser.id,
      role: "barber",
      organization_id: organization_id,
    });
    if (userRoleErr) {
      console.error("[CREATE-BARBER] User role creation failed:", userRoleErr);
      return new Response(JSON.stringify({ error: "Falha ao atribuir permissão. Tente novamente." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[CREATE-BARBER] User role created - Barber creation complete!");

    return new Response(JSON.stringify({ success: true, user_id: newUser.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
