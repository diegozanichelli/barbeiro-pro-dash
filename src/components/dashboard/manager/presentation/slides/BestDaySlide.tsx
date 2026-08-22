import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt } from "../slideHelpers";
import { Flame } from "lucide-react";

export default function BestDaySlide({ data }: { data: MonthlyPresentationData }) {
  const d = data.best_day;
  const dateStr = d.date
    ? new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
    : "—";
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,hsl(var(--primary)/0.15),transparent_60%)]" />
        <div className="relative z-10">
          <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Pico do mês</p>
          <h2 className="text-7xl font-bold mb-16 flex items-center gap-6">
            <Flame className="w-20 h-20 text-primary" />
            Dia mais forte
          </h2>
          {!d.date ? (
            <p className="text-3xl text-muted-foreground italic">Sem produção no mês.</p>
          ) : (
            <>
              <p className="text-5xl font-light text-muted-foreground mb-2 capitalize">{dateStr}</p>
              <div className="grid grid-cols-2 gap-10 mt-12">
                <div className="rounded-3xl border border-border bg-card/60 p-12">
                  <p className="text-3xl text-muted-foreground">Faturamento</p>
                  <p className="text-8xl font-bold text-primary mt-3">{fmtBRL(d.revenue)}</p>
                </div>
                <div className="rounded-3xl border border-border bg-card/60 p-12">
                  <p className="text-3xl text-muted-foreground">Clientes atendidos</p>
                  <p className="text-8xl font-bold text-accent mt-3">{fmtInt(d.clients)}</p>
                </div>
              </div>
              {d.star_barber && (
                <div className="mt-12 rounded-3xl border-2 border-primary/40 bg-primary/5 p-10">
                  <p className="text-3xl text-muted-foreground">Quem brilhou nesse dia</p>
                  <p className="text-6xl font-bold text-primary mt-2">⭐ {d.star_barber}</p>
                  <p className="text-3xl text-success font-semibold mt-2">{fmtBRL(d.star_commission)} em comissão</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ScaledSlide>
  );
}
