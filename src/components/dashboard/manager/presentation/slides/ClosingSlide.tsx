import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL } from "../slideHelpers";
import { monthNamesPt } from "../slideHelpers";
import { Rocket } from "lucide-react";

export default function ClosingSlide({ data }: { data: MonthlyPresentationData }) {
  const nextMonth = data.month === 12 ? 1 : data.month + 1;
  const nextYear = data.month === 12 ? data.year + 1 : data.year;
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col justify-center items-center px-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.2),transparent_60%)]" />
        <div className="relative z-10 text-center space-y-12">
          <Rocket className="w-32 h-32 text-primary mx-auto" />
          <h1 className="text-9xl font-bold leading-none">Vamos pra cima!</h1>
          <div className="h-1 w-48 mx-auto bg-gradient-to-r from-transparent via-primary to-transparent" />
          <div className="rounded-3xl border-2 border-primary/40 bg-primary/5 p-12 mt-12 inline-block">
            <p className="text-3xl text-muted-foreground mb-3">Meta de comissão do time em</p>
            <p className="text-5xl font-semibold text-foreground mb-6">{monthNamesPt[nextMonth - 1]} / {nextYear}</p>
            <p className="text-8xl font-bold text-primary">{fmtBRL(data.next_month_target)}</p>
          </div>
          <p className="text-3xl text-muted-foreground mt-12">Obrigado pelo trabalho de cada um. 💪</p>
        </div>
      </div>
    </ScaledSlide>
  );
}
