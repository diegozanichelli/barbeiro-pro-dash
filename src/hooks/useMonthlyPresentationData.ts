import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isNewSubscription, isValidOpportunity } from "@/lib/metricsRules";
import { normalizePhoneForMetrics } from "@/lib/normalizers";
import { fetchAllRows } from "@/lib/supabasePagination";
import { manausDayStart, manausDayEnd } from "@/lib/dateUtils";

/** Evita que o TS parseie a select string (custo de typecheck). */
const sel = (s: string): string => s;


export interface MonthlyPresentationData {
  org_name: string;
  month: number;
  year: number;
  period_start: string;
  period_end: string;
  compare_start?: string;
  compare_end?: string;
  target_ratio?: number;
  kpis: { revenue: number; commission: number; clients: number; avg_ticket: number };
  kpis_previous: { revenue: number; commission: number; clients: number; avg_ticket: number };
  goals: {
    total_barbers: number;
    hit_count: number;
    champions: Array<{ name: string; unit: string | null; percent: number; earned: number; target: number }>;
  };
  ranking: Array<{ barber_id: string; name: string; unit: string | null; revenue: number; commission: number; clients: number; target: number; percent: number }>;
  units_performance: Array<{ unit_id: string; name: string; revenue: number; commission: number; clients: number; avg_ticket: number; target: number; percent: number }>;
  new_clients: { total: number; previous_total: number; by_unit: Array<{ unit: string; value: number }> };
  subscription_funnel: { new_clients: number; new_subscriptions: number; conversion_rate: number };
  subscription_health: {
    new: number; renew: number; upgrade: number; downgrade: number;
    mrr_delta: number;
    top_downgrade_reasons: Array<{ reason: string; count: number }>;
  };
  revenue_mix: { basic: number; extra: number; products: number };
  top_extras: Array<{ name: string; qty: number; total: number }>;
  top_products: Array<{ name: string; qty: number; total: number }>;
  best_day: { date: string | null; revenue: number; clients: number; star_barber: string | null; star_commission: number };
  alerts: Array<{ name: string; unit_name: string | null; earned: number; target_commission: number; percent: number }>;
  next_month_target: number;
  individual_evolution: Array<{
    barber_id: string; name: string;
    revenue_curr: number; revenue_prev: number; delta_pct: number | null;
    clients_curr: number; clients_prev: number;
    ticket_curr: number; ticket_prev: number;
  }>;
  weekday_heatmap: Array<{ weekday: number; total_revenue: number; days_count: number; avg_revenue: number }>;
  unit_weekday_heatmap: Array<{ unit_id: string; unit_name: string; weekday: number; total_revenue: number; days_count: number; avg_revenue: number }>;
  month_comparison: {
    revenue: { current: number; previous: number; delta_pct: number | null };
    clients: { current: number; previous: number; delta_pct: number | null };
    ticket: { current: number; previous: number; delta_pct: number | null };
    commission: { current: number; previous: number; delta_pct: number | null };
  };
  top_services_sold: Array<{ name: string; qty: number; revenue: number }>;
  top_products_sold: Array<{ name: string; qty: number; revenue: number }>;
  extras_penetration: { clients_with_extra: number; total_clients: number; pct_curr: number; pct_prev: number };
  product_sellers_ranking: Array<{ barber_name: string; qty: number; revenue: number }>;
  reception_sales: Array<{ unit_name: string; revenue: number; count: number }>;
  clients_new_vs_returning: { new_curr: number; returning_curr: number; new_prev: number; returning_prev: number };
  visit_frequency: { unique_clients: number; total_visits: number; avg_visits_per_client: number };
  top_subscription_sellers: Array<{ barber_name: string; new_subs_qty: number; mrr_generated: number }>;
  previous_month_goals: {
    hit: Array<{ barber: string; unit: string | null; pct: number; earned: number; target: number }>;
    missed: Array<{ barber: string; unit: string | null; pct: number; earned: number; target: number }>;
  };
  monthly_records: {
    best_day: { date: string | null; revenue: number };
    biggest_ticket: { value: number; barber: string | null; client: string | null };
    best_streak: { barber: string | null; days: number };
    top_barber: { name: string | null; revenue: number };
  };
  extras_sellers_ranking?: Array<{ barber_name: string; qty: number; revenue: number }>;
}


