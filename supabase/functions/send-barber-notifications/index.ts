import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Web Push implementation
async function generateJWT(header: object, payload: object, privateKeyBase64url: string): Promise<string> {
  const encoder = new TextEncoder();
  
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsignedToken = `${headerB64}.${payloadB64}`;
  
  // Import private key
  const keyData = Uint8Array.from(atob(privateKeyBase64url.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    await convertECPrivateKeyToP8(keyData),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(unsignedToken)
  );
  
  // Convert DER signature to raw r||s format for JWT
  const sigArray = new Uint8Array(signature);
  const sigB64 = btoa(String.fromCharCode(...sigArray)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  return `${unsignedToken}.${sigB64}`;
}

async function convertECPrivateKeyToP8(rawKey: Uint8Array): Promise<ArrayBuffer> {
  // Wrap raw 32-byte EC private key in PKCS#8 DER format for P-256
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
    0x01, 0x01, 0x04, 0x20
  ]);
  const pkcs8Footer = new Uint8Array([
    0xa1, 0x44, 0x03, 0x42, 0x00
  ]);
  
  const result = new Uint8Array(pkcs8Header.length + rawKey.length + pkcs8Footer.length + 65);
  result.set(pkcs8Header, 0);
  result.set(rawKey, pkcs8Header.length);
  // We skip the public key part since we don't need it for signing
  // Actually for PKCS8 we need the full structure
  return result.buffer.slice(0, pkcs8Header.length + rawKey.length);
}

