// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cria o login do CONTROLADOR (papel "controller").
// Espelha create-barber, mas sem linha em barbers / comissão / unidade:
// o controlador só lança movimentos de assinatura (cancelamento, renovação
// automática e venda online) na sua própria organização.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");

    // Contexto do chamador (JWT) para checagem de RBAC.
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });
    // Cliente com service role para operações privilegiadas.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Só gestor pode criar um controlador.
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "manager")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Acesso negado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: managerOrgData, error: orgErr } = await supabase
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (orgErr || !managerOrgData?.organization_id) {
      return new Response(JSON.stringify({ error: "Organização não encontrada" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const organization_id = managerOrgData.organization_id;

    const body = await req.json();
    const { name, email, password } = body as {
      name: string;
      email: string;
      password: string;
    };

    if (!name || !email || !password) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const trimmedName = String(name).trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return new Response(
        JSON.stringify({ error: "Nome deve ter entre 2 e 100 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedEmail = String(email).trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 255) {
      return new Response(
        JSON.stringify({ error: "Email inválido ou muito longo (máx. 255 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const passwordStr = String(password);
    if (passwordStr.length < 8) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter no mínimo 8 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const hasComplexity = /^(?=.*[a-z])(?=.*[A-Z\d])/.test(passwordStr);
    if (!hasComplexity) {
      return new Response(
        JSON.stringify({ error: "Senha deve conter letras maiúsculas e minúsculas ou números" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1) Criar usuário de auth (email já confirmado).
    let newUser: any = null;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password: passwordStr,
      email_confirm: true,
      user_metadata: { full_name: trimmedName, role: "controller" },
    });

    if (createErr) {
      const isExists = (createErr as any)?.code === "email_exists" ||
        createErr.message?.includes("already been registered");

      if (!isExists) {
        return new Response(JSON.stringify({ error: "Falha ao criar usuário. Tente novamente." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Email já existe no Auth: só reaproveitar se for órfão (sem role).
      let existing: any = null;
      for (let page = 1; page <= 10 && !existing; page++) {
        const { data: listed, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr) break;
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
        .select("id")
        .eq("user_id", existing.id)
        .maybeSingle();

      const { data: existingBarber } = await supabaseAdmin
        .from("barbers")
        .select("id")
        .eq("user_id", existing.id)
        .maybeSingle();

      if (existingRole || existingBarber) {
        return new Response(
          JSON.stringify({ error: "Este email já está em uso por outro usuário do sistema. Use outro email." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: passwordStr,
        email_confirm: true,
        user_metadata: { full_name: trimmedName, role: "controller" },
      });
      if (updErr) {
        return new Response(JSON.stringify({ error: "Falha ao reaproveitar o acesso existente. Tente novamente." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      newUser = existing;
    } else {
      newUser = created.user;
    }

    if (!newUser) {
      return new Response(JSON.stringify({ error: "Falha ao criar usuário" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Garantir profile.
    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
      id: newUser.id,
      full_name: trimmedName,
    });
    if (profileErr && profileErr.code !== "23505") {
      return new Response(JSON.stringify({ error: "Falha ao criar perfil. Tente novamente." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3) Atribuir o papel controller na organização do gestor.
    const { error: userRoleErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUser.id,
      role: "controller",
      organization_id: organization_id,
    });
    if (userRoleErr) {
      return new Response(JSON.stringify({ error: "Falha ao atribuir permissão. Tente novamente." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
