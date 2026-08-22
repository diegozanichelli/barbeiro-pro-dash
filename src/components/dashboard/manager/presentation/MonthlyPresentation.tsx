import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Play, Presentation, Loader2, CalendarIcon, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useMonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { usePresentationOverrides } from "@/hooks/usePresentationOverrides";
import { useOrganizationHolidays } from "@/hooks/useOrganizationHolidays";
import { getManausDate } from "@/lib/dateUtils";
import {
  monthNamesPt, PeriodMode, resolvePeriod, computeCompareRange,
  countWorkingDays, toISODate, formatPeriodLabel, formatPeriodShort, isFullMonth, lastDayOfMonth, parseISODate,
} from "./slideHelpers";
import PresentationDeck, { buildSlides } from "./PresentationDeck";

interface Unit { id: string; name: string; }

export default function MonthlyPresentation() {
  const { organizationId } = useOrganization();
  const today = getManausDate();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [unitId, setUnitId] = useState<string>("all");
  const [units, setUnits] = useState<Unit[]>([]);
  const [presenting, setPresenting] = useState(false);
  const [mode, setMode] = useState<PeriodMode>("full_month");
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("units").select("id, name").eq("status", "active").order("name");
      if (data) setUnits(data);
    })();
  }, []);

  const { holidayDates } = useOrganizationHolidays({ organizationId, month, year });

  // Resolve período
  const { periodStart, periodEnd, targetRatio, fullMonthDays, periodWorkingDays } = useMemo(() => {
    const { start, end } = resolvePeriod(
      mode, month, year,
      mode === "custom" && customStart && customEnd ? { start: customStart, end: customEnd } : null,
      today,
    );
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month - 1, lastDayOfMonth(year, month));
    const fullMonth = countWorkingDays(monthStart, monthEnd, holidayDates);
    const periodWd = countWorkingDays(start, end, holidayDates);
    const ratio = fullMonth > 0 ? periodWd / fullMonth : 1;
    return {
      periodStart: toISODate(start),
      periodEnd: toISODate(end),
      targetRatio: isFullMonth(start, end) ? 1 : ratio,
      fullMonthDays: fullMonth,
      periodWorkingDays: periodWd,
    };
  }, [mode, month, year, customStart, customEnd, holidayDates, today]);

  const { compareStart, compareEnd } = useMemo(() => {
    const s = parseISODate(periodStart);
    const e = parseISODate(periodEnd);
    const { compareStart, compareEnd } = computeCompareRange(s, e);
    return { compareStart: toISODate(compareStart), compareEnd: toISODate(compareEnd) };
  }, [periodStart, periodEnd]);

  const customReady = mode !== "custom" || (customStart && customEnd && customStart <= customEnd);

  const { data, loading, error } = useMonthlyPresentationData({
    periodStart, periodEnd, compareStart, compareEnd,
    targetRatio, unitId: unitId === "all" ? null : unitId,
  });

  const yearOptions = useMemo(() => {
    const ys: number[] = [];
    for (let y = today.getFullYear(); y >= today.getFullYear() - 3; y--) ys.push(y);
    return ys;
  }, [today]);

  const { overrides, saveOverride, resetOverride } = usePresentationOverrides(
    organizationId ?? null, month, year, `${unitId}__${periodStart}__${periodEnd}`
  );

  const previewSlides = useMemo(() => {
    if (!data) return [];
    return buildSlides(data, organizationId ?? "", unitId, {
      overrides,
      editable: true,
      saveOverride,
      resetOverride,
      editableNotes: true,
    });
  }, [data, organizationId, unitId, overrides, saveOverride, resetOverride]);

  const periodLabel = useMemo(() => {
    return formatPeriodLabel(parseISODate(periodStart), parseISODate(periodEnd));
  }, [periodStart, periodEnd]);

  const compareLabel = useMemo(() => {
    return formatPeriodShort(parseISODate(compareStart), parseISODate(compareEnd));
  }, [compareStart, compareEnd]);

  if (presenting && data) {
    return (
      <PresentationDeck
        data={data}
        orgId={organizationId ?? ""}
        unitKey={`${unitId}__${periodStart}__${periodEnd}`}
        onExit={() => setPresenting(false)}
      />
    );
  }

  const ratioPct = Math.round(targetRatio * 100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Presentation className="w-8 h-8 text-primary" />
          Apresentação
        </h2>
        <p className="text-muted-foreground">
          Reuniões mensais, quinzenais, semanais ou de qualquer período. As metas são aplicadas proporcionalmente aos dias úteis do recorte.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configurar reunião</CardTitle>
          <CardDescription>Escolha o tipo de reunião, o período e (opcionalmente) uma unidade específica.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Tipo de reunião */}
          <div>
            <Label className="mb-2 block">Tipo de reunião</Label>
            <Tabs value={mode} onValueChange={(v) => setMode(v as PeriodMode)}>
              <TabsList className="grid grid-cols-2 md:grid-cols-5 gap-1 h-auto">
                <TabsTrigger value="full_month">Mês fechado</TabsTrigger>
                <TabsTrigger value="mtd">Mês até hoje</TabsTrigger>
                <TabsTrigger value="first_half">1ª Quinzena</TabsTrigger>
                <TabsTrigger value="second_half">2ª Quinzena</TabsTrigger>
                <TabsTrigger value="custom">Personalizado</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Mês/Ano/Unidade ou range personalizado */}
          {mode !== "custom" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Mês de referência</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNamesPt.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as unidades</SelectItem>
                    {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Data inicial</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left", !customStart && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStart ? customStart.toLocaleDateString("pt-BR") : "Escolher data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customStart} onSelect={setCustomStart} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Data final</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left", !customEnd && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEnd ? customEnd.toLocaleDateString("pt-BR") : "Escolher data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as unidades</SelectItem>
                    {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Resumo do período */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p><strong>Período da apresentação:</strong> {periodLabel}</p>
              <p className="text-muted-foreground">
                {periodWorkingDays} {periodWorkingDays === 1 ? "dia útil" : "dias úteis"} • Meta proporcional aplicada:{" "}
                <strong className="text-primary">{ratioPct}% da meta mensal</strong>
                {ratioPct === 100 ? " (mês cheio)" : ""}
              </p>
              <p className="text-muted-foreground">
                Comparativo: período anterior equivalente <strong>{compareLabel}</strong>
              </p>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full text-lg font-semibold"
            disabled={loading || !data || !!error || !customReady}
            onClick={() => setPresenting(true)}
          >
            <Play className="w-5 h-5 mr-2" />
            Iniciar Apresentação
          </Button>

          <p className="text-xs text-muted-foreground">
            Atalhos: <kbd className="px-1.5 py-0.5 rounded bg-muted">←</kbd> <kbd className="px-1.5 py-0.5 rounded bg-muted">→</kbd> navegar •{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-muted">G</kbd> grade • <kbd className="px-1.5 py-0.5 rounded bg-muted">Esc</kbd> sair
          </p>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 mr-2 animate-spin" /> Carregando dados do período…
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-6 text-destructive">Erro ao carregar dados: {error}</CardContent>
        </Card>
      )}

      {!loading && data && (
        <Card>
          <CardHeader>
            <CardTitle>Pré-visualização dos slides</CardTitle>
            <CardDescription>{previewSlides.length} slides serão apresentados.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {previewSlides.map((s, i) => (
                <div key={s.key} className="rounded-xl border border-border overflow-hidden bg-card hover:border-primary transition-colors">
                  <div className="aspect-video bg-background relative overflow-hidden">
                    <div className="[&_*]:pointer-events-none [&_button]:pointer-events-auto">{s.el}</div>
                  </div>
                  <div className="p-3 border-t border-border">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Slide {i + 1}</p>
                    <p className="text-sm font-semibold truncate">{s.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
