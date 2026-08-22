import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt } from "../slideHelpers";
import { Trophy, Flame, Zap, Star } from "lucide-react";

export default function RecordsSlide({ data }: { data: MonthlyPresentationData }) {
  const r = data.monthly_records;
  const bestDate = r?.best_day?.date
    ? new Date(`${r.best_day.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
    : "—";
  const cards = [
    {
      icon: Flame, color: "text-destructive border-destructive/60 bg-destructive/5",
      label: "Melhor dia da unidade", main: fmtBRL(r?.best_day?.revenue ?? 0), sub: bestDate,
    },
    {
      icon: Zap, color: "text-accent border-accent/60 bg-accent/5",
      label: "Maior venda única", main: fmtBRL(r?.biggest_ticket?.value ?? 0),
      sub: r?.biggest_ticket?.barber ? `${r.biggest_ticket.barber}${r.biggest_ticket.client ? ` • ${r.biggest_ticket.client}` : ""}` : "—",
    },
    {
      icon: Trophy, color: "text-primary border-primary/60 bg-primary/5",
      label: "Barbeiro do mês", main: r?.top_barber?.name ?? "—",
      sub: fmtBRL(r?.top_barber?.revenue ?? 0),
    },
    {
      icon: Star, color: "text-success border-success/60 bg-success/5",
      label: "Maior sequência de dias produtivos", main: `${fmtInt(r?.best_streak?.days ?? 0)} dias seguidos`,
      sub: r?.best_streak?.barber ?? "—",
    },
  ];
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-20">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Recordes do mês</p>
        <h2 className="text-7xl font-bold mb-12">Os melhores momentos</h2>
        <div className="grid grid-cols-2 gap-10 flex-1">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className={`rounded-3xl border-2 p-10 flex flex-col ${c.color}`}>
                <Icon className={`w-14 h-14 mb-4 ${c.color.split(" ")[0]}`} />
                <p className="text-2xl text-muted-foreground mb-3">{c.label}</p>
                <p className={`text-6xl font-bold ${c.color.split(" ")[0]} mb-3 truncate`}>{c.main}</p>
                <p className="text-2xl text-foreground/80 truncate">{c.sub}</p>
              </div>
            );
          })}
        </div>
      </div>
    </ScaledSlide>
  );
}
