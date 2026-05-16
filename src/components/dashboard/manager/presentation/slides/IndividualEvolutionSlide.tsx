import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtPct } from "../slideHelpers";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function IndividualEvolutionSlide({ data }: { data: MonthlyPresentationData }) {
  const rows = (data.individual_evolution ?? []).slice(0, 9);
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-16">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-3">Evolução individual</p>
        <h2 className="text-6xl font-bold mb-6">Quem cresceu, quem caiu</h2>
        <div className="rounded-3xl border border-border bg-card/60 overflow-hidden flex-1">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-8 py-4 border-b border-border bg-muted/30 text-xl font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Barbeiro</div>
            <div className="text-right">Faturamento</div>
            <div className="text-right">Mês ant.</div>
            <div className="text-right">Clientes</div>
            <div className="text-right">Δ%</div>
          </div>
          {rows.map((r) => {
            const delta = r.delta_pct;
            const Icon = delta == null ? Minus : delta >= 0 ? TrendingUp : TrendingDown;
            const color = delta == null ? "text-muted-foreground" : delta >= 0 ? "text-success" : "text-destructive";
            return (
              <div key={r.barber_id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-8 py-4 items-center text-2xl border-b border-border/30 last:border-0">
                <div className="font-semibold truncate">{r.name}</div>
                <div className="text-right font-bold text-primary">{fmtBRL(r.revenue_curr)}</div>
                <div className="text-right text-muted-foreground">{fmtBRL(r.revenue_prev)}</div>
                <div className="text-right">{r.clients_curr} <span className="text-muted-foreground text-lg">/ {r.clients_prev}</span></div>
                <div className={`flex items-center justify-end gap-2 font-bold ${color}`}>
                  <Icon className="w-7 h-7" />{fmtPct(delta)}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="px-8 py-12 text-center text-3xl text-muted-foreground">Sem dados no período.</div>}
        </div>
      </div>
    </ScaledSlide>
  );
}
