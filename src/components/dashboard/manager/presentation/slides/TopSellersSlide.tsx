import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt } from "../slideHelpers";
import { Award } from "lucide-react";

function Podium({ title, items }: { title: string; items: Array<{ name: string; qty: number; total: number }> }) {
  const colors = ["bg-gradient-to-b from-yellow-400/30 to-yellow-400/5 border-yellow-400/50", "bg-card/60 border-border", "bg-card/40 border-border/60"];
  const heights = ["h-[360px]", "h-[300px]", "h-[250px]"];
  const order = [items[1], items[0], items[2]]; // 2º, 1º, 3º
  const orderIdx = [1, 0, 2];
  return (
    <div className="rounded-3xl border border-border bg-card/40 p-10">
      <div className="flex items-center gap-3 mb-6">
        <Award className="w-8 h-8 text-primary" />
        <h3 className="text-3xl font-bold">{title}</h3>
      </div>
      <div className="grid grid-cols-3 gap-4 items-end">
        {order.map((p, i) => {
          if (!p) return <div key={i} />;
          const rank = orderIdx[i];
          return (
            <div key={i} className={`rounded-2xl border-2 p-6 ${colors[rank]} ${heights[rank]} flex flex-col justify-end`}>
              <p className="text-5xl font-bold text-primary mb-2">#{rank + 1}</p>
              <p className="text-3xl font-semibold truncate">{p.name}</p>
              <p className="text-xl text-muted-foreground mt-2">{fmtInt(p.qty)} unidades</p>
              <p className="text-3xl font-bold text-success mt-2">{fmtBRL(p.total)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TopSellersSlide({ data }: { data: MonthlyPresentationData }) {
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-16">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Pódio</p>
        <h2 className="text-6xl font-bold mb-8">Top vendedores</h2>
        <div className="grid grid-cols-2 gap-10 flex-1 min-h-0">
          <Podium title="Extras (escova, barba, sobrancelha…)" items={data.top_extras} />
          <Podium title="Produtos" items={data.top_products} />
        </div>
      </div>
    </ScaledSlide>
  );
}
