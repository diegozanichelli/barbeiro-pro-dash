import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import {
  SeasonalitySource,
  fetchUnitWeeklyWeights,
  useUnitSeasonalityConfig,
  UnitWeeklyWeights,
} from "@/hooks/useUnitSeasonality";
import { getCurrentMonthYear } from "@/lib/dateUtils";
import { toast } from "sonner";

const SOURCE_LABEL: Record<SeasonalitySource, string> = {
  linear: "Linear (sem sazonalidade)",
  previous_year: "Mesmo mês do ano anterior",
  trailing_3m: "Últimos 3 meses",
  combined: "Combinado (ano anterior + últimos 3 meses)",
};

interface UnitRow {
  id: string;
  name: string;
}

export default function UnitSeasonalityCard() {
  const { organizationId } = useOrganization();
  const { rows, upsert } = useUnitSeasonalityConfig(organizationId);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [previews, setPreviews] = useState<Record<string, UnitWeeklyWeights>>({});
  const { month, year } = useMemo(() => getCurrentMonthYear(), []);

  useEffect(() => {
    (async () => {
      if (!organizationId) return;
      const { data } = await supabase
        .from("units")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("name");
      setUnits((data as UnitRow[]) || []);
    })();
  }, [organizationId]);

  useEffect(() => {
    (async () => {
      const next: Record<string, UnitWeeklyWeights> = {};
      for (const u of units) {
        next[u.id] = await fetchUnitWeeklyWeights(u.id, month, year);
      }
      setPreviews(next);
    })();
  }, [units, rows, month, year]);

  const sourceOf = (unitId: string): SeasonalitySource =>
    rows.find((r) => r.unit_id === unitId)?.source ?? "linear";

  const handleChange = async (unitId: string, value: SeasonalitySource) => {
    try {
      await upsert(unitId, value);
      const fresh = await fetchUnitWeeklyWeights(unitId, month, year);
      setPreviews((p) => ({ ...p, [unitId]: fresh }));
      toast.success("Sazonalidade atualizada");
    } catch (e) {
      toast.error("Erro ao salvar sazonalidade");
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Sazonalidade semanal por unidade
        </CardTitle>
        <CardDescription>
          Define como o sistema distribui a meta mensal do barbeiro entre as 5 semanas do mês.
          Semanas historicamente mais fortes recebem mais peso na meta diária.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {units.map((u) => {
          const preview = previews[u.id];
          return (
            <div key={u.id} className="flex flex-col gap-2 p-3 rounded-md border border-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-semibold">{u.name}</p>
                  {preview && (
                    <p className="text-xs text-muted-foreground">
                      Fonte ativa: {SOURCE_LABEL[preview.source_used]}
                      {!preview.has_history && " · sem histórico suficiente, usando linear"}
                    </p>
                  )}
                </div>
                <Select
                  value={sourceOf(u.id)}
                  onValueChange={(v) => handleChange(u.id, v as SeasonalitySource)}
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SOURCE_LABEL) as SeasonalitySource[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {SOURCE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {preview && (
                <div className="grid grid-cols-5 gap-2">
                  {preview.weights.map((w, i) => (
                    <div
                      key={i}
                      className="text-center rounded-md bg-secondary/50 py-2 px-1"
                    >
                      <p className="text-[10px] text-muted-foreground uppercase">Sem {i + 1}</p>
                      <Badge variant="secondary" className="font-mono">
                        {(w * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
