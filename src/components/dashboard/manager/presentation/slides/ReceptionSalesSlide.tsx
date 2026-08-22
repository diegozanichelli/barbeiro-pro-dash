import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt } from "../slideHelpers";
import { Building2 } from "lucide-react";

export default function ReceptionSalesSlide({ data }: { data: MonthlyPresentationData }) {
  const rows = data.reception_sales ?? [];
  const total = rows.reduce((acc, r) => acc + Number(r.revenue || 0), 0);
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-20">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">Recepção</p>
        <h2 className="text-7xl font-bold mb-6">Vendas feitas no caixa</h2>
        <p className="text-3xl text-muted-foreground mb-10">Total: <span className="text-primary font-bold">{fmtBRL(total)}</span></p>
        <div className="rounded-3xl border border-border bg-card/60 overflow-hidden flex-1">
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 px-8 py-5 border-b border-border bg-muted/30 text-2xl font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Unidade</div>
            <div className="text-right">Vendas</div>
            <div className="text-right">Receita</div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr] gap-4 px-8 py-5 items-center text-3xl border-b border-border/30 last:border-0">
              <div className="font-semibold flex items-center gap-3"><Building2 className="w-8 h-8 text-accent" />{r.unit_name}</div>
              <div className="text-right">{fmtInt(r.count)}</div>
              <div className="text-right font-bold text-primary">{fmtBRL(r.revenue)}</div>
            </div>
          ))}
          {rows.length === 0 && <div className="px-8 py-16 text-center text-3xl text-muted-foreground">Nenhuma venda da recepção no período.</div>}
        </div>
      </div>
    </ScaledSlide>
  );
}
