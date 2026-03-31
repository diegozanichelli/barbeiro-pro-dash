import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeBase64Url(value: string): string {
  const normalized = value.trim().replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return normalized.replace(/=+$/g, "") + padding;
}

function isValidBase64Url(value: string): boolean {
  return /^[A-Za-z0-9\-_]+=*$/.test(value);
}

function assertDecodableBase64Url(value: string, fieldName: string) {
  try {
    atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    throw new Error(`Invalid ${fieldName}: Failed to decode base64`);
  }
}

function configureWebPush() {
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:suporte@performancebarber.com";

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error("Secrets de push ausentes: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.");
  }

  const normalizedPublic = normalizeBase64Url(vapidPublicKey);
  const normalizedPrivate = normalizeBase64Url(vapidPrivateKey);

  if (!isValidBase64Url(normalizedPublic) || !isValidBase64Url(normalizedPrivate)) {
    throw new Error("Chaves VAPID inválidas: verifique o formato base64url das secrets.");
  }

  assertDecodableBase64Url(normalizedPublic, "VAPID public key");
  assertDecodableBase64Url(normalizedPrivate, "VAPID private key");

  webpush.setVapidDetails(vapidSubject, normalizedPublic, normalizedPrivate);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    configureWebPush();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { schedule_type, organization_id, barber_id } = body;

    // Determine message type based on schedule
    // schedule_type: 'morning' (9h), 'lunch' (13h), 'afternoon' (16h), 'evening' (20h), 'manual'
    
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
    const errors = new Set<string>();

    for (const sub of subscriptions) {
      const goal = goalsMap.get(sub.barber_id);
      if (!goal) continue;

      const monthEarnings = monthEarningsMap.get(sub.barber_id) || 0;
      const todayEarnings = todayEarningsMap.get(sub.barber_id) || 0;
      const progressPercent = Math.min(100, (monthEarnings / goal.target_commission) * 100);
      const remaining = Math.max(0, goal.target_commission - monthEarnings);
      const dailyTarget = remaining / remainingDays;
      const barberName = (sub as any).barbers?.name || 'Barbeiro';

      // Compose message based on schedule type (foco em meta de vendas, sem exibir comissão)
      let title = '';
      let messageBody = '';
      const type = schedule_type || 'manual';

      const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      switch (type) {
        case 'morning':
          title = `☀️ Bom dia, ${barberName}!`;
          messageBody = `Seu foco de vendas hoje é ${formatCurrency(dailyTarget)}. Você está em ${progressPercent.toFixed(1)}% da meta mensal. Bora fazer acontecer! 💪`;
          break;
        case 'lunch':
          title = `🍽️ Hora do almoço, ${barberName}`;
          if (todayEarnings > 0) {
            messageBody = `Manhã produtiva! Vendas até agora: ${formatCurrency(todayEarnings)}. Faltam ${formatCurrency(Math.max(0, dailyTarget - todayEarnings))} para bater a meta de hoje.`;
          } else {
            messageBody = `Ainda sem vendas registradas hoje. Meta de vendas do dia: ${formatCurrency(dailyTarget)}.`;
          }
          break;
        case 'afternoon':
          title = `⚡ Reta final da tarde, ${barberName}`;
          messageBody = `Vendas hoje: ${formatCurrency(todayEarnings)} | Meta de hoje: ${formatCurrency(dailyTarget)} | Faltam ${formatCurrency(Math.max(0, dailyTarget - todayEarnings))} para fechar o dia.`;
          break;
        case 'evening':
          title = `🌙 Fim do expediente, ${barberName}`;
          if (todayEarnings >= dailyTarget) {
            messageBody = `Dia incrível! 🏆 Você bateu sua meta de vendas diária com ${formatCurrency(todayEarnings)}. Continue assim!`;
          } else {
            messageBody = `Você fechou o dia com ${formatCurrency(todayEarnings)} em vendas. Faltaram ${formatCurrency(Math.max(0, dailyTarget - todayEarnings))} para a meta diária. Amanhã é um novo dia! 💪`;
          }
          break;
        default:
          title = `📊 Atualização de Meta - ${barberName}`;
          messageBody = `Meta de hoje: ${formatCurrency(dailyTarget)} | Vendas hoje: ${formatCurrency(todayEarnings)} | Faltam ${formatCurrency(Math.max(0, dailyTarget - todayEarnings))} para fechar o dia.`;
      }

      const payload = JSON.stringify({
        title,
        body: messageBody,
        tag: `goal-${type}-${todayStr}`,
        url: '/',
      });

      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: normalizeBase64Url(sub.p256dh),
            auth: normalizeBase64Url(sub.auth),
          },
        };

        if (!isValidBase64Url(pushSubscription.keys.p256dh) || !isValidBase64Url(pushSubscription.keys.auth)) {
          throw new Error("Invalid subscription key format");
        }
        assertDecodableBase64Url(pushSubscription.keys.p256dh, "p256dh");
        assertDecodableBase64Url(pushSubscription.keys.auth, "auth");

        const response = await webpush.sendNotification(pushSubscription, payload, {
          TTL: 86400,
        });

        if (response.statusCode === 410 || response.statusCode === 404) {
          // Subscription expired, deactivate
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
        } else if (response.statusCode >= 200 && response.statusCode < 300) {
          sentCount++;
        } else {
          errors.add(`${barberName}: status ${response.statusCode}`);
        }
      } catch (err) {
        const message = (err as Error).message || "erro desconhecido";

        if (message.toLowerCase().includes("decode base64")) {
          errors.add(`${barberName}: assinatura push inválida. Reative as notificações nesse dispositivo.`);
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("id", sub.id);
          continue;
        }

        if (message.toLowerCase().includes("invalid subscription key")) {
          errors.add(`${barberName}: assinatura push inválida. Reative as notificações nesse dispositivo.`);
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("id", sub.id);
          continue;
        }

        errors.add(`${barberName}: ${message}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        sent: sentCount, 
        total: subscriptions.length,
        errors: errors.size > 0 ? [...errors] : undefined 
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
