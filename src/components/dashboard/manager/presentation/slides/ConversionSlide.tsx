import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtInt } from "../slideHelpers";

export default function ConversionSlide({ data }: { data: MonthlyPresentationData }) {
  const f = data.subscription_funnel;
  const tier =
    f.conversion_rate >= 30 ? { label: "ELITE", color: "text-success", bg: "bg-success/10 border-success/40" }
    : f.conversion_rate >= 15 ? { label: "REGULAR", color: "text-accent", bg: "bg-accent/10 border-accent/40" }
    : { label: "CRÍTICO", color: "text-destructive", bg: "bg-destructive/10 border-destructive/40" };
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Conversão</p>
        <h2 className="text-7xl font-bold mb-16">Novos clientes → assinantes</h2>
        <div className="grid grid-cols-3 gap-10 items-center">
          <div className="rounded-3xl border border-border bg-card/60 p-12 text-center">
            <p className="text-3xl text-muted-foreground mb-4">Clientes novos</p>
            <p className="text-8xl font-bold">{fmtInt(f.new_clients)}</p>
          </div>
          <div className="text-center">
            <p className="text-5xl text-muted-foreground mb-4">→</p>
            <div className={`inline-block rounded-2xl border-2 px-8 py-4 ${tier.bg}`}>
              <p className={`text-4xl font-bold ${tier.color}`}>{tier.label}</p>
            </div>
            <p className={`text-9xl font-bold mt-6 ${tier.color}`}>{f.conversion_rate.toFixed(1)}%</p>
            <p className="text-2xl text-muted-foreground mt-2">taxa de conversão</p>
          </div>
          <div className="rounded-3xl border border-border bg-card/60 p-12 text-center">
            <p className="text-3xl text-muted-foreground mb-4">Viraram assinantes</p>
            <p className="text-8xl font-bold text-primary">{fmtInt(f.new_subscriptions)}</p>
          </div>
        </div>
        <div className="mt-16 rounded-2xl border border-border/50 bg-muted/20 p-8 text-center">
          <p className="text-2xl text-muted-foreground">
            Faixas: <span className="text-success font-semibold">Elite ≥ 30%</span> • <span className="text-accent font-semibold">Regular 15-29%</span> • <span className="text-destructive font-semibold">Crítico &lt; 15%</span>
          </p>
        </div>
      </div>
    </ScaledSlide>
  );
}
