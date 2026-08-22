import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL } from "../slideHelpers";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function WeekdayHeatmapSlide({ data }: { data: MonthlyPresentationData }) {
  const heatmap = data.weekday_heatmap ?? [];
  const byDay: Record<number, { avg: number; total: number; days: number }> = {};
  for (let i = 0; i < 7; i++) byDay[i] = { avg: 0, total: 0, days: 0 };
  heatmap.forEach((h) => { byDay[h.weekday] = { avg: h.avg_revenue, total: h.total_revenue, days: h.days_count }; });
  const max = Math.max(...Object.values(byDay).map((v) => v.avg), 1);

  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Heatmap semanal</p>
        <h2 className="text-7xl font-bold mb-12">Qual dia mais fatura</h2>
        <div className="grid grid-cols-7 gap-6 flex-1">
          {WEEKDAYS.map((label, i) => {
            const d = byDay[i];
            const intensity = max > 0 ? d.avg / max : 0;
            return (
              <div
                key={i}
                className="rounded-3xl border border-border flex flex-col items-center justify-center p-6"
                style={{
                  background: `hsl(var(--primary) / ${0.1 + intensity * 0.5})`,
                }}
              >
                <p className="text-3xl font-bold mb-3 text-foreground">{label}</p>
                <p className="text-4xl font-bold text-primary">{fmtBRL(d.avg)}</p>
                <p className="text-lg text-muted-foreground mt-2">média/dia</p>
                <p className="text-xl text-muted-foreground mt-4">{d.days} dias</p>
                <p className="text-base text-muted-foreground/70">Total: {fmtBRL(d.total)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </ScaledSlide>
  );
}