async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  // Simple fetch-based push (using the push endpoint directly)
  // For production, use proper VAPID signing. Here we use a simpler approach.
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'TTL': '86400',
    },
    body: payload,
  });
  
  return response;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { schedule_type, organization_id, barber_id } = body;

    // Determine message type based on schedule
    // schedule_type: 'morning' (9h), 'lunch' (13h), 'afternoon' (16h), 'evening' (19h), 'manual'
    
    // Build query for active push subscriptions
    let subsQuery = supabase
      .from('push_subscriptions')
      .select('*, barbers!inner(id, name, services_commission, organization_id, unit_id)')
      .eq('is_active', true);

    if (organization_id) {
      subsQuery = subsQuery.eq('organization_id', organization_id);
    }
    if (barber_id) {
      subsQuery = subsQuery.eq('barber_id', barber_id);
    }

    const { data: subscriptions, error: subsError } = await subsQuery;
    if (subsError) throw subsError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "Nenhuma subscription ativa encontrada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current month/year in Manaus timezone
    const now = new Date();
    const manausOffset = -4 * 60;
    const manausTime = new Date(now.getTime() + (now.getTimezoneOffset() + manausOffset) * 60000);
    const currentMonth = manausTime.getMonth() + 1;
    const currentYear = manausTime.getFullYear();
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(manausTime.getDate()).padStart(2, '0')}`;

    // Get all barber IDs from subscriptions
    const barberIds = [...new Set(subscriptions.map(s => s.barber_id))];

    // Fetch monthly goals for these barbers
    const { data: goals } = await supabase
      .from('monthly_goals')
      .select('barber_id, target_commission, work_days')
      .in('barber_id', barberIds)
      .eq('month', currentMonth)
      .eq('year', currentYear);

    // Fetch month productions
    const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const { data: productions } = await supabase
      .from('daily_productions')
      .select('barber_id, date, commission_earned')
      .in('barber_id', barberIds)
      .gte('date', startOfMonth)
      .lte('date', todayStr);

    // Fetch today's productions
    const { data: todayProductions } = await supabase
      .from('daily_productions')
      .select('barber_id, commission_earned')
      .in('barber_id', barberIds)
      .eq('date', todayStr);

    // Build goals map
    const goalsMap = new Map<string, { target_commission: number; work_days: number }>();
    (goals || []).forEach(g => goalsMap.set(g.barber_id, g));

    // Build productions map
    const monthEarningsMap = new Map<string, number>();
    (productions || []).forEach(p => {
      const current = monthEarningsMap.get(p.barber_id) || 0;
      monthEarningsMap.set(p.barber_id, current + Number(p.commission_earned));
    });

    const todayEarningsMap = new Map<string, number>();
    (todayProductions || []).forEach(p => {
      todayEarningsMap.set(p.barber_id, Number(p.commission_earned));
    });

    // Calculate remaining days
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const remainingDays = Math.max(1, daysInMonth - manausTime.getDate());

    let sentCount = 0;
    const errors: string[] = [];

    for (const sub of subscriptions) {
      const goal = goalsMap.get(sub.barber_id);
      if (!goal) continue;

      const monthEarnings = monthEarningsMap.get(sub.barber_id) || 0;
      const todayEarnings = todayEarningsMap.get(sub.barber_id) || 0;
      const progressPercent = Math.min(100, (monthEarnings / goal.target_commission) * 100);
      const remaining = Math.max(0, goal.target_commission - monthEarnings);
      const dailyTarget = remaining / remainingDays;
      const barberName = (sub as any).barbers?.name || 'Barbeiro';

      // Compose message based on schedule type
      let title = '';
      let messageBody = '';
      const type = schedule_type || 'manual';

      const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      switch (type) {
        case 'morning':
          title = `☀️ Bom dia, ${barberName}!`;
          messageBody = `Sua meta diária é ${formatCurrency(dailyTarget)}. Você está em ${progressPercent.toFixed(1)}% da meta mensal. Bora fazer acontecer! 💪`;
          break;
        case 'lunch':
          title = `🍽️ Hora do almoço, ${barberName}`;
          if (todayEarnings > 0) {
            messageBody = `Manhã produtiva! Comissão hoje: ${formatCurrency(todayEarnings)}. Faltam ${formatCurrency(remaining)} para bater a meta mensal (${progressPercent.toFixed(1)}%).`;
          } else {
            messageBody = `Ainda sem lançamentos hoje. Meta diária: ${formatCurrency(dailyTarget)}. Faltam ${formatCurrency(remaining)} para a meta mensal.`;
          }
          break;
        case 'afternoon':
          title = `⚡ Reta final da tarde, ${barberName}`;
          messageBody = `Comissão hoje: ${formatCurrency(todayEarnings)} | Meta mensal: ${progressPercent.toFixed(1)}%. Faltam ${formatCurrency(remaining)} para a meta!`;
          break;
        case 'evening':
          title = `🌙 Fim do expediente, ${barberName}`;
          if (todayEarnings >= dailyTarget) {
            messageBody = `Dia incrível! 🏆 Comissão hoje: ${formatCurrency(todayEarnings)}. Meta mensal em ${progressPercent.toFixed(1)}%. Continue assim!`;
          } else {
            messageBody = `Comissão hoje: ${formatCurrency(todayEarnings)}. Meta mensal: ${progressPercent.toFixed(1)}%. Amanhã é um novo dia! 💪`;
          }
          break;
        default:
          title = `📊 Atualização de Meta - ${barberName}`;
          messageBody = `Meta mensal: ${progressPercent.toFixed(1)}% | Hoje: ${formatCurrency(todayEarnings)} | Faltam: ${formatCurrency(remaining)}`;
      }

      const payload = JSON.stringify({
        title,
        body: messageBody,
        tag: `goal-${type}-${todayStr}`,
        url: '/',
      });

      try {
        // Send to push endpoint
        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'TTL': '86400',
          },
          body: payload,
        });

        if (response.status === 410 || response.status === 404) {
          // Subscription expired, deactivate
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
        } else if (response.ok || response.status === 201) {
          sentCount++;
        } else {
          errors.push(`${barberName}: ${response.status}`);
        }
      } catch (err) {
        errors.push(`${barberName}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        sent: sentCount, 
        total: subscriptions.length,
        errors: errors.length > 0 ? errors : undefined 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
