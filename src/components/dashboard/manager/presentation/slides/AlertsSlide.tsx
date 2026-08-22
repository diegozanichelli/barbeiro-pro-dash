import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { AlertTriangle } from "lucide-react";

export default function AlertsSlide({ data }: { data: MonthlyPresentationData }) {
  const alerts = data.alerts;
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-destructive/80 mb-6">Aprendizados</p>
        <h2 className="text-7xl font-bold mb-12 flex items-center gap-6">
          <AlertTriangle className="w-16 h-16 text-destructive" />
          Pontos de atenção
        </h2>
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-12 flex-1 overflow-hidden">
          {alerts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <p className="text-9xl mb-6">🎯</p>
              <p className="text-5xl font-bold text-success">Todo o time acima de 85% da meta!</p>
              <p className="text-3xl text-muted-foreground mt-4">Continuem assim.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-3xl text-muted-foreground mb-6">
                Barbeiros abaixo de 85% do pacing — vamos conversar 1:1 e ajustar o plano.
              </p>
              {alerts.slice(0, 8).map((a, i) => (
                <div key={i} className="grid grid-cols-[3fr_2fr_1fr] gap-6 items-center border-b border-destructive/20 pb-3">
                  <div>
                    <p className="text-3xl font-semibold">{a.name}</p>
                    {a.unit_name && <p className="text-xl text-muted-foreground">{a.unit_name}</p>}
                  </div>
                  <p className="text-2xl text-muted-foreground">Meta: R$ {a.target_commission.toLocaleString("pt-BR")}</p>
                  <p className="text-4xl font-bold text-destructive text-right">{a.percent?.toFixed(0) ?? "0"}%</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScaledSlide>
  );
}
