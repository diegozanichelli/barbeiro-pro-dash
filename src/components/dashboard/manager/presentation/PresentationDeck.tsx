import { useCallback, useEffect, useState } from "react";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { usePresentationOverrides, SlideOverridesMap } from "@/hooks/usePresentationOverrides";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, Grid3x3 } from "lucide-react";
import CoverSlide from "./slides/CoverSlide";
import KpiSlide from "./slides/KpiSlide";
import MonthComparisonSlide from "./slides/MonthComparisonSlide";
import GoalsSlide from "./slides/GoalsSlide";
import PreviousMonthGoalsSlide from "./slides/PreviousMonthGoalsSlide";
import RankingSlide from "./slides/RankingSlide";
import IndividualEvolutionSlide from "./slides/IndividualEvolutionSlide";
import UnitsSlide from "./slides/UnitsSlide";
import WeekdayHeatmapSlide from "./slides/WeekdayHeatmapSlide";
import UnitWeekdayHeatmapSlide from "./slides/UnitWeekdayHeatmapSlide";
import TopServicesProductsSlide from "./slides/TopServicesProductsSlide";
import ExtrasPenetrationSlide from "./slides/ExtrasPenetrationSlide";
import ProductSellersSlide from "./slides/ProductSellersSlide";
import ExtrasSellersSlide from "./slides/ExtrasSellersSlide";
import ReceptionSalesSlide from "./slides/ReceptionSalesSlide";
import NewClientsSlide from "./slides/NewClientsSlide";
import ClientsNewVsReturningSlide from "./slides/ClientsNewVsReturningSlide";
import VisitFrequencySlide from "./slides/VisitFrequencySlide";
import ConversionSlide from "./slides/ConversionSlide";
import SubscriptionHealthSlide from "./slides/SubscriptionHealthSlide";
import TopSubscriptionSellersSlide from "./slides/TopSubscriptionSellersSlide";
import TicketByUnitSlide from "./slides/TicketByUnitSlide";
import RevenueMixSlide from "./slides/RevenueMixSlide";
import TopSellersSlide from "./slides/TopSellersSlide";
import BestDaySlide from "./slides/BestDaySlide";
import RecordsSlide from "./slides/RecordsSlide";
import AlertsSlide from "./slides/AlertsSlide";
import NextStepsSlide from "./slides/NextStepsSlide";
import ClosingSlide from "./slides/ClosingSlide";

interface Props {
  data: MonthlyPresentationData;
  orgId: string;
  unitKey: string;
  onExit: () => void;
}

interface BuildOpts {
  overrides?: SlideOverridesMap;
  editable?: boolean;
  saveOverride?: (slideKey: string, payload: Record<string, unknown>) => Promise<void>;
  resetOverride?: (slideKey: string) => Promise<void>;
  editableNotes?: boolean;
}

export function buildSlides(
  data: MonthlyPresentationData,
  orgId: string,
  unitKey: string,
  editableNotesOrOpts: boolean | BuildOpts = false
) {
  const opts: BuildOpts =
    typeof editableNotesOrOpts === "boolean"
      ? { editableNotes: editableNotesOrOpts }
      : editableNotesOrOpts;
  const overrides = opts.overrides ?? {};
  const editable = opts.editable ?? false;
  const saveOverride = opts.saveOverride;
  const resetOverride = opts.resetOverride;

  return [
    {
      key: "cover", title: "Capa",
      el: (
        <CoverSlide
          data={data}
          override={overrides["cover"]}
          editable={editable}
          onSave={saveOverride ? (p) => saveOverride("cover", p as Record<string, unknown>) : undefined}
          onReset={resetOverride ? () => resetOverride("cover") : undefined}
        />
      ),
    },
    { key: "kpis", title: "Resumo executivo", el: <KpiSlide data={data} /> },
    { key: "month-comparison", title: "Mês vs Mês anterior", el: <MonthComparisonSlide data={data} /> },
    { key: "goals", title: "Metas batidas", el: <GoalsSlide data={data} /> },
    { key: "prev-goals", title: "Bateu vs não bateu (mês anterior)", el: <PreviousMonthGoalsSlide data={data} /> },
    { key: "ranking", title: "Top 10 barbeiros", el: <RankingSlide data={data} /> },
    { key: "evolution", title: "Evolução individual", el: <IndividualEvolutionSlide data={data} /> },
    { key: "units", title: "Por unidade", el: <UnitsSlide data={data} /> },
    { key: "weekday", title: "Heatmap dia da semana", el: <WeekdayHeatmapSlide data={data} /> },
    { key: "unit-weekday", title: "Heatmap por unidade", el: <UnitWeekdayHeatmapSlide data={data} /> },
    { key: "ticket", title: "Ticket médio por unidade", el: <TicketByUnitSlide data={data} /> },
    { key: "mix", title: "Mix de receita", el: <RevenueMixSlide data={data} /> },
    { key: "top-services-products", title: "Top serviços & produtos", el: <TopServicesProductsSlide data={data} /> },
    { key: "extras-penetration", title: "Penetração de extras", el: <ExtrasPenetrationSlide data={data} /> },
    { key: "top-sellers", title: "Top vendedores (extras / produtos)", el: <TopSellersSlide data={data} /> },
    { key: "product-sellers", title: "Ranking de venda de produtos", el: <ProductSellersSlide data={data} /> },
    { key: "reception", title: "Recepção vendedora", el: <ReceptionSalesSlide data={data} /> },
    { key: "new-clients", title: "Clientes novos", el: <NewClientsSlide data={data} /> },
    { key: "new-vs-returning", title: "Novos vs Recorrentes", el: <ClientsNewVsReturningSlide data={data} /> },
    { key: "frequency", title: "Frequência do mês", el: <VisitFrequencySlide data={data} /> },
    { key: "conversion", title: "Conversão de novos em assinantes", el: <ConversionSlide data={data} /> },
    { key: "sub-health", title: "Saúde de assinaturas", el: <SubscriptionHealthSlide data={data} /> },
    { key: "top-sub-sellers", title: "Top vendedores de assinatura", el: <TopSubscriptionSellersSlide data={data} /> },
    { key: "best-day", title: "Dia mais forte", el: <BestDaySlide data={data} /> },
    { key: "records", title: "Recordes do mês", el: <RecordsSlide data={data} /> },
    { key: "alerts", title: "Alertas", el: <AlertsSlide data={data} /> },
    { key: "next-steps", title: "Próximos passos", el: <NextStepsSlide data={data} orgId={orgId} unitKey={unitKey} editable={opts.editableNotes ?? false} /> },
    {
      key: "closing", title: "Encerramento",
      el: (
        <ClosingSlide
          data={data}
          override={overrides["closing"]}
          editable={editable}
          onSave={saveOverride ? (p) => saveOverride("closing", p as Record<string, unknown>) : undefined}
          onReset={resetOverride ? () => resetOverride("closing") : undefined}
        />
      ),
    },
  ];
}

