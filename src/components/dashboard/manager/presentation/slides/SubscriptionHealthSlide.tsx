import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, fmtInt } from "../slideHelpers";
import { Repeat, ArrowUp, ArrowDown, Plus } from "lucide-react";

export default function SubscriptionHealthSlide({ data }: { data: MonthlyPresentationData }) {
  const h = data.subscription_health;
  const cards = [
    { label: "Novas adesões", value: h.new, icon: Plus, color: "text-success" },
    { label: "Renovações", value: h.renew, icon: Repeat, color: "text-primary" },
    { label: "Upgrades", value: h.upgrade, icon: ArrowUp, color: "text-accent" },
    { label: "Downgrades", value: h.downgrade, icon: ArrowDown, color: "text-destructive" },
  ];
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-primary/80 mb-6">Assinaturas</p>
        <h2 className="text-7xl font-bold mb-12">Saúde da base e MRR</h2>
        <div className="grid grid-cols-4 gap-6 mb-10">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="rounded-3xl border border-border bg-card/60 p-8 text-center">
                <Icon className={`w-12 h-12 mx-auto mb-3 ${c.color}`} />
                <p className="text-7xl font-bold">{fmtInt(c.value)}</p>
                <p className="text-2xl text-muted-foreground mt-2">{c.label}</p>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-8 flex-1">
          <div className="rounded-3xl border border-border bg-card/60 p-10 flex flex-col justify-center">
            <p className="text-3xl text-muted-foreground mb-4">Variação de MRR no mês</p>
            <p className={`text-8xl font-bold ${h.mrr_delta >= 0 ? "text-success" : "text-destructive"}`}>
              {h.mrr_delta >= 0 ? "+" : ""}{fmtBRL(h.mrr_delta)}
            </p>
            <p className="text-2xl text-muted-foreground mt-3">considerando upgrades e downgrades</p>
          </div>
          <div className="rounded-3xl border border-border bg-card/60 p-10">
            <h3 className="text-3xl font-bold mb-6">Motivos de downgrade</h3>
            <div className="space-y-3">
              {h.top_downgrade_reasons.length === 0 && (
                <p className="text-2xl text-muted-foreground italic">Nenhum downgrade neste mês 🎉</p>
              )}
              {h.top_downgrade_reasons.slice(0, 5).map((r, i) => (
                <div key={i} className="flex justify-between items-center border-b border-border/30 pb-3">
                  <span className="text-2xl">{r.reason}</span>
                  <span className="text-3xl font-bold text-destructive">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ScaledSlide>
  );
}
