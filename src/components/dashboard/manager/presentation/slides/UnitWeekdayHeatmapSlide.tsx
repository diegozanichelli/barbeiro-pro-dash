import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL } from "../slideHelpers";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface UnitHeatmap {
  unit_id: string;
  unit_name: string;
  weekday: number;
  total_revenue: number;
  days_count: number;
  avg_revenue: number;
}

export default function UnitWeekdayHeatmapSlide({ data }: { data: MonthlyPresentationData }) {
  const rows = data.unit_weekday_heatmap ?? [];

  const byUnit: Record<string, { name: string; days: UnitHeatmap[] }> = {};
  for (const r of rows) {
    if (!byUnit[r.unit_id]) byUnit[r.unit_id] = { name: r.unit_name, days: [] };
    byUnit[r.unit_id].days.push(r);
  }

  const units = Object.values(byUnit).map((u) => {
    const sorted = [...u.days].sort((a, b) => a.avg_revenue - b.avg_revenue);
    return {
      name: u.name,
      days: WEEKDAYS.map((label, i) => {
        const d = u.days.find((x) => x.weekday === i);
        return { label, avg: d?.avg_revenue ?? 0, total: d?.total_revenue ?? 0, days: d?.days_count ?? 0 };
      }),
      maxWeekday: sorted[sorted.length - 1]?.weekday ?? null,
      minWeekday: sorted[0]?.weekday ?? null,
    };
  });

  const maxAvg = Math.max(
    1,
    ...units.flatMap((u) => u.days.map((d) => d.avg))
  );

  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-20">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Heatmap por unidade</p>
        <h2 className="text-6xl font-bold mb-8">Dia que mais e menos fatura</h2>
        <div className="grid grid-cols-2 gap-8 flex-1 overflow-y-auto">
          {units.map((u) => (
            <div
              key={u.name}
              className="rounded-3xl border border-border bg-card/60 p-8 flex flex-col"
            >
              <h3 className="text-3xl font-bold mb-6 truncate">{u.name}</h3>
              <div className="flex-1 flex flex-col justify-center gap-4">
                {u.days.map((d) => {
                  const isMax = d.label === WEEKDAYS[u.maxWeekday ?? -1];
                  const isMin = d.label === WEEKDAYS[u.minWeekday ?? -1];
                  const intensity = maxAvg > 0 ? d.avg / maxAvg : 0;
                  const barColor = isMax
                    ? "bg-success"
                    : isMin
                    ? "bg-destructive"
                    : "bg-primary";
                  return (
                    <div key={d.label} className="flex items-center gap-4">
                      <span className="w-12 text-xl font-semibold text-muted-foreground">{d.label}</span>
                      <div className="flex-1 h-10 rounded-xl bg-muted/30 overflow-hidden relative">
                        <div
                          className={`h-full ${barColor} absolute left-0 top-0`}
                          style={{ width: `${Math.max(4, intensity * 100)}%`, opacity: isMax || isMin ? 1 : 0.5 + intensity * 0.5 }}
                        />
                        <div className="absolute inset-0 flex items-center justify-end px-4">
                          <span className="text-xl font-bold text-foreground drop-shadow">
                            {fmtBRL(d.avg)}
                          </span>
                        </div>
                      </div>
                      <span className="w-28 text-right text-lg text-muted-foreground">
                        {d.days} dia{d.days !== 1 ? "s" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 flex items-center justify-between text-lg">
                <span className="text-success font-semibold">
                  Mais: {WEEKDAYS[u.maxWeekday ?? -1]} ({fmtBRL(Math.max(...u.days.map((d) => d.avg)))})
                </span>
                <span className="text-destructive font-semibold">
                  Menos: {WEEKDAYS[u.minWeekday ?? -1]} ({fmtBRL(Math.min(...u.days.map((d) => d.avg)))})
                </span>
              </div>
            </div>
          ))}
          {units.length === 0 && (
            <div className="col-span-2 flex items-center justify-center text-3xl text-muted-foreground">
              Sem dados por unidade no período.
            </div>
          )}
        </div>
      </div>
    </ScaledSlide>
  );
}
