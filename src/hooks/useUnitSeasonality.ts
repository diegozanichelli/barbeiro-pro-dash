import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SeasonalitySource = "linear" | "previous_year" | "trailing_3m" | "combined" | "manual";

export interface UnitWeeklyWeights {
  weights: number[]; // length 5
  source_used: SeasonalitySource;
  has_history: boolean;
}

const cache = new Map<string, UnitWeeklyWeights>();

export async function fetchUnitWeeklyWeights(
  unitId: string,
  month: number,
  year: number
): Promise<UnitWeeklyWeights> {
  const key = `${unitId}:${year}-${month}`;
  if (cache.has(key)) return cache.get(key)!;
  const { data, error } = await supabase.rpc("get_unit_weekly_weights" as never, {
    p_unit_id: unitId,
    p_month: month,
    p_year: year,
  } as never);
  if (error || !data) {
    const fallback: UnitWeeklyWeights = {
      weights: [0.2, 0.2, 0.2, 0.2, 0.2],
      source_used: "linear",
      has_history: false,
    };
    cache.set(key, fallback);
    return fallback;
  }
  const result = data as unknown as UnitWeeklyWeights;
  cache.set(key, result);
  return result;
}

/** Returns 1..5 slice index for a given day-of-month (slices: 1-7, 8-14, 15-21, 22-28, 29-end). */
export function weekSliceForDay(day: number): number {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

export function sliceRange(slice: number): { start: number; end: number } {
  if (slice === 1) return { start: 1, end: 7 };
  if (slice === 2) return { start: 8, end: 14 };
  if (slice === 3) return { start: 15, end: 21 };
  if (slice === 4) return { start: 22, end: 28 };
  return { start: 29, end: 31 };
}

export interface UnitSeasonalityConfigRow {
  unit_id: string;
  source: SeasonalitySource;
  manual_weights: number[] | null;
}

export function useUnitSeasonalityConfig(organizationId: string | null) {
  const [rows, setRows] = useState<UnitSeasonalityConfigRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("unit_seasonality_config" as never)
      .select("unit_id, source, manual_weights")
      .eq("organization_id", organizationId);
    setRows((data as unknown as UnitSeasonalityConfigRow[]) || []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const invalidateUnit = (unitId: string) => {
    for (const k of Array.from(cache.keys())) {
      if (k.startsWith(`${unitId}:`)) cache.delete(k);
    }
  };

  const upsert = useCallback(
    async (unitId: string, source: SeasonalitySource, manualWeights?: number[] | null) => {
      if (!organizationId) return;
      const payload: Record<string, unknown> = {
        unit_id: unitId,
        organization_id: organizationId,
        source,
      };
      if (manualWeights !== undefined) payload.manual_weights = manualWeights;
      await supabase.from("unit_seasonality_config" as never).upsert(
        payload as never,
        { onConflict: "unit_id" } as never
      );
      invalidateUnit(unitId);
      await fetchData();
    },
    [organizationId, fetchData]
  );

  const saveManualWeights = useCallback(
    async (unitId: string, weights: number[]) => {
      if (!organizationId) return;
      await supabase.from("unit_seasonality_config" as never).upsert(
        {
          unit_id: unitId,
          organization_id: organizationId,
          source: "manual",
          manual_weights: weights,
        } as never,
        { onConflict: "unit_id" } as never
      );
      invalidateUnit(unitId);
      await fetchData();
    },
    [organizationId, fetchData]
  );

  return { rows, loading, upsert, saveManualWeights, refetch: fetchData };
}