interface FunnelTxRow {
  item_type: string;
  subscription_action: string | null;
  is_new_client: boolean | null;
  mobile_phone: string | null;
  unit_id: string | null;
}

interface ExtrasTxRow {
  price_sold: number | null;
  barbers: { name: string } | null;
}

async function computeSsoTFunnel(periodStart: string, periodEnd: string, unitId: string | null) {
  // Paginado: o mês inteiro passa de 1000 linhas e era truncado silenciosamente.
  const data = await fetchAllRows<FunnelTxRow>(() => {
    let q = supabase
      .from("sale_transactions")
      .select(sel("item_type, subscription_action, is_new_client, mobile_phone, unit_id"))
      .gte("created_at", manausDayStart(periodStart))
      .lte("created_at", manausDayEnd(periodEnd));
    if (unitId) q = q.eq("unit_id", unitId);
    return q.returns<FunnelTxRow[]>();
  });

  const phones = new Set<string>();
  let newSubscriptions = 0;

  for (const tx of data) {
    const normalized = normalizePhoneForMetrics(tx.mobile_phone || null);
    if (isValidOpportunity(tx as any) && normalized) phones.add(normalized);
    if (isNewSubscription(tx as any) && tx.is_new_client === true) newSubscriptions++;
  }

  const newClients = phones.size;
  const conversionRate = newClients > 0 ? Number(((newSubscriptions / newClients) * 100).toFixed(1)) : 0;
  return { new_clients: newClients, new_subscriptions: newSubscriptions, conversion_rate: conversionRate };
}

async function computeExtrasSellersRanking(periodStart: string, periodEnd: string, unitId: string | null) {
  const data = await fetchAllRows<ExtrasTxRow>(() => {
    let q = supabase
      .from("sale_transactions")
      .select(sel("price_sold, barbers!inner(name)"))
      .eq("item_type", "service")
      .eq("service_category", "extra")
      .gte("created_at", manausDayStart(periodStart))
      .lte("created_at", manausDayEnd(periodEnd));
    if (unitId) q = q.eq("unit_id", unitId);
    return q.returns<ExtrasTxRow[]>();
  });

  const map = new Map<string, { qty: number; revenue: number }>();
  for (const row of data) {
    const name = row.barbers?.name;
    if (!name) continue;
    const cur = map.get(name) || { qty: 0, revenue: 0 };
    cur.qty += 1;
    cur.revenue += Number(row.price_sold || 0);
    map.set(name, cur);
  }
  return Array.from(map.entries())
    .map(([barber_name, v]) => ({ barber_name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}


interface RangeParams {
  periodStart: string;
  periodEnd: string;
  compareStart: string;
  compareEnd: string;
  targetRatio: number;
  unitId: string | null;
}

export function useMonthlyPresentationData(params: RangeParams) {
  const { periodStart, periodEnd, compareStart, compareEnd, targetRatio, unitId } = params;
  const [data, setData] = useState<MonthlyPresentationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_presentation_data_range" as never, {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_compare_start: compareStart,
      p_compare_end: compareEnd,
      p_unit_id: unitId,
      p_target_ratio: targetRatio,
    } as never);
    if (rpcError) {
      console.error("get_presentation_data_range error", rpcError);
      setError(rpcError.message);
      setData(null);
      setLoading(false);
      return;
    }
    const baseData = rpcData as unknown as MonthlyPresentationData;
    try {
      const [ssotFunnel, unitHeatmap, extrasSellers] = await Promise.all([
        computeSsoTFunnel(periodStart, periodEnd, unitId),
        supabase.rpc("get_unit_weekday_heatmap" as never, {
          p_period_start: periodStart,
          p_period_end: periodEnd,
          p_unit_id: unitId,
        } as never),
        computeExtrasSellersRanking(periodStart, periodEnd, unitId),
      ]);
      setData({
        ...baseData,
        subscription_funnel: ssotFunnel,
        unit_weekday_heatmap: (unitHeatmap.data ?? []) as unknown as MonthlyPresentationData["unit_weekday_heatmap"],
        extras_sellers_ranking: extrasSellers,
      });
    } catch (err: any) {
      console.error("Erro ao carregar dados complementares", err);
      setData(baseData);
    }
    setLoading(false);
  }, [periodStart, periodEnd, compareStart, compareEnd, targetRatio, unitId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
