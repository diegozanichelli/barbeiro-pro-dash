// Recalcula a origem (unidade) de todos os clientes de todas as organizações
// com base nos últimos 3 atendimentos. Acionada por pg_cron toda madrugada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const startedGlobal = Date.now();

  try {
    const { data: orgs, error: orgsErr } = await supabase
      .from("organizations")
      .select("id, name");
    if (orgsErr) throw orgsErr;

    const summary: any[] = [];

    for (const org of orgs ?? []) {
      const started = Date.now();
      try {
        const { data, error } = await supabase.rpc(
          "recompute_all_client_origins",
          { p_organization_id: org.id }
        );
        if (error) throw error;
        const duration = Date.now() - started;
        const result = (data ?? {}) as Record<string, number>;

        await supabase.from("client_origin_recompute_logs").insert({
          organization_id: org.id,
          scanned: result.scanned ?? 0,
          updated: result.updated ?? 0,
          unchanged: result.unchanged ?? 0,
          no_history: result.no_history ?? 0,
          duration_ms: duration,
        });

        summary.push({ org: org.name, ok: true, ...result, duration_ms: duration });
      } catch (err: any) {
        const duration = Date.now() - started;
        await supabase.from("client_origin_recompute_logs").insert({
          organization_id: org.id,
          duration_ms: duration,
          errors: [{ message: err.message ?? String(err) }],
        });
        summary.push({ org: org.name, ok: false, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        organizations: summary.length,
        total_duration_ms: Date.now() - startedGlobal,
        summary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("recompute-client-origins error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
