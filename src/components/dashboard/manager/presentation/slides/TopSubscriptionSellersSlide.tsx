import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt } from "../slideHelpers";
import { Crown } from "lucide-react";

export default function TopSubscriptionSellersSlide({ data }: { data: MonthlyPresentationData }) {
  const items = (data.top_subscription_sellers ?? []).slice(0, 3);
  const colors = ["bg-gradient-to-b from-yellow-400/30 to-yellow-400/5 border-yellow-400/50", "bg-card/60 border-border", "bg-card/40 border-border/60"];
  const heights = ["h-[360px]", "h-[300px]", "h-[250px]"];
  const order = [items[1], items[0], items[2]];
  const orderIdx = [1, 0, 2];
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-20">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Assinaturas</p>
        <h2 className="text-7xl font-bold mb-12 flex items-center gap-4">
          <Crown className="w-16 h-16 text-primary" /> Quem mais converteu novas adesões
        </h2>
        <div className="grid grid-cols-3 gap-6 items-end flex-1">
          {order.map((p, i) => {
            if (!p) return <div key={i} />;
            const rank = orderIdx[i];
            return (
              <div key={i} className={`rounded-3xl border-2 p-8 ${colors[rank]} ${heights[rank]} flex flex-col justify-end`}>
                <p className="text-6xl font-bold text-primary mb-2">#{rank + 1}</p>
                <p className="text-4xl font-bold truncate">{p.barber_name}</p>
                <p className="text-2xl text-muted-foreground mt-3">{fmtInt(p.new_subs_qty)} novas adesões</p>
                <p className="text-3xl font-bold text-success mt-3">+{fmtBRL(p.mrr_generated)} MRR</p>
              </div>
            );
          })}
        </div>
        {items.length === 0 && <div className="text-center text-3xl text-muted-foreground mt-10">Nenhuma adesão nova no período.</div>}
      </div>
    </ScaledSlide>
  );
}
