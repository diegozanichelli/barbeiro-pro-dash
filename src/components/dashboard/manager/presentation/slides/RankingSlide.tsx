import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt } from "../slideHelpers";

export default function RankingSlide({ data }: { data: MonthlyPresentationData }) {
  const rows = data.ranking.slice(0, 10);
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Ranking</p>
        <h2 className="text-7xl font-bold mb-10">Top 10 barbeiros</h2>
        <div className="rounded-3xl border border-border bg-card/60 overflow-hidden">
          <div className="grid grid-cols-[80px_2fr_1.5fr_1fr_1fr_1fr] gap-4 px-8 py-5 border-b border-border bg-muted/30 text-2xl font-semibold uppercase tracking-wider text-muted-foreground">
            <div>#</div><div>Barbeiro</div><div>Unidade</div>
            <div className="text-right">Clientes</div><div className="text-right">Faturamento</div><div className="text-right">% Meta</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.barber_id} className="grid grid-cols-[80px_2fr_1.5fr_1fr_1fr_1fr] gap-4 px-8 py-4 items-center text-3xl border-b border-border/30 last:border-0">
              <div className={`font-bold ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>{i + 1}</div>
              <div className="font-semibold truncate">{r.name}</div>
              <div className="text-muted-foreground truncate">{r.unit || "—"}</div>
              <div className="text-right">{fmtInt(r.clients)}</div>
              <div className="text-right font-semibold text-primary">{fmtBRL(r.revenue)}</div>
              <div className={`text-right font-bold ${r.percent >= 100 ? "text-success" : r.percent >= 85 ? "text-accent" : "text-destructive"}`}>
                {r.percent.toFixed(0)}%
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="px-8 py-12 text-center text-3xl text-muted-foreground">Sem dados no período.</div>}
        </div>
      </div>
    </ScaledSlide>
  );
}
