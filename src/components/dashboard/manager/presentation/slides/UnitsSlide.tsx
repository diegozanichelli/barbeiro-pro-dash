import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt } from "../slideHelpers";
import { Building2 } from "lucide-react";

export default function UnitsSlide({ data }: { data: MonthlyPresentationData }) {
  const units = data.units_performance;
  const gridCols = units.length <= 2 ? "grid-cols-2" : units.length === 3 ? "grid-cols-3" : "grid-cols-4";
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Por unidade</p>
        <h2 className="text-7xl font-bold mb-12">Performance de cada unidade</h2>
        <div className={`grid ${gridCols} gap-8`}>
          {units.map((u) => (
            <div key={u.unit_id} className="rounded-3xl border border-border bg-card/60 p-10 backdrop-blur">
              <div className="flex items-center gap-3 mb-6">
                <Building2 className="w-8 h-8 text-primary" />
                <h3 className="text-3xl font-bold truncate">{u.name}</h3>
              </div>
              <p className="text-2xl text-muted-foreground">Faturamento</p>
              <p className="text-5xl font-bold text-primary mb-6">{fmtBRL(u.revenue)}</p>
              <div className="space-y-3 text-2xl">
                <div className="flex justify-between"><span className="text-muted-foreground">Clientes</span><span className="font-semibold">{fmtInt(u.clients)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ticket médio</span><span className="font-semibold">{fmtBRL(u.avg_ticket)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">% Meta</span>
                  <span className={`font-bold ${u.percent >= 100 ? "text-success" : u.percent >= 85 ? "text-accent" : "text-destructive"}`}>{u.percent.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
          {units.length === 0 && <p className="text-3xl text-muted-foreground italic col-span-full">Sem dados de unidades.</p>}
        </div>
      </div>
    </ScaledSlide>
  );
}
