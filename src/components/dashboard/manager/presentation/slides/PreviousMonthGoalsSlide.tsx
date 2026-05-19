import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { formatPeriodShort } from "../slideHelpers";
import { CheckCircle2, XCircle } from "lucide-react";

export default function PreviousMonthGoalsSlide({ data }: { data: MonthlyPresentationData }) {
  const hit = data.previous_month_goals?.hit ?? [];
  const missed = data.previous_month_goals?.missed ?? [];
  const prevLabel = data.compare_start && data.compare_end
    ? formatPeriodShort(new Date(data.compare_start), new Date(data.compare_end))
    : "Período anterior";

  const renderCol = (
    items: typeof hit,
    tone: "success" | "destructive",
    Icon: typeof CheckCircle2,
    label: string,
  ) => {
    const max = 18;
    const visible = items.slice(0, max);
    const twoCol = visible.length > 7;
    const colorBorder = tone === "success" ? "border-success/60 bg-success/5" : "border-destructive/60 bg-destructive/5";
    const colorText = tone === "success" ? "text-success" : "text-destructive";
    return (
      <div className={`rounded-3xl border-2 ${colorBorder} p-6 flex flex-col min-h-0 overflow-hidden`}>
        <div className="flex items-center gap-3 mb-4">
          <Icon className={`w-10 h-10 ${colorText}`} />
          <h3 className={`text-3xl font-bold ${colorText}`}>{label} ({items.length})</h3>
        </div>
        <div className={`grid ${twoCol ? "grid-cols-2" : "grid-cols-1"} gap-x-3 gap-y-2 flex-1 min-h-0 overflow-hidden content-start`}>
          {visible.map((b, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-background/40 border border-border/40">
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold truncate">{b.barber}</p>
                <p className="text-xs text-muted-foreground truncate">{b.unit ?? "—"}</p>
              </div>
              <p className={`text-lg font-bold ${colorText} ml-2`}>{b.pct.toFixed(0)}%</p>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-2xl text-muted-foreground text-center py-8 col-span-full">
              {tone === "success" ? "Ninguém bateu a meta." : "Todos bateram. 🎉"}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-24 py-16">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-3">Accountability</p>
        <h2 className="text-6xl font-bold mb-2">Metas — {prevLabel}</h2>
        <p className="text-xl text-muted-foreground mb-6">Quem bateu e quem não bateu — o ponto de partida deste período.</p>
        <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
          {renderCol(hit, "success", CheckCircle2, "Bateram meta")}
          {renderCol(missed, "destructive", XCircle, "Não bateram")}
        </div>
      </div>
    </ScaledSlide>
  );
}
