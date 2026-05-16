import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Play, Presentation, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useMonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { getManausDate } from "@/lib/dateUtils";
import { monthNamesPt } from "./slideHelpers";
import PresentationDeck from "./PresentationDeck";
import CoverSlide from "./slides/CoverSlide";
import KpiSlide from "./slides/KpiSlide";
import GoalsSlide from "./slides/GoalsSlide";
import RankingSlide from "./slides/RankingSlide";
import UnitsSlide from "./slides/UnitsSlide";
import NewClientsSlide from "./slides/NewClientsSlide";
import ConversionSlide from "./slides/ConversionSlide";
import SubscriptionHealthSlide from "./slides/SubscriptionHealthSlide";
import TicketByUnitSlide from "./slides/TicketByUnitSlide";
import RevenueMixSlide from "./slides/RevenueMixSlide";
import TopSellersSlide from "./slides/TopSellersSlide";
import BestDaySlide from "./slides/BestDaySlide";
import AlertsSlide from "./slides/AlertsSlide";
import NextStepsSlide from "./slides/NextStepsSlide";
import ClosingSlide from "./slides/ClosingSlide";

interface Unit { id: string; name: string; }

export default function MonthlyPresentation() {
  const { organizationId } = useOrganization();
  const today = getManausDate();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [unitId, setUnitId] = useState<string>("all");
  const [units, setUnits] = useState<Unit[]>([]);
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("units").select("id, name").eq("status", "active").order("name");
      if (data) setUnits(data);
    })();
  }, []);

  const { data, loading, error } = useMonthlyPresentationData(month, year, unitId === "all" ? null : unitId);

  const yearOptions = useMemo(() => {
    const ys: number[] = [];
    for (let y = today.getFullYear(); y >= today.getFullYear() - 3; y--) ys.push(y);
    return ys;
  }, [today]);

  const previewSlides = useMemo(() => {
    if (!data) return [];
    return [
      { key: "cover", title: "Capa", el: <CoverSlide data={data} /> },
      { key: "kpis", title: "Resumo executivo", el: <KpiSlide data={data} /> },
      { key: "goals", title: "Metas batidas", el: <GoalsSlide data={data} /> },
      { key: "ranking", title: "Top 10 barbeiros", el: <RankingSlide data={data} /> },
      { key: "units", title: "Por unidade", el: <UnitsSlide data={data} /> },
      { key: "new-clients", title: "Clientes novos", el: <NewClientsSlide data={data} /> },
      { key: "conversion", title: "Conversão", el: <ConversionSlide data={data} /> },
      { key: "sub-health", title: "Saúde de assinaturas", el: <SubscriptionHealthSlide data={data} /> },
      { key: "ticket", title: "Ticket médio por unidade", el: <TicketByUnitSlide data={data} /> },
      { key: "mix", title: "Mix de receita", el: <RevenueMixSlide data={data} /> },
      { key: "top-sellers", title: "Top vendedores", el: <TopSellersSlide data={data} /> },
      { key: "best-day", title: "Dia mais forte", el: <BestDaySlide data={data} /> },
      { key: "alerts", title: "Alertas", el: <AlertsSlide data={data} /> },
      { key: "next-steps", title: "Próximos passos (editável)", el: <NextStepsSlide data={data} orgId={organizationId ?? ""} unitKey={unitId} editable /> },
      { key: "closing", title: "Encerramento", el: <ClosingSlide data={data} /> },
    ];
  }, [data, organizationId, unitId]);

  if (presenting && data) {
    return (
      <PresentationDeck
        data={data}
        orgId={organizationId ?? ""}
        unitKey={unitId}
        onExit={() => setPresenting(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Presentation className="w-8 h-8 text-primary" />
          Apresentação Mensal
        </h2>
        <p className="text-muted-foreground">
          Deck pronto para projetar nas reuniões de alta performance do time. Escolha o mês, abra em tela cheia e navegue com as setas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configurar reunião</CardTitle>
          <CardDescription>Selecione o período e (opcionalmente) uma unidade específica.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Mês</Label>
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
            <div className="flex items-end">
              <Button
                size="lg"
                className="w-full text-lg font-semibold"
                disabled={loading || !data || !!error}
                onClick={() => setPresenting(true)}
              >
                <Play className="w-5 h-5 mr-2" />
                Iniciar Apresentação
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Atalhos: <kbd className="px-1.5 py-0.5 rounded bg-muted">←</kbd> <kbd className="px-1.5 py-0.5 rounded bg-muted">→</kbd> navegar •{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-muted">G</kbd> grade • <kbd className="px-1.5 py-0.5 rounded bg-muted">Esc</kbd> sair
          </p>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 mr-2 animate-spin" /> Carregando dados do mês…
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
                    <div className="pointer-events-none">{s.el}</div>
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
