import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtInt } from "../slideHelpers";
import { Users, CalendarCheck, Activity } from "lucide-react";

export default function VisitFrequencySlide({ data }: { data: MonthlyPresentationData }) {
  const v = data.visit_frequency;
  const cards = [
    { icon: Users, label: "Clientes únicos atendidos", value: fmtInt(v?.unique_clients ?? 0), color: "text-primary" },
    { icon: CalendarCheck, label: "Visitas no mês", value: fmtInt(v?.total_visits ?? 0), color: "text-accent" },
    { icon: Activity, label: "Visitas por cliente", value: (v?.avg_visits_per_client ?? 0).toFixed(2), color: "text-success" },
  ];
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col justify-center px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Frequência</p>
        <h2 className="text-7xl font-bold mb-16">Como o cliente está voltando</h2>
        <div className="grid grid-cols-3 gap-10">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="rounded-3xl border border-border bg-card/60 p-12 text-center">
                <Icon className={`w-20 h-20 mx-auto mb-6 ${c.color}`} />
                <p className={`text-8xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-2xl text-muted-foreground mt-6">{c.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </ScaledSlide>
  );
}
