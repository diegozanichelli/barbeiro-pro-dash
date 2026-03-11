import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is manager
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .eq("role", "manager")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { barberId } = await req.json();
    if (!barberId) {
      return new Response(JSON.stringify({ error: "ID do barbeiro é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch barber to get user_id (ensure same organization)
    const { data: barber, error: barberErr } = await supabase
      .from("barbers")
      .select("id, user_id, organization_id")
      .eq("id", barberId)
      .eq("organization_id", roleData.organization_id)
      .single();

    if (barberErr || !barber) {
      return new Response(JSON.stringify({ error: "Barbeiro não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = barber.user_id;

    // 1) Delete user_roles for this barber
    if (userId) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "barber");
      console.log("[DELETE-BARBER] user_roles deleted for", userId);
    }

    // 2) Delete barber record
    const { error: delBarberErr } = await supabaseAdmin.from("barbers").delete().eq("id", barberId);
    if (delBarberErr) {
      console.error("[DELETE-BARBER] Failed to delete barber row:", delBarberErr);
      return new Response(JSON.stringify({ error: "Falha ao excluir barbeiro" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[DELETE-BARBER] barber row deleted");

    // 3) Delete profile
    if (userId) {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      console.log("[DELETE-BARBER] profile deleted");
    }

    // 4) Delete auth user
    if (userId) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authErr) {
        console.error("[DELETE-BARBER] Failed to delete auth user:", authErr);
        // Non-fatal: barber row already deleted
      } else {
        console.log("[DELETE-BARBER] auth user deleted");
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[DELETE-BARBER] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
