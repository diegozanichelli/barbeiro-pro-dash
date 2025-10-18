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

    // Ensure caller is a manager
    const { data: isManager, error: roleErr } = await supabase.rpc("is_manager");
    if (roleErr) {
      return new Response(JSON.stringify({ error: roleErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!isManager) {
      return new Response(JSON.stringify({ error: "Forbidden: only managers can create barbers" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const {
      name,
      email,
      password,
      unit_id,
      services_commission,
      products_commission,
      status,
    } = body as {
      name: string;
      email: string;
      password: string;
      unit_id: string;
      services_commission: number | string;
      products_commission: number | string;
      status: string;
    };

    // Basic validation
    if (!name || !email || !password || !unit_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (String(password).length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1) Create auth user (email confirmed so they can login immediately)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, role: "barber" },
    });
    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const newUser = created.user;
    if (!newUser) {
      return new Response(JSON.stringify({ error: "Failed to create user" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Ensure profile exists with role=barber
    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: newUser.id,
      full_name: name,
      role: "barber",
    });
    if (profileErr) {
      // If duplicate, ignore conflict
      if (profileErr.code !== "23505") {
        return new Response(JSON.stringify({ error: profileErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 3) Create barber row linked to user
    const { error: barberErr } = await supabaseAdmin.from("barbers").insert({
      name,
      unit_id,
      services_commission: Number(services_commission),
      products_commission: Number(products_commission),
      status: status || "active",
      user_id: newUser.id,
    });
    if (barberErr) {
      return new Response(JSON.stringify({ error: barberErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
