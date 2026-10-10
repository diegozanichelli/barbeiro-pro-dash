import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePagination";
import { manausDayStart, manausDayEnd, TIMEZONE } from "@/lib/dateUtils";
import { formatInTimeZone } from "date-fns-tz";
import { getWeekRanges, weeklyMeta, countsForWeeklyRevenue } from "@/lib/weeklyGoals";

export interface WeeklyUnitGoalRow {
  unitId: string;
  unitName: string;
  base: number; // faturamento da semana anterior
  growthPct: number; // % cadastrado pelo gestor
  meta: number; // base × (1 + growth%)
  realizado: number; // faturamento da semana corrente
  pct: number; // realizado / meta (0..1+)
}

interface WeeklyTx {
  unit_id: string | null;
  barber_id: string | null;
  item_type: string | null;
  subscription_action: string | null;
  price_sold: number | null;
  created_at: string;
}

export interface UseWeeklyUnitGoalsResult {
  loading: boolean;
  rows: WeeklyUnitGoalRow[];
  total: { base: number; meta: number; realizado: number; pct: number };
  weekLabel: { currentStart: string; currentEnd: string; prevStart: string; prevEnd: string };
  refetch: () => void;
}

/**
 * Meta semanal por unidade (seg–dom): Base = semana anterior, Meta = Base × (1+%),
 * Realizado = semana corrente. Métrica = faturamento total da unidade
 * (assinaturas balcão/renovação/online + serviços + produtos), via sale_transactions.
 */
export function useWeeklyUnitGoals(organizationId: string | undefined): UseWeeklyUnitGoalsResult {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WeeklyUnitGoalRow[]>([]);
  const [total, setTotal] = useState({ base: 0, meta: 0, realizado: 0, pct: 0 });
  const [ranges, setRanges] = useState(() => getWeekRanges());
  const [token, setToken] = useState(0);

  const refetch = useCallback(() => setToken((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const weeks = getWeekRanges();
      setRanges(weeks);
      try {
        const [unitsRes, barbersRes, growthRes] = await Promise.all([
          supabase.from("units").select("id, name").eq("organization_id", organizationId).eq("status", "active").order("name"),
          supabase.from("barbers").select("id, unit_id").eq("organization_id", organizationId),
          supabase.from("unit_weekly_growth").select("unit_id, growth_pct").eq("organization_id", organizationId),
        ]);
        if (cancelled) return;
        const units = unitsRes.data || [];
        const barberUnit = new Map<string, string | null>();
        (barbersRes.data || []).forEach((b: { id: string; unit_id: string | null }) => barberUnit.set(b.id, b.unit_id));
        const growthByUnit = new Map<string, number>();
        (growthRes.data || []).forEach((g: { unit_id: string; growth_pct: number }) =>
          growthByUnit.set(g.unit_id, Number(g.growth_pct) || 0),
        );

        const txs = await fetchAllRows<WeeklyTx>(() =>
          supabase
            .from("sale_transactions")
            .select("unit_id, barber_id, item_type, subscription_action, price_sold, created_at")
            .eq("organization_id", organizationId)
            // Fonte de verdade do gestor (e da controladoria). Sem isto, linhas
            // source='barber' (produção lançada pelo barbeiro) duplicariam o faturamento.
            .eq("source", "manager")
            .gte("created_at", manausDayStart(weeks.prevStart))
            .lte("created_at", manausDayEnd(weeks.currentEnd)) as never,
        );
        if (cancelled) return;

        // base (semana anterior) e realizado (semana corrente) por unidade.
        const base = new Map<string, number>();
        const real = new Map<string, number>();
        for (const tx of txs) {
          if (!countsForWeeklyRevenue(tx)) continue;
          const unitId = tx.unit_id || (tx.barber_id ? barberUnit.get(tx.barber_id) ?? null : null);
          if (!unitId) continue;
          const dk = formatInTimeZone(new Date(tx.created_at), TIMEZONE, "yyyy-MM-dd");
          const value = Number(tx.price_sold) || 0;
          if (dk >= weeks.currentStart && dk <= weeks.currentEnd) {
            real.set(unitId, (real.get(unitId) || 0) + value);
          } else if (dk >= weeks.prevStart && dk <= weeks.prevEnd) {
            base.set(unitId, (base.get(unitId) || 0) + value);
          }
        }

        const result: WeeklyUnitGoalRow[] = units.map((u: { id: string; name: string }) => {
          const b = base.get(u.id) || 0;
          const growthPct = growthByUnit.get(u.id) || 0;
          const meta = weeklyMeta(b, growthPct);
          const realizado = real.get(u.id) || 0;
          return {
            unitId: u.id,
            unitName: u.name,
            base: b,
            growthPct,
            meta,
            realizado,
            pct: meta > 0 ? realizado / meta : 0,
          };
        });
        result.sort((a, b) => b.realizado - a.realizado);

        const tBase = result.reduce((s, r) => s + r.base, 0);
        const tMeta = result.reduce((s, r) => s + r.meta, 0);
        const tReal = result.reduce((s, r) => s + r.realizado, 0);
        setRows(result);
        setTotal({ base: tBase, meta: tMeta, realizado: tReal, pct: tMeta > 0 ? tReal / tMeta : 0 });
      } catch (err) {
        console.error("Erro ao carregar meta semanal por unidade:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, token]);

  return { loading, rows, total, weekLabel: ranges, refetch };
}
