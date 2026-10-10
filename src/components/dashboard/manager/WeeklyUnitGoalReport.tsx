import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/useOrganization";
import { useWeeklyUnitGoals } from "@/hooks/useWeeklyUnitGoals";
import { brl } from "@/lib/currency";
import { Target, Loader2, Building2, Check } from "lucide-react";
import { toast } from "sonner";

const fmtDM = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}` : iso;
};

export default function WeeklyUnitGoalReport() {
  const { organizationId } = useOrganization();
  const { loading, rows, total, weekLabel, refetch } = useWeeklyUnitGoals(organizationId);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const saveGrowth = async (unitId: string) => {
    if (!organizationId) return;
    const raw = draft[unitId];
    const value = Number((raw ?? "").replace(",", "."));
    if (raw === undefined || Number.isNaN(value)) {
      toast.error("Informe um percentual válido.");
      return;
    }
    setSaving(unitId);
    try {
      const { error } = await supabase
        .from("unit_weekly_growth")
        .upsert(
          { organization_id: organizationId, unit_id: unitId, growth_pct: value, updated_at: new Date().toISOString() },
          { onConflict: "organization_id,unit_id" },
        );
      if (error) throw error;
      toast.success("Crescimento atualizado.");
      setDraft((d) => {
        const next = { ...d };
        delete next[unitId];
        return next;
      });
      refetch();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar o crescimento.");
    } finally {
      setSaving(null);
    }
  };

  const pctBadge = (pct: number) => {
    const p = Math.round(pct * 100);
    const color =
      p >= 100 ? "text-emerald-600 dark:text-emerald-400" : p >= 70 ? "text-amber-600 dark:text-amber-400" : "text-destructive";
    return <span className={`font-bold ${color}`}>{p}%</span>;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center">
              <Target className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Meta Semanal por Unidade</CardTitle>
              <CardDescription>
                Base = faturamento da semana anterior ({fmtDM(weekLabel.prevStart)}–{fmtDM(weekLabel.prevEnd)}).
                Meta = Base × (1 + crescimento). Realizado = semana corrente ({fmtDM(weekLabel.currentStart)}–
                {fmtDM(weekLabel.currentEnd)}). Inclui assinaturas (balcão + renovações + online) + serviços + produtos.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Building2 className="w-10 h-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Nenhuma unidade ativa.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Base (sem. ant.)</TableHead>
                    <TableHead className="text-center">Crescimento %</TableHead>
                    <TableHead className="text-right">Meta</TableHead>
                    <TableHead className="text-right">Realizado</TableHead>
                    <TableHead className="text-center">Progresso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const editing = draft[r.unitId] !== undefined;
                    return (
                      <TableRow key={r.unitId}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            {r.unitName}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{brl(r.base)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              className="h-8 w-20 text-right"
                              value={editing ? draft[r.unitId] : String(r.growthPct)}
                              onChange={(e) => setDraft((d) => ({ ...d, [r.unitId]: e.target.value }))}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                            {editing && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                disabled={saving === r.unitId}
                                onClick={() => saveGrowth(r.unitId)}
                                aria-label="Salvar crescimento"
                              >
                                {saving === r.unitId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{brl(r.meta)}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(r.realizado)}</TableCell>
                        <TableCell className="text-center">{pctBadge(r.pct)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Rede (total) */}
                  <TableRow className="border-t-2 border-border bg-muted/30">
                    <TableCell className="font-bold">Rede</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{brl(total.base)}</TableCell>
                    <TableCell className="text-center text-muted-foreground">—</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{brl(total.meta)}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{brl(total.realizado)}</TableCell>
                    <TableCell className="text-center">{pctBadge(total.pct)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
