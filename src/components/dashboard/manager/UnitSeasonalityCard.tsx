import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TrendingUp, Save, RotateCcw } from "lucide-react";
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
  manual: "Manual (definido pelo gestor)",
};

interface UnitRow {
  id: string;
  name: string;
}

export default function UnitSeasonalityCard() {
  const { organizationId } = useOrganization();
  const { rows, upsert, saveManualWeights } = useUnitSeasonalityConfig(organizationId);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [previews, setPreviews] = useState<Record<string, UnitWeeklyWeights>>({});
  const [manualDrafts, setManualDrafts] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
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

  const configOf = (unitId: string) => rows.find((r) => r.unit_id === unitId);
  const sourceOf = (unitId: string): SeasonalitySource => configOf(unitId)?.source ?? "linear";

  const getDraft = (unitId: string): string[] => {
    if (manualDrafts[unitId]) return manualDrafts[unitId];
    const cfg = configOf(unitId);
    const base =
      cfg?.manual_weights && cfg.manual_weights.length === 5
        ? cfg.manual_weights.map((n) => (Number(n) * 100).toFixed(0))
        : (previews[unitId]?.weights ?? [0.2, 0.2, 0.2, 0.2, 0.2]).map((n) =>
            (n * 100).toFixed(0)
          );
    return base;
  };

  const updateDraft = (unitId: string, idx: number, value: string) => {
    const current = [...getDraft(unitId)];
    current[idx] = value.replace(/[^\d.]/g, "");
    setManualDrafts((d) => ({ ...d, [unitId]: current }));
  };

  const draftSum = (unitId: string) =>
    getDraft(unitId).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);

  const handleChange = async (unitId: string, value: SeasonalitySource) => {
    try {
      if (value === "manual") {
        const cfg = configOf(unitId);
        const seed =
          cfg?.manual_weights && cfg.manual_weights.length === 5
            ? cfg.manual_weights
            : previews[unitId]?.weights ?? [0.2, 0.2, 0.2, 0.2, 0.2];
        await saveManualWeights(unitId, seed);
      } else {
        await upsert(unitId, value);
      }
      const fresh = await fetchUnitWeeklyWeights(unitId, month, year);
      setPreviews((p) => ({ ...p, [unitId]: fresh }));
      setManualDrafts((d) => {
        const n = { ...d };
        delete n[unitId];
        return n;
      });
      toast.success("Sazonalidade atualizada");
    } catch (e) {
      toast.error("Erro ao salvar sazonalidade");
    }
  };

  const handleSaveManual = async (unitId: string) => {
    const draft = getDraft(unitId).map((v) => parseFloat(v) || 0);
    const sum = draft.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      toast.error("A soma dos pesos precisa ser maior que zero");
      return;
    }
    setSaving((s) => ({ ...s, [unitId]: true }));
    try {
      // Normaliza para somar 1
      const normalized = draft.map((v) => v / sum);
      await saveManualWeights(unitId, normalized);
      const fresh = await fetchUnitWeeklyWeights(unitId, month, year);
      setPreviews((p) => ({ ...p, [unitId]: fresh }));
      setManualDrafts((d) => {
        const n = { ...d };
        delete n[unitId];
        return n;
      });
      toast.success("Pesos manuais salvos e normalizados para 100%");
    } catch {
      toast.error("Erro ao salvar pesos manuais");
    } finally {
      setSaving((s) => ({ ...s, [unitId]: false }));
    }
  };

  const handleResetDraft = (unitId: string) => {
    setManualDrafts((d) => {
      const n = { ...d };
      delete n[unitId];
      return n;
    });
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
          Escolha uma fonte histórica ou defina os pesos manualmente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {units.map((u) => {
          const preview = previews[u.id];
          const source = sourceOf(u.id);
          const isManual = source === "manual";
          const draft = getDraft(u.id);
          const sum = draftSum(u.id);
          return (
            <div key={u.id} className="flex flex-col gap-3 p-3 rounded-md border border-border">
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
                  value={source}
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

              {isManual ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-2">
                    {draft.map((val, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground uppercase text-center">
                          Sem {i + 1}
                        </Label>
                        <Input
                          inputMode="decimal"
                          value={val}
                          onChange={(e) => updateDraft(u.id, i, e.target.value)}
                          className="text-center h-9"
                          aria-label={`Peso semana ${i + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Soma atual: <span className="font-mono">{sum.toFixed(1)}</span> (será
                      normalizada para 100% ao salvar)
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetDraft(u.id)}
                        disabled={!manualDrafts[u.id]}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reverter
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveManual(u.id)}
                        disabled={saving[u.id] || sum <= 0}
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saving[u.id] ? "Salvando..." : "Salvar pesos"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                preview && (
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
                )
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
