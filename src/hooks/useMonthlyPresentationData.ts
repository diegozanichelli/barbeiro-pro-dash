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
