import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MonthlyPresentationData {
  org_name: string;
  month: number;
  year: number;
  period_start: string;
  period_end: string;
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

  // Novos blocos
  individual_evolution: Array<{
    barber_id: string; name: string;
    revenue_curr: number; revenue_prev: number; delta_pct: number | null;
    clients_curr: number; clients_prev: number;
    ticket_curr: number; ticket_prev: number;
  }>;
  weekday_heatmap: Array<{ weekday: number; total_revenue: number; days_count: number; avg_revenue: number }>;
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
}

export function useMonthlyPresentationData(month: number, year: number, unitId: string | null) {
  const [data, setData] = useState<MonthlyPresentationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_monthly_presentation", {
      p_month: month,
      p_year: year,
      p_unit_id: unitId,
    });
    if (rpcError) {
      console.error("get_monthly_presentation error", rpcError);
      setError(rpcError.message);
      setData(null);
    } else {
      setData(rpcData as unknown as MonthlyPresentationData);
    }
    setLoading(false);
  }, [month, year, unitId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