export default function PresentationDeck({ data, orgId, unitKey, onExit }: Props) {
  const { overrides, saveOverride, resetOverride } = usePresentationOverrides(
    orgId || null, data.month, data.year, unitKey
  );
  const slides = buildSlides(data, orgId, unitKey, {
    overrides,
    editable: true,
    saveOverride,
    resetOverride,
    editableNotes: true,
  });

  const [idx, setIdx] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  const go = useCallback((delta: number) => {
    setIdx((i) => Math.max(0, Math.min(slides.length - 1, i + delta)));
  }, [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") setIdx(0);
      else if (e.key === "End") setIdx(slides.length - 1);
      else if (e.key === "Escape") {
        if (showGrid) setShowGrid(false);
        else onExit();
      }
      else if (e.key.toLowerCase() === "g") setShowGrid((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, slides.length, onExit, showGrid]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      setCursorVisible(true);
      clearTimeout(t);
      t = setTimeout(() => setCursorVisible(false), 3000);
    };
    reset();
    window.addEventListener("mousemove", reset);
    return () => {
      window.removeEventListener("mousemove", reset);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => { /* ignore */ });
    }
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* ignore */ });
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] bg-background flex items-center justify-center overflow-hidden"
      style={{ cursor: cursorVisible ? "default" : "none" }}
    >
      <div key={slides[idx].key} className="absolute inset-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {slides[idx].el}
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 transition-opacity" style={{ opacity: cursorVisible ? 1 : 0 }}>
        <Button variant="secondary" size="sm" onClick={() => setShowGrid(true)} title="Grade (G)">
          <Grid3x3 className="w-4 h-4 mr-2" /> Grade
        </Button>
        <Button variant="destructive" size="sm" onClick={onExit} title="Sair (Esc)">
          <X className="w-4 h-4 mr-2" /> Sair
        </Button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="h-1 bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${((idx + 1) / slides.length) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between px-6 py-3 transition-opacity" style={{ opacity: cursorVisible ? 1 : 0 }}>
          <Button variant="ghost" size="sm" onClick={() => go(-1)} disabled={idx === 0}>
            <ChevronLeft className="w-5 h-5 mr-1" /> Anterior
          </Button>
          <span className="text-sm font-mono text-muted-foreground">
            {idx + 1} / {slides.length} — {slides[idx].title}
          </span>
          <Button variant="ghost" size="sm" onClick={() => go(1)} disabled={idx === slides.length - 1}>
            Próximo <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </div>

      {showGrid && (
        <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur overflow-auto p-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold">Selecione um slide</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowGrid(false)}><X className="w-5 h-5" /></Button>
          </div>
          <div className="grid grid-cols-3 lg:grid-cols-4 gap-4">
            {slides.map((s, i) => (
              <button
                key={s.key}
                onClick={() => { setIdx(i); setShowGrid(false); }}
                className={`text-left rounded-xl border-2 overflow-hidden transition-all hover:scale-[1.02] ${i === idx ? "border-primary" : "border-border"}`}
              >
                <div className="aspect-video bg-card relative overflow-hidden">
                  <div className="absolute inset-0 scale-[0.18] origin-top-left" style={{ width: "555%", height: "555%" }}>
                    {s.el}
                  </div>
                </div>
                <div className="p-3 bg-card border-t border-border">
                  <p className="text-xs font-mono text-muted-foreground">#{i + 1}</p>
                  <p className="text-sm font-semibold truncate">{s.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
