import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtInt, fmtPct, variation } from "../slideHelpers";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

export default function NewClientsSlide({ data }: { data: MonthlyPresentationData }) {
  const { total, previous_total, by_unit } = data.new_clients;
  const delta = variation(total, previous_total);
  const colors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--success))", "hsl(var(--destructive))"];
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Aquisição</p>
        <h2 className="text-7xl font-bold mb-12">Clientes novos no mês</h2>
        <div className="grid grid-cols-[1fr_2fr] gap-12 items-stretch">
          <div className="rounded-3xl border border-border bg-card/60 p-12 flex flex-col justify-center">
            <p className="text-3xl text-muted-foreground">Total no mês</p>
            <p className="text-[9rem] leading-none font-bold text-primary">{fmtInt(total)}</p>
            <p className={`text-4xl font-semibold mt-6 ${(delta ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
              {fmtPct(delta)} <span className="text-2xl text-muted-foreground font-normal">vs mês anterior ({fmtInt(previous_total)})</span>
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-card/60 p-10">
            <h3 className="text-3xl font-semibold mb-6">Por unidade</h3>
            <div className="h-[600px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={by_unit} layout="vertical" margin={{ top: 10, right: 40, left: 100, bottom: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 22, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="unit" tick={{ fontSize: 24, fill: "hsl(var(--foreground))" }} width={200} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 22 }} />
                  <Bar dataKey="value" radius={[0, 12, 12, 0]}>
                    {by_unit.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </ScaledSlide>
  );
}
