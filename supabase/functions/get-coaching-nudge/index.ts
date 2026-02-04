import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NudgeResponse {
  mensagem: string;
  foco_acao: string;
  tipo: "produtos" | "servicos_extras" | "sucesso" | "sem_dados";
  percentual_barbeiro?: number;
  percentual_media?: number;
  diferenca?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("[COACHING-NUDGE] Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[COACHING-NUDGE] User authenticated:", user.id);

    // Get barber data
    const { data: barber, error: barberError } = await supabase
      .from("barbers")
      .select("id, name, unit_id, organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (barberError || !barber) {
      console.error("[COACHING-NUDGE] Barber not found:", barberError);
      return new Response(JSON.stringify({ 
        mensagem: "Seu perfil de barbeiro não foi encontrado.",
        foco_acao: "Contate o gerente.",
        tipo: "sem_dados"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[COACHING-NUDGE] Barber found:", barber.id, barber.name);

    // Fuso horário de Manaus (GMT-4)
    const MANAUS_OFFSET = -4 * 60; // -4 horas em minutos
    const nowUTC = new Date();
    const utcTime = nowUTC.getTime() + (nowUTC.getTimezoneOffset() * 60000);
    const now = new Date(utcTime + (MANAUS_OFFSET * 60000));
    
    // Get current month dates (using Manaus timezone)
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const firstDayStr = firstDay.toISOString().split("T")[0];
    const lastDayStr = lastDay.toISOString().split("T")[0];

    console.log("[COACHING-NUDGE] Date range (Manaus timezone):", firstDayStr, "to", lastDayStr);

    // Get barber's productions for current month
    const { data: barberProductions, error: prodError } = await supabase
      .from("daily_productions")
      .select("*")
      .eq("barber_id", barber.id)
      .gte("date", firstDayStr)
      .lte("date", lastDayStr);

    if (prodError) {
      console.error("[COACHING-NUDGE] Error fetching barber productions:", prodError);
    }

    // Get ALL barbers from same unit for comparison
    const { data: unitBarbers, error: unitError } = await supabase
      .from("barbers")
      .select("id")
      .eq("unit_id", barber.unit_id)
      .eq("status", "active");

    if (unitError) {
      console.error("[COACHING-NUDGE] Error fetching unit barbers:", unitError);
    }

    const unitBarberIds = unitBarbers?.map(b => b.id) || [];

    // Get all productions from unit for current month
    const { data: unitProductions, error: unitProdError } = await supabase
      .from("daily_productions")
      .select("*")
      .in("barber_id", unitBarberIds)
      .gte("date", firstDayStr)
      .lte("date", lastDayStr);

    if (unitProdError) {
      console.error("[COACHING-NUDGE] Error fetching unit productions:", unitProdError);
    }

    // If no data, return early
    if (!barberProductions || barberProductions.length === 0) {
      const nudge: NudgeResponse = {
        mensagem: "Comece o mês com força!",
        foco_acao: "Lance seus primeiros atendimentos para desbloquear dicas personalizadas.",
        tipo: "sem_dados"
      };
      return new Response(JSON.stringify(nudge), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate barber's metrics
    const barberTotalClients = barberProductions.reduce((sum, p) => sum + (p.clients_count || 0), 0);
    const barberTotalProducts = barberProductions.reduce((sum, p) => sum + (p.products_count || 0), 0);
    const barberTotalExtras = barberProductions.reduce((sum, p) => sum + (Number(p.services_extra_total) || 0), 0);
    const barberTotalServices = barberProductions.reduce((sum, p) => {
      if (p.services_basic_total !== null || p.services_extra_total !== null) {
        return sum + (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0);
      }
      return sum + (Number(p.services_total) || 0);
    }, 0);

    const barberProductsRate = barberTotalClients > 0 ? (barberTotalProducts / barberTotalClients) * 100 : 0;
    const barberExtrasRate = barberTotalServices > 0 ? (barberTotalExtras / barberTotalServices) * 100 : 0;

    console.log("[COACHING-NUDGE] Barber metrics:", {
      clients: barberTotalClients,
      products: barberTotalProducts,
      extras: barberTotalExtras,
      productsRate: barberProductsRate.toFixed(1),
      extrasRate: barberExtrasRate.toFixed(1)
    });

    // Calculate unit average (excluding current barber for fair comparison)
    const otherProductions = unitProductions?.filter(p => p.barber_id !== barber.id) || [];
    
    let unitProductsRate = 0;
    let unitExtrasRate = 0;
    
    if (otherProductions.length > 0) {
      const unitTotalClients = otherProductions.reduce((sum, p) => sum + (p.clients_count || 0), 0);
      const unitTotalProducts = otherProductions.reduce((sum, p) => sum + (p.products_count || 0), 0);
      const unitTotalExtras = otherProductions.reduce((sum, p) => sum + (Number(p.services_extra_total) || 0), 0);
      const unitTotalServices = otherProductions.reduce((sum, p) => {
        if (p.services_basic_total !== null || p.services_extra_total !== null) {
          return sum + (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0);
        }
        return sum + (Number(p.services_total) || 0);
      }, 0);

      unitProductsRate = unitTotalClients > 0 ? (unitTotalProducts / unitTotalClients) * 100 : 0;
      unitExtrasRate = unitTotalServices > 0 ? (unitTotalExtras / unitTotalServices) * 100 : 0;
    }

    console.log("[COACHING-NUDGE] Unit averages:", {
      productsRate: unitProductsRate.toFixed(1),
      extrasRate: unitExtrasRate.toFixed(1)
    });

    // Determine nudge priority
    const productsDiff = unitProductsRate - barberProductsRate;
    const extrasDiff = unitExtrasRate - barberExtrasRate;

    let nudge: NudgeResponse;

    // Priority 1: Products below unit average
    if (barberProductsRate < unitProductsRate && productsDiff > 3) {
      const productsToSell = Math.ceil(productsDiff / 10) + 1; // Actionable target
      nudge = {
        mensagem: `OPORTUNIDADE: Você está deixando ${productsDiff.toFixed(0)}% de dinheiro na mesa em produtos!`,
        foco_acao: `Venda ${productsToSell} produtos hoje. Seu próximo cliente precisa de uma pomada ou shampoo!`,
        tipo: "produtos",
        percentual_barbeiro: Math.round(barberProductsRate),
        percentual_media: Math.round(unitProductsRate),
        diferenca: Math.round(productsDiff)
      };
    }
    // Priority 2: Extra services below unit average
    else if (barberExtrasRate < unitExtrasRate && extrasDiff > 3) {
      nudge = {
        mensagem: `Seus colegas vendem ${extrasDiff.toFixed(0)}% mais serviços extras que você!`,
        foco_acao: `Ofereça barba, pigmentação ou hidratação no próximo atendimento.`,
        tipo: "servicos_extras",
        percentual_barbeiro: Math.round(barberExtrasRate),
        percentual_media: Math.round(unitExtrasRate),
        diferenca: Math.round(extrasDiff)
      };
    }
    // Success message - barber is doing well
    else {
      nudge = {
        mensagem: "Você está mandando bem! 🔥",
        foco_acao: "Continue oferecendo produtos e serviços extras para manter sua liderança.",
        tipo: "sucesso",
        percentual_barbeiro: Math.round(barberProductsRate),
        percentual_media: Math.round(unitProductsRate)
      };
    }

    console.log("[COACHING-NUDGE] Returning nudge:", nudge.tipo);

    return new Response(JSON.stringify(nudge), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[COACHING-NUDGE] Unexpected error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
