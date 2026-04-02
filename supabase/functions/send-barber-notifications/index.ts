import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY = 'BJWqyxYQwkLjpMGvpuDJ9aYFWkvZ7Hg3DHqfTJXATE6SeYTr7sj0SNxRC9aj29PPmYPiRB3fzyuudNPzZlHpimA';

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const cleanPrivateKey = vapidPrivateKey.trim().replace(/^["']|["']$/g, '').replace(/=+$/, '');
    
    webpush.setVapidDetails(
      'mailto:noreply@performancebarber.com',
      VAPID_PUBLIC_KEY,
      cleanPrivateKey
    );

    const body = await req.json().catch(() => ({}));
    const { schedule_type, organization_id, barber_id } = body;

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

    const barberIds = [...new Set(subscriptions.map(s => s.barber_id))];

    const { data: goals } = await supabase
      .from('monthly_goals')
      .select('barber_id, target_commission, work_days')
      .in('barber_id', barberIds)
      .eq('month', currentMonth)
      .eq('year', currentYear);

    const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const { data: productions } = await supabase
      .from('daily_productions')
      .select('barber_id, date, commission_earned, services_total, products_total, services_basic_total, services_extra_total, tx_basic_total, tx_extra_total, tx_products_total')
      .in('barber_id', barberIds)
      .gte('date', startOfMonth)
      .lte('date', todayStr);

    const goalsMap = new Map<string, { target_commission: number; work_days: number }>();
    (goals || []).forEach(g => goalsMap.set(g.barber_id, g));

    // Helper to calculate revenue from a production row
    const getRevenue = (p: any): number => {
      if ((Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0) + (Number(p.tx_products_total) || 0) > 0) {
        return (Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0) + (Number(p.tx_products_total) || 0);
      }
      if (p.services_basic_total != null || p.services_extra_total != null) {
        return (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0) + (Number(p.products_total) || 0);
      }
      return (Number(p.services_total) || 0) + (Number(p.products_total) || 0);
    };

    const monthRevenueMap = new Map<string, number>();
    const todayRevenueMap = new Map<string, number>();
    const monthCommissionMap = new Map<string, number>();
    (productions || []).forEach(p => {
      const rev = getRevenue(p);
      monthRevenueMap.set(p.barber_id, (monthRevenueMap.get(p.barber_id) || 0) + rev);
      monthCommissionMap.set(p.barber_id, (monthCommissionMap.get(p.barber_id) || 0) + Number(p.commission_earned));
      if (p.date === todayStr) {
        todayRevenueMap.set(p.barber_id, (todayRevenueMap.get(p.barber_id) || 0) + rev);
      }
    });

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

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
        sentCount++;
      } catch (err: any) {
        console.error(`Push error for ${barberName}:`, err.message || err);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
        }
        errors.push(`${barberName}: ${err.message || err.statusCode}`);
      }
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        total: subscriptions.length,
        errors: errors.length > 0 ? errors : undefined,
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
