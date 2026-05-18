import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SlideOverridePayload = Record<string, unknown>;
export type SlideOverridesMap = Record<string, SlideOverridePayload>;

interface UsePresentationOverridesResult {
  overrides: SlideOverridesMap;
  loading: boolean;
  saveOverride: (slideKey: string, payload: SlideOverridePayload) => Promise<void>;
  resetOverride: (slideKey: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function usePresentationOverrides(
  organizationId: string | null,
  month: number,
  year: number,
  unitKey: string
): UsePresentationOverridesResult {
  const [overrides, setOverrides] = useState<SlideOverridesMap>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("presentation_slide_overrides")
      .select("slide_key, payload")
      .eq("organization_id", organizationId)
      .eq("month", month)
      .eq("year", year)
      .eq("unit_key", unitKey || "all");
    const map: SlideOverridesMap = {};
    (data ?? []).forEach((row) => {
      map[row.slide_key] = (row.payload as SlideOverridePayload) || {};
    });
    setOverrides(map);
    setLoading(false);
  }, [organizationId, month, year, unitKey]);

  useEffect(() => { load(); }, [load]);

  const saveOverride = useCallback(
    async (slideKey: string, payload: SlideOverridePayload) => {
      if (!organizationId) return;
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("presentation_slide_overrides")
        .upsert(
          [{
            organization_id: organizationId,
            month,
            year,
            unit_key: unitKey || "all",
            slide_key: slideKey,
            payload: payload as never,
            updated_by: userData?.user?.id ?? null,
          }],
          { onConflict: "organization_id,month,year,unit_key,slide_key" }
        );
      if (error) throw error;
      setOverrides((prev) => ({ ...prev, [slideKey]: payload }));
    },
    [organizationId, month, year, unitKey]
  );

  const resetOverride = useCallback(
    async (slideKey: string) => {
      if (!organizationId) return;
      await supabase
        .from("presentation_slide_overrides")
        .delete()
        .eq("organization_id", organizationId)
        .eq("month", month)
        .eq("year", year)
        .eq("unit_key", unitKey || "all")
        .eq("slide_key", slideKey);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[slideKey];
        return next;
      });
    },
    [organizationId, month, year, unitKey]
  );

  return { overrides, loading, saveOverride, resetOverride, reload: load };
}
