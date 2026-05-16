import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtInt, fmtPct } from "../slideHelpers";
import { UserPlus, Repeat } from "lucide-react";

export default function ClientsNewVsReturningSlide({ data }: { data: MonthlyPresentationData }) {
  const c = data.clients_new_vs_returning;
  const total = (c?.new_curr ?? 0) + (c?.returning_curr ?? 0);
  const newPct = total > 0 ? ((c?.new_curr ?? 0) / total) * 100 : 0;
  const retPct = 100 - newPct;
  const prevTotal = (c?.new_prev ?? 0) + (c?.returning_prev ?? 0);
  const deltaTotal = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;

  const circumference = 2 * Math.PI * 160;
  const newDash = (newPct / 100) * circumference;

  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-20">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Base de clientes</p>
        <h2 className="text-7xl font-bold mb-12">Novos vs. Recorrentes</h2>
        <div className="grid grid-cols-[1fr_1fr] gap-12 flex-1">
          <div className="flex items-center justify-center">
            <svg width="400" height="400" className="-rotate-90">
              <circle cx="200" cy="200" r="160" stroke="hsl(var(--accent))" strokeWidth="48" fill="none" />
              <circle cx="200" cy="200" r="160" stroke="hsl(var(--primary))" strokeWidth="48" fill="none"
                strokeDasharray={`${newDash} ${circumference}`} />
              <text x="200" y="180" textAnchor="middle" style={{ transform: "rotate(90deg)", transformOrigin: "200px 200px" }}>
                <tspan x="200" y="200" fontSize="72" fontWeight="bold" fill="hsl(var(--foreground))">{fmtInt(total)}</tspan>
                <tspan x="200" y="240" fontSize="24" fill="hsl(var(--muted-foreground))">clientes únicos</tspan>
              </text>
            </svg>
          </div>
          <div className="flex flex-col justify-center gap-6">
            <div className="rounded-3xl border border-border bg-card/60 p-8">
              <div className="flex items-center gap-3 mb-3"><UserPlus className="w-10 h-10 text-primary" /><p className="text-3xl font-semibold">Novos</p></div>
              <p className="text-6xl font-bold text-primary">{fmtInt(c?.new_curr ?? 0)}</p>
              <p className="text-xl text-muted-foreground mt-2">{newPct.toFixed(1)}% do total • mês anterior: {fmtInt(c?.new_prev ?? 0)}</p>
            </div>
            <div className="rounded-3xl border border-border bg-card/60 p-8">
              <div className="flex items-center gap-3 mb-3"><Repeat className="w-10 h-10 text-accent" /><p className="text-3xl font-semibold">Recorrentes</p></div>
              <p className="text-6xl font-bold text-accent">{fmtInt(c?.returning_curr ?? 0)}</p>
              <p className="text-xl text-muted-foreground mt-2">{retPct.toFixed(1)}% do total • mês anterior: {fmtInt(c?.returning_prev ?? 0)}</p>
            </div>
            {deltaTotal !== null && (
              <p className="text-2xl text-center mt-2">
                Variação total: <span className={`font-bold ${deltaTotal >= 0 ? "text-success" : "text-destructive"}`}>{fmtPct(deltaTotal)}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </ScaledSlide>
  );
}
