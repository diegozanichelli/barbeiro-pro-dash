import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { monthNamesPt } from "../slideHelpers";
import { CheckCircle2, XCircle } from "lucide-react";

export default function PreviousMonthGoalsSlide({ data }: { data: MonthlyPresentationData }) {
  const hit = data.previous_month_goals?.hit ?? [];
  const missed = data.previous_month_goals?.missed ?? [];
  const prevMonth = data.month === 1 ? 12 : data.month - 1;

  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-20">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Accountability</p>
        <h2 className="text-7xl font-bold mb-3">Metas de {monthNamesPt[prevMonth - 1]}</h2>
        <p className="text-2xl text-muted-foreground mb-10">Quem bateu e quem não bateu — o ponto de partida deste mês.</p>
        <div className="grid grid-cols-2 gap-8 flex-1">
          <div className="rounded-3xl border-2 border-success/60 bg-success/5 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle2 className="w-12 h-12 text-success" />
              <h3 className="text-4xl font-bold text-success">Bateram meta ({hit.length})</h3>
            </div>
            <div className="space-y-3 overflow-hidden">
              {hit.slice(0, 12).map((b, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-background/40 border border-border/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-2xl font-semibold truncate">{b.barber}</p>
                    <p className="text-base text-muted-foreground">{b.unit ?? "—"}</p>
                  </div>
                  <p className="text-2xl font-bold text-success">{b.pct.toFixed(0)}%</p>
                </div>
              ))}
              {hit.length === 0 && <p className="text-2xl text-muted-foreground text-center py-8">Ninguém bateu a meta.</p>}
            </div>
          </div>
          <div className="rounded-3xl border-2 border-destructive/60 bg-destructive/5 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <XCircle className="w-12 h-12 text-destructive" />
              <h3 className="text-4xl font-bold text-destructive">Não bateram ({missed.length})</h3>
            </div>
            <div className="space-y-3 overflow-hidden">
              {missed.slice(0, 12).map((b, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-background/40 border border-border/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-2xl font-semibold truncate">{b.barber}</p>
                    <p className="text-base text-muted-foreground">{b.unit ?? "—"}</p>
                  </div>
                  <p className="text-2xl font-bold text-destructive">{b.pct.toFixed(0)}%</p>
                </div>
              ))}
              {missed.length === 0 && <p className="text-2xl text-muted-foreground text-center py-8">Todos bateram. 🎉</p>}
            </div>
          </div>
        </div>
      </div>
    </ScaledSlide>
  );
}
