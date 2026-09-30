import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";

export interface TicketTier {
  min: number;
  points: number;
}

export interface ChampionshipConfig {
  name: string;
  validation_enabled: boolean;
  min_revenue: number;
  revenue_enabled: boolean;
  revenue_points_per_1000: number;
  ticket_enabled: boolean;
  ticket_tiers: TicketTier[];
  products_enabled: boolean;
  product_points: number;
  extras_enabled: boolean;
  extra_points: number;
  extra_high_threshold: number;
  extra_high_multiplier: number;
  subscriptions_enabled: boolean;
  subscription_points: number;
  plan_multipliers: Record<string, number>;
  penalty_unconverted_enabled: boolean;
  penalty_unconverted_points: number;
  penalty_dayoff_enabled: boolean;
  penalty_dayoff_points: number;
}

export const DEFAULT_CHAMPIONSHIP_CONFIG: ChampionshipConfig = {
  name: "Campeonato Anual",
  validation_enabled: true,
  min_revenue: 15000,
  revenue_enabled: true,
  revenue_points_per_1000: 10,
  ticket_enabled: true,
  ticket_tiers: [
    { min: 130, points: 25 },
    { min: 110, points: 15 },
    { min: 100, points: 5 },
  ],
  products_enabled: true,
  product_points: 5,
  extras_enabled: true,
  extra_points: 3,
  extra_high_threshold: 100,
  extra_high_multiplier: 2,
  subscriptions_enabled: true,
  subscription_points: 10,
  plan_multipliers: {},
  penalty_unconverted_enabled: false,
  penalty_unconverted_points: 2,
  penalty_dayoff_enabled: false,
  penalty_dayoff_points: 4,
};

function parseRow(row: any): ChampionshipConfig {
  const tiers = Array.isArray(row?.ticket_tiers)
    ? (row.ticket_tiers as any[])
        .map((t) => ({ min: Number(t?.min) || 0, points: Number(t?.points) || 0 }))
        .sort((a, b) => b.min - a.min)
    : DEFAULT_CHAMPIONSHIP_CONFIG.ticket_tiers;

  const multipliers: Record<string, number> = {};
  if (row?.plan_multipliers && typeof row.plan_multipliers === "object") {
    Object.entries(row.plan_multipliers as Record<string, unknown>).forEach(([k, v]) => {
      const n = Number(v);
      if (Number.isFinite(n)) multipliers[k] = n;
    });
  }

  return {
    name: row?.name || DEFAULT_CHAMPIONSHIP_CONFIG.name,
    validation_enabled: row?.validation_enabled ?? true,
    min_revenue: Number(row?.min_revenue ?? 15000),
    revenue_enabled: row?.revenue_enabled ?? true,
    revenue_points_per_1000: Number(row?.revenue_points_per_1000 ?? 10),
    ticket_enabled: row?.ticket_enabled ?? true,
    ticket_tiers: tiers,
    products_enabled: row?.products_enabled ?? true,
    product_points: Number(row?.product_points ?? 5),
    extras_enabled: row?.extras_enabled ?? true,
    extra_points: Number(row?.extra_points ?? 3),
    extra_high_threshold: Number(row?.extra_high_threshold ?? 100),
    extra_high_multiplier: Number(row?.extra_high_multiplier ?? 2),
    subscriptions_enabled: row?.subscriptions_enabled ?? true,
    subscription_points: Number(row?.subscription_points ?? 10),
    plan_multipliers: multipliers,
    penalty_unconverted_enabled: row?.penalty_unconverted_enabled ?? false,
    penalty_unconverted_points: Number(row?.penalty_unconverted_points ?? 2),
    penalty_dayoff_enabled: row?.penalty_dayoff_enabled ?? false,
    penalty_dayoff_points: Number(row?.penalty_dayoff_points ?? 4),
  };
}

export function useChampionshipConfig() {
  const { organizationId } = useOrganization();
  const [config, setConfig] = useState<ChampionshipConfig>(DEFAULT_CHAMPIONSHIP_CONFIG);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("championship_configs")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (data) {
      setConfig(parseRow(data));
    } else {
      const { data: org } = await supabase
        .from("organizations")
        .select("championship_name")
        .eq("id", organizationId)
        .maybeSingle();
      setConfig({
        ...DEFAULT_CHAMPIONSHIP_CONFIG,
        name: org?.championship_name || DEFAULT_CHAMPIONSHIP_CONFIG.name,
      });
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(
    async (next: ChampionshipConfig) => {
      if (!organizationId) throw new Error("Organização não encontrada");

      const { error } = await supabase.from("championship_configs").upsert(
        {
          organization_id: organizationId,
          ...next,
          ticket_tiers: next.ticket_tiers as any,
          plan_multipliers: next.plan_multipliers as any,
        },
        { onConflict: "organization_id" }
      );
      if (error) throw error;

      await supabase
        .from("organizations")
        .update({ championship_name: next.name })
        .eq("id", organizationId);

      setConfig(next);
    },
    [organizationId]
  );

  return { config, loading, saveConfig, refetch: fetchConfig };
}
