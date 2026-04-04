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

    // Get current date in Manaus timezone (GMT-4)
    const now = new Date();
    const manausOffset = -4 * 60;
    const manausTime = new Date(now.getTime() + (now.getTimezoneOffset() + manausOffset) * 60000);
    const currentMonth = manausTime.getMonth() + 1;
    const currentYear = manausTime.getFullYear();
    const currentDay = manausTime.getDate();
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    const barberIds = [...new Set(subscriptions.map(s => s.barber_id))];
    const orgIds = [...new Set(subscriptions.map(s => s.organization_id))];

    // Fetch goals, productions, and holidays in parallel
    const [goalsRes, productionsRes, holidaysRes] = await Promise.all([
      supabase
        .from('monthly_goals')
        .select('barber_id, target_commission, work_days')
        .in('barber_id', barberIds)
        .eq('month', currentMonth)
        .eq('year', currentYear),
      supabase
        .from('daily_productions')
        .select('barber_id, date, commission_earned, services_total, products_total, services_basic_total, services_extra_total, tx_basic_total, tx_extra_total, tx_products_total, confirmed_presence, presence_type')
        .in('barber_id', barberIds)
        .gte('date', `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`)
        .lte('date', todayStr),
      supabase
        .from('organization_holidays')
        .select('date, organization_id')
        .in('organization_id', orgIds)
        .gte('date', todayStr)
        .lte('date', `${currentYear}-${String(currentMonth).padStart(2, '0')}-${new Date(currentYear, currentMonth, 0).getDate()}`),
    ]);

    const goals = goalsRes.data || [];
    const productions = productionsRes.data || [];
    const holidays = holidaysRes.data || [];

    const goalsMap = new Map<string, { target_commission: number; work_days: number }>();
    goals.forEach(g => goalsMap.set(g.barber_id, g));

    // Build holidays set per org
    const orgHolidaysMap = new Map<string, Set<string>>();
    holidays.forEach(h => {
      if (!orgHolidaysMap.has(h.organization_id)) {
        orgHolidaysMap.set(h.organization_id, new Set());
      }
      orgHolidaysMap.get(h.organization_id)!.add(h.date);
    });

    // Build accumulated commission and today's revenue per barber (using commission_earned like dashboard)
    const monthCommissionMap = new Map<string, number>();
    const todayRevenueMap = new Map<string, number>();
    const scheduledOffMap = new Map<string, string[]>();

    productions.forEach(p => {
      // Accumulated commission (same as dashboard)
      const commission = Number(p.commission_earned) || 0;
      monthCommissionMap.set(p.barber_id, (monthCommissionMap.get(p.barber_id) || 0) + commission);

      // Today's revenue for progress display
      if (p.date === todayStr) {
        const rev = getRevenue(p);
        todayRevenueMap.set(p.barber_id, (todayRevenueMap.get(p.barber_id) || 0) + rev);
      }

      // Track scheduled off days
      if (["day_off", "absence", "optional_sunday"].includes(p.presence_type ?? "")) {
        if (!scheduledOffMap.has(p.barber_id)) scheduledOffMap.set(p.barber_id, []);
        if (p.date >= todayStr) {
          scheduledOffMap.get(p.barber_id)!.push(p.date);
        }
      }
    });

    // Calculate remaining work days (same logic as dashboard's calculateRemainingWorkDays)
    function calcRemainingWorkDays(orgId: string, barberId: string): number {
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const holidaysSet = orgHolidaysMap.get(orgId) || new Set();
      const offDates = scheduledOffMap.get(barberId) || [];
      const offSet = new Set(offDates);

      let count = 0;
      for (let d = currentDay; d <= daysInMonth; d++) {
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!holidaysSet.has(dateStr) && !offSet.has(dateStr)) {
          count++;
        }
      }
      return Math.max(1, count);
    }

    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

    let sentCount = 0;
    const errors: string[] = [];

    for (const sub of subscriptions) {
      const goal = goalsMap.get(sub.barber_id);
      if (!goal) continue;

      const orgId = sub.organization_id;
      const monthCommission = monthCommissionMap.get(sub.barber_id) || 0;
      const todayRevenue = todayRevenueMap.get(sub.barber_id) || 0;
      const remainingDays = calcRemainingWorkDays(orgId, sub.barber_id);

      // Daily target based on COMMISSION remaining (same as dashboard)
      const remainingCommission = Math.max(0, goal.target_commission - monthCommission);
      const dailyTarget = remainingCommission / remainingDays;

      // Progress percentages
      const monthPct = goal.target_commission > 0 ? Math.min(999, (monthCommission / goal.target_commission) * 100) : 100;
      // For today's progress, use today's revenue vs daily target
      const dayPct = dailyTarget > 0 ? Math.min(999, (todayRevenue / dailyTarget) * 100) : 100;

      const barberName = (sub as any).barbers?.name || 'Barbeiro';
      const type = schedule_type || 'manual';
      const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      let title = '';
      let messageBody = '';

      const progressMsg = (): string => {
        if (dayPct >= 100) return `🏆 Meta do dia batida! ${formatCurrency(todayRevenue)} de ${formatCurrency(dailyTarget)}. Mês: ${monthPct.toFixed(0)}% da meta.`;
        if (dayPct >= 75) return `🔥 Quase lá! ${formatCurrency(todayRevenue)} de ${formatCurrency(dailyTarget)} (${dayPct.toFixed(0)}%). Falta pouco!`;
        if (dayPct >= 50) return `💪 Metade da meta! ${formatCurrency(todayRevenue)} de ${formatCurrency(dailyTarget)} (${dayPct.toFixed(0)}%). Bora manter o ritmo!`;
        if (dayPct >= 25) return `📈 Bom progresso! ${formatCurrency(todayRevenue)} de ${formatCurrency(dailyTarget)} (${dayPct.toFixed(0)}%). Vamos acelerar!`;
        if (todayRevenue > 0) return `Vendas hoje: ${formatCurrency(todayRevenue)} de ${formatCurrency(dailyTarget)} (${dayPct.toFixed(0)}%). Vamos pra cima! 💪`;
        return `Ainda sem vendas hoje. Meta do dia: ${formatCurrency(dailyTarget)}. Bora começar! 🚀`;
      };

      switch (type) {
        case 'morning':
          title = `☀️ Bom dia, ${barberName}!`;
          messageBody = `Sua meta de vendas para hoje é ${formatCurrency(dailyTarget)}. Meta do mês: ${formatCurrency(goal.target_commission)} (${monthPct.toFixed(0)}% alcançado). Bora fazer acontecer! 💪`;
          break;
        case 'lunch':
          title = `🍽️ Hora do almoço, ${barberName}`;
          messageBody = progressMsg();
          break;
        case 'afternoon':
          title = `⚡ Reta final, ${barberName}`;
          messageBody = progressMsg();
          break;
        case 'evening':
          title = `🌙 Fim do expediente, ${barberName}`;
          if (dayPct >= 100) {
            messageBody = `Dia incrível! 🏆 Vendas: ${formatCurrency(todayRevenue)}. Você bateu ${dayPct.toFixed(0)}% da meta! Mês: ${monthPct.toFixed(0)}%.`;
          } else {
            messageBody = `Vendas hoje: ${formatCurrency(todayRevenue)} (${dayPct.toFixed(0)}% da meta). Mês: ${monthPct.toFixed(0)}%. Amanhã é um novo dia! 💪`;
          }
          break;
        default:
          title = `📊 Atualização - ${barberName}`;
          messageBody = progressMsg();
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

// Helper to calculate revenue from a production row
function getRevenue(p: any): number {
  if ((Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0) + (Number(p.tx_products_total) || 0) > 0) {
    return (Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0) + (Number(p.tx_products_total) || 0);
  }
  if (p.services_basic_total != null || p.services_extra_total != null) {
    return (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0) + (Number(p.products_total) || 0);
  }
  return (Number(p.services_total) || 0) + (Number(p.products_total) || 0);
}
