import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt } from "../slideHelpers";
import { Scissors, Package } from "lucide-react";

function List({ title, Icon, items }: { title: string; Icon: typeof Scissors; items: Array<{ name: string; qty: number; revenue: number }> }) {
  return (
    <div className="rounded-3xl border border-border bg-card/60 p-10 flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <Icon className="w-10 h-10 text-primary" />
        <h3 className="text-4xl font-bold">{title}</h3>
      </div>
      <div className="flex flex-col gap-4 flex-1">
        {items.length === 0 && <p className="text-2xl text-muted-foreground">Sem vendas no período.</p>}
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-background/40 border border-border/50">
            <div className="text-4xl font-bold text-primary w-12">#{i + 1}</div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-semibold truncate">{it.name}</p>
              <p className="text-lg text-muted-foreground">{fmtInt(it.qty)} vendas</p>
            </div>
            <p className="text-2xl font-bold text-success">{fmtBRL(it.revenue)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TopServicesProductsSlide({ data }: { data: MonthlyPresentationData }) {
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-20">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Operação</p>
        <h2 className="text-7xl font-bold mb-10">O que mais saiu</h2>
        <div className="grid grid-cols-2 gap-8 flex-1">
          <List title="Top 5 serviços" Icon={Scissors} items={data.top_services_sold ?? []} />
          <List title="Top 5 produtos" Icon={Package} items={data.top_products_sold ?? []} />
        </div>
      </div>
    </ScaledSlide>
  );
}
