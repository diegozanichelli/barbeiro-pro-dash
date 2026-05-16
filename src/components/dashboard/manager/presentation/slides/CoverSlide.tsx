import ScaledSlide from "../ScaledSlide";
import { monthNamesPt } from "../slideHelpers";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";

export default function CoverSlide({ data }: { data: MonthlyPresentationData }) {
  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col justify-center items-center px-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.18),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent)/0.12),transparent_50%)]" />
        <div className="relative z-10 text-center space-y-12">
          <p className="text-3xl font-mono uppercase tracking-[0.4em] text-primary/80">
            Reunião de Resultados
          </p>
          <h1 className="text-9xl font-bold leading-none">
            {monthNamesPt[data.month - 1]}
            <span className="text-primary"> / {data.year}</span>
          </h1>
          <div className="h-1 w-48 mx-auto bg-gradient-to-r from-transparent via-primary to-transparent" />
          <p className="text-4xl font-light text-muted-foreground">{data.org_name}</p>
          <p className="text-2xl text-muted-foreground/70 mt-16">
            Apresentado em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>
    </ScaledSlide>
  );
}
