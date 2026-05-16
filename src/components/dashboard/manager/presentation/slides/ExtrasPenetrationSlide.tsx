import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtInt, fmtPct } from "../slideHelpers";
import { Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function ExtrasPenetrationSlide({ data }: { data: MonthlyPresentationData }) {
  const e = data.extras_penetration;
  const pct = e?.pct_curr ?? 0;
  const delta = e ? e.pct_curr - e.pct_prev : 0;
  const DeltaIcon = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaColor = delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-success" : "text-destructive";
  const circumference = 2 * Math.PI * 180;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-20">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Penetração de extras</p>
        <h2 className="text-7xl font-bold mb-12">Quantos clientes levaram um extra</h2>
        <div className="grid grid-cols-[1fr_1fr] gap-12 flex-1">
          <div className="flex items-center justify-center">
            <svg width="440" height="440" className="-rotate-90">
              <circle cx="220" cy="220" r="180" stroke="hsl(var(--muted))" strokeWidth="40" fill="none" />
              <circle cx="220" cy="220" r="180" stroke="hsl(var(--primary))" strokeWidth="40" fill="none"
                strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
              <text x="220" y="200" textAnchor="middle" className="rotate-90" style={{ transform: "rotate(90deg)", transformOrigin: "220px 220px" }}>
                <tspan x="220" y="210" fontSize="96" fontWeight="bold" fill="hsl(var(--primary))">{pct.toFixed(1)}%</tspan>
                <tspan x="220" y="260" fontSize="28" fill="hsl(var(--muted-foreground))">com extra</tspan>
              </text>
            </svg>
          </div>
          <div className="flex flex-col justify-center gap-8">
            <div className="rounded-3xl border border-border bg-card/60 p-8">
              <Sparkles className="w-12 h-12 text-accent mb-4" />
              <p className="text-2xl text-muted-foreground mb-2">Clientes com pelo menos 1 extra</p>
              <p className="text-6xl font-bold text-primary">{fmtInt(e?.clients_with_extra ?? 0)}</p>
              <p className="text-2xl text-muted-foreground mt-3">de {fmtInt(e?.total_clients ?? 0)} clientes atendidos</p>
            </div>
            <div className="rounded-3xl border border-border bg-card/60 p-8">
              <p className="text-2xl text-muted-foreground mb-2">Comparativo vs. mês anterior</p>
              <p className="text-3xl mb-4">Mês passado: <span className="font-bold">{(e?.pct_prev ?? 0).toFixed(1)}%</span></p>
              <div className={`flex items-center gap-3 ${deltaColor}`}>
                <DeltaIcon className="w-10 h-10" />
                <span className="text-5xl font-bold">{fmtPct(delta)}</span>
                <span className="text-2xl text-muted-foreground">pontos %</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScaledSlide>
  );
}
