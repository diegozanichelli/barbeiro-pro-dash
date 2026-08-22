import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Hoje em Manaus (UTC-4), formato YYYY-MM-DD
    const nowManaus = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const today = nowManaus.toISOString().slice(0, 10);

    const { data: expired, error: selErr } = await supabase
      .from("organizations")
      .select("id, name, access_expires_at, subscription_status")
      .eq("auto_deactivate", true)
      .lt("access_expires_at", today)
      .in("subscription_status", ["active", "trial", "gratuita"]);

    if (selErr) throw selErr;

    let updated = 0;
    if (expired && expired.length > 0) {
      const ids = expired.map((o) => o.id);
      const { error: updErr } = await supabase
        .from("organizations")
        .update({ subscription_status: "past_due" })
        .in("id", ids);
      if (updErr) throw updErr;
      updated = ids.length;
      console.log(`[auto-deactivate-expired] Desativadas ${updated}:`, expired.map((o) => o.name));
    }

    return new Response(
      JSON.stringify({ success: true, checked_at: today, deactivated: updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[auto-deactivate-expired] ERROR", message);
    return new Response(
      JSON.stringify({ error: "Falha ao processar" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
