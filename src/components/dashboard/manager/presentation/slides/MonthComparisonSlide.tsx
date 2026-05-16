import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt, fmtPct } from "../slideHelpers";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function MonthComparisonSlide({ data }: { data: MonthlyPresentationData }) {
  const c = data.month_comparison;
  const cards = [
    { label: "Faturamento", curr: fmtBRL(c.revenue.current), prev: fmtBRL(c.revenue.previous), delta: c.revenue.delta_pct },
    { label: "Clientes", curr: fmtInt(c.clients.current), prev: fmtInt(c.clients.previous), delta: c.clients.delta_pct },
    { label: "Ticket médio", curr: fmtBRL(c.ticket.current), prev: fmtBRL(c.ticket.previous), delta: c.ticket.delta_pct },
    { label: "Comissão paga", curr: fmtBRL(c.commission.current), prev: fmtBRL(c.commission.previous), delta: c.commission.delta_pct },
  ];
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-20">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Mês vs Mês anterior</p>
        <h2 className="text-7xl font-bold mb-10">A evolução em 4 cards</h2>
        <div className="grid grid-cols-2 gap-8 flex-1">
          {cards.map((card) => {
            const Icon = card.delta == null ? Minus : card.delta >= 0 ? TrendingUp : TrendingDown;
            const color = card.delta == null ? "text-muted-foreground" : card.delta >= 0 ? "text-success" : "text-destructive";
            return (
              <div key={card.label} className="rounded-3xl border border-border bg-card/60 p-10 flex flex-col">
                <p className="text-3xl text-muted-foreground mb-4">{card.label}</p>
                <p className="text-7xl font-bold text-primary mb-2">{card.curr}</p>
                <p className="text-2xl text-muted-foreground mb-6">Mês anterior: {card.prev}</p>
                <div className={`mt-auto flex items-center gap-3 ${color}`}>
                  <Icon className="w-12 h-12" />
                  <span className="text-5xl font-bold">{fmtPct(card.delta)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScaledSlide>
  );
}
