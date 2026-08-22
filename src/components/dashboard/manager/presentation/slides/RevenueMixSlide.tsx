import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL } from "../slideHelpers";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export default function RevenueMixSlide({ data }: { data: MonthlyPresentationData }) {
  const { basic, extra, products } = data.revenue_mix;
  const total = basic + extra + products;
  const slices = [
    { name: "Cortes básicos", value: basic, color: "hsl(var(--primary))" },
    { name: "Extras", value: extra, color: "hsl(var(--accent))" },
    { name: "Produtos", value: products, color: "hsl(var(--success))" },
  ];
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Mix de receita</p>
        <h2 className="text-7xl font-bold mb-12">De onde vem o dinheiro</h2>
        <div className="grid grid-cols-2 gap-16 items-center flex-1">
          <div className="h-[600px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius={140} outerRadius={260} paddingAngle={3}>
                  {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmtBRL(v)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 22 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-8">
            {slices.map((s) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              return (
                <div key={s.name} className="rounded-2xl border border-border bg-card/60 p-8">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-8 h-8 rounded-full" style={{ background: s.color }} />
                    <p className="text-3xl font-semibold">{s.name}</p>
                  </div>
                  <p className="text-5xl font-bold">{fmtBRL(s.value)}</p>
                  <p className="text-2xl text-muted-foreground">{pct.toFixed(1)}% do total</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScaledSlide>
  );
}
