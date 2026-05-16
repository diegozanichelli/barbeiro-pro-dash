import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { Trophy } from "lucide-react";

export default function GoalsSlide({ data }: { data: MonthlyPresentationData }) {
  const { hit_count, total_barbers, champions } = data.goals;
  const pct = total_barbers > 0 ? (hit_count / total_barbers) * 100 : 0;
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Metas batidas</p>
        <h2 className="text-7xl font-bold mb-12">Quem bateu a meta?</h2>
        <div className="grid grid-cols-[1fr_2fr] gap-16 items-start">
          <div className="rounded-3xl border border-border bg-card/60 p-12">
            <div className="flex items-baseline gap-4 mb-6">
              <span className="text-[10rem] leading-none font-bold text-primary">{hit_count}</span>
              <span className="text-5xl text-muted-foreground">/ {total_barbers}</span>
            </div>
            <p className="text-3xl text-muted-foreground mb-8">barbeiros bateram a meta</p>
            <div className="h-6 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-2xl text-muted-foreground mt-4">{pct.toFixed(0)}% do time</p>
          </div>
          <div className="rounded-3xl border border-border bg-card/60 p-10">
            <div className="flex items-center gap-4 mb-6">
              <Trophy className="w-10 h-10 text-primary" />
              <h3 className="text-4xl font-bold">Campeões do mês</h3>
            </div>
            <div className="space-y-4 max-h-[680px] overflow-hidden">
              {champions.length === 0 && (
                <p className="text-3xl text-muted-foreground italic">Nenhum barbeiro bateu a meta ainda.</p>
              )}
              {champions.slice(0, 10).map((c, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border/40 pb-3">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-mono text-primary w-12">#{i + 1}</span>
                    <div>
                      <p className="text-3xl font-semibold">{c.name}</p>
                      {c.unit && <p className="text-xl text-muted-foreground">{c.unit}</p>}
                    </div>
                  </div>
                  <span className="text-4xl font-bold text-success">{c.percent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ScaledSlide>
  );
}
