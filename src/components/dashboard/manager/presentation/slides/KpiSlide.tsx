import ScaledSlide from "../ScaledSlide";
import { fmtBRL, fmtInt, variation, fmtPct } from "../slideHelpers";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { DollarSign, Users, TrendingUp, Receipt } from "lucide-react";

export default function KpiSlide({ data }: { data: MonthlyPresentationData }) {
  const k = data.kpis, p = data.kpis_previous;
  const items = [
    { label: "Faturamento", value: fmtBRL(k.revenue), prev: fmtBRL(p.revenue), delta: variation(k.revenue, p.revenue), icon: DollarSign, color: "text-primary" },
    { label: "Comissão paga", value: fmtBRL(k.commission), prev: fmtBRL(p.commission), delta: variation(k.commission, p.commission), icon: TrendingUp, color: "text-success" },
    { label: "Clientes atendidos", value: fmtInt(k.clients), prev: fmtInt(p.clients), delta: variation(k.clients, p.clients), icon: Users, color: "text-accent" },
    { label: "Ticket médio", value: fmtBRL(k.avg_ticket), prev: fmtBRL(p.avg_ticket), delta: variation(k.avg_ticket, p.avg_ticket), icon: Receipt, color: "text-primary" },
  ];
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col justify-center px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Resumo Executivo</p>
        <h2 className="text-7xl font-bold mb-20">Os números do mês</h2>
        <div className="grid grid-cols-2 gap-10">
          {items.map((it) => {
            const Icon = it.icon;
            const positive = (it.delta ?? 0) >= 0;
            return (
              <div key={it.label} className="rounded-3xl border border-border bg-card/60 backdrop-blur p-12 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <Icon className={`w-12 h-12 ${it.color}`} />
                  <span className={`text-3xl font-semibold ${positive ? "text-success" : "text-destructive"}`}>
                    {fmtPct(it.delta)}
                  </span>
                </div>
                <p className="text-3xl text-muted-foreground mb-3">{it.label}</p>
                <p className={`text-7xl font-bold ${it.color}`}>{it.value}</p>
                <p className="text-xl text-muted-foreground/70 mt-4">vs mês anterior</p>
                <p className="text-lg text-destructive font-medium mt-1">{it.prev}</p>
              </div>
            );
          })}
        </div>
      </div>
    </ScaledSlide>
  );
}

