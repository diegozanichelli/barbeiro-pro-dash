import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL } from "../slideHelpers";

export default function TicketByUnitSlide({ data }: { data: MonthlyPresentationData }) {
  const units = [...data.units_performance].sort((a, b) => b.avg_ticket - a.avg_ticket);
  const max = Math.max(1, ...units.map((u) => u.avg_ticket));
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Ticket médio</p>
        <h2 className="text-7xl font-bold mb-12">Quem cobra melhor por cliente?</h2>
        <div className="rounded-3xl border border-border bg-card/60 p-12 flex-1">
          {units.length === 0 && <p className="text-3xl text-muted-foreground italic">Sem dados.</p>}
          <div className="space-y-8">
            {units.map((u) => (
              <div key={u.unit_id}>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-3xl font-semibold">{u.name}</span>
                  <span className="text-4xl font-bold text-primary">{fmtBRL(u.avg_ticket)}</span>
                </div>
                <div className="h-6 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${(u.avg_ticket / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScaledSlide>
  );
}
