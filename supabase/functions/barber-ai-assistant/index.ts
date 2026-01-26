import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DailyInsightRequest {
  type: 'daily_insight';
  barberId: string;
  organizationId: string;
  barberName: string;
  monthlyGoal: number;
  soldToday: number;
  soldThisMonth: number;
  daysRemaining: number;
  dailyTarget: number;
}

interface SalesHelpRequest {
  type: 'sales_help';
  barberId: string;
  organizationId: string;
  scenario: string;
}

type RequestBody = DailyInsightRequest | SalesHelpRequest;

async function logUsage(barberId: string, organizationId: string, usageType: string, scenario?: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase credentials for logging");
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    await supabase.from("ai_assistant_usage").insert({
      barber_id: barberId,
      organization_id: organizationId,
      usage_type: usageType,
      scenario: scenario || null,
    });
  } catch (error) {
    console.error("Error logging AI usage:", error);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const body: RequestBody = await req.json();
    let systemPrompt = "";
    let userPrompt = "";

    if (body.type === 'daily_insight') {
      const { barberId, organizationId, barberName, monthlyGoal, soldToday, soldThisMonth, daysRemaining, dailyTarget } = body;
      
      // Log usage
      await logUsage(barberId, organizationId, 'daily_insight');
      
      const percentageAchieved = monthlyGoal > 0 ? ((soldThisMonth / monthlyGoal) * 100).toFixed(1) : 0;
      const remaining = Math.max(0, monthlyGoal - soldThisMonth);
      
      systemPrompt = `Você é um treinador de vendas experiente e motivador para barbeiros. 
Seu papel é analisar números de vendas e dar feedback direto e energético.
REGRAS IMPORTANTES:
- Máximo de 2 frases
- Use emojis para dar energia
- Seja direto e prático
- Fale em português brasileiro
- Trate o barbeiro pelo nome
- Se estiver longe da meta, dê uma dica estratégica de recuperação
- Se estiver perto ou acima, parabenize e incentive a superação`;

      userPrompt = `Analise os números do barbeiro ${barberName}:
- Meta do mês: R$ ${monthlyGoal.toFixed(2)}
- Vendido hoje: R$ ${soldToday.toFixed(2)}
- Vendido no mês: R$ ${soldThisMonth.toFixed(2)} (${percentageAchieved}% da meta)
- Falta vender: R$ ${remaining.toFixed(2)}
- Dias restantes: ${daysRemaining}
- Meta diária recomendada: R$ ${dailyTarget.toFixed(2)}

Gere uma mensagem motivacional curta e estratégica.`;

    } else if (body.type === 'sales_help') {
      const { barberId, organizationId, scenario } = body;
      
      // Log usage
      await logUsage(barberId, organizationId, 'sales_help', scenario);
      
      systemPrompt = `Você é um especialista em vendas para barbearias de alto padrão.
Seu papel é criar scripts de vendas curtos e persuasivos que o barbeiro pode usar AGORA com o cliente.
REGRAS IMPORTANTES:
- Máximo de 3 frases que o barbeiro pode falar
- Foco em benefício e valor para o cliente
- Tom profissional mas amigável
- Fale em português brasileiro
- Seja direto e prático
- Não use frases genéricas, seja específico para a situação`;

      const scenarioPrompts: Record<string, string> = {
        'cliente_achou_caro': `O cliente achou o serviço/produto caro. Gere um script para o barbeiro mostrar valor e justificar o preço, focando em benefícios exclusivos.`,
        'oferecer_pomada': `O barbeiro quer oferecer uma pomada/cera para o cliente que acabou de cortar o cabelo. Gere um script persuasivo que mostre o benefício do produto para manter o visual.`,
        'mudanca_visual': `O barbeiro quer sugerir uma mudança de visual (corte diferente, barba) para um cliente fiel. Gere um script que incentive o cliente a experimentar algo novo.`,
        'cliente_caspa': `O barbeiro notou que o cliente tem caspa ou couro cabeludo sensível. Gere um script delicado para oferecer um tratamento ou shampoo especial.`,
        'servico_extra': `O barbeiro quer oferecer um serviço extra (hidratação, sobrancelha, pigmentação). Gere um script para upsell que pareça natural.`,
        'fidelizacao': `O cliente está pagando e parece satisfeito. Gere um script para incentivar o retorno agendado ou indicação de amigos.`,
      };

      userPrompt = scenarioPrompts[scenario] || `Cenário: ${scenario}. Gere um script de vendas persuasivo para esta situação.`;
    } else {
      throw new Error("Tipo de requisição inválido");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Entre em contato com o suporte." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao processar requisição de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const aiMessage = data.choices?.[0]?.message?.content || "Não foi possível gerar uma resposta.";

    return new Response(JSON.stringify({ message: aiMessage, type: body.type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("barber-ai-assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
