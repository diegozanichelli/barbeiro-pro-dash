import { useState } from "react";
import ScaledSlide from "../ScaledSlide";
import { monthNamesPt } from "../slideHelpers";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import SlideEditDialog from "../SlideEditDialog";

export interface CoverOverride {
  eyebrow?: string | null;
  title?: string | null;
  subtitle?: string | null;
  footer?: string | null;
}

interface Props {
  data: MonthlyPresentationData;
  override?: CoverOverride;
  editable?: boolean;
  onSave?: (payload: CoverOverride) => Promise<void>;
  onReset?: () => Promise<void>;
}

export default function CoverSlide({ data, override, editable, onSave, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const defaultTitle = `${monthNamesPt[data.month - 1]} / ${data.year}`;
  const eyebrow = override?.eyebrow ?? "Reunião de Resultados";
  const title = override?.title ?? defaultTitle;
  const subtitle = override?.subtitle ?? data.org_name;
  const footer =
    override?.footer ??
    `Apresentado em ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`;

  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col justify-center items-center px-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.18),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent)/0.12),transparent_50%)]" />

        {editable && onSave && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOpen(true)}
            className="absolute top-8 right-8 z-20"
          >
            <Pencil className="w-4 h-4 mr-2" /> Editar
          </Button>
        )}

        <div className="relative z-10 text-center space-y-12">
          <p className="text-3xl font-mono uppercase tracking-[0.4em] text-primary/80">{eyebrow}</p>
          <h1 className="text-9xl font-bold leading-none">{title}</h1>
          <div className="h-1 w-48 mx-auto bg-gradient-to-r from-transparent via-primary to-transparent" />
          <p className="text-4xl font-light text-muted-foreground">{subtitle}</p>
          <p className="text-2xl text-muted-foreground/70 mt-16">{footer}</p>
        </div>
      </div>

      {editable && onSave && (
        <SlideEditDialog
          open={open}
          onOpenChange={setOpen}
          title="Editar capa"
          description="Personalize os textos da abertura da reunião."
          fields={[
            { key: "eyebrow", label: "Selo (linha de cima)", type: "text", placeholder: "Reunião de Resultados" },
            { key: "title", label: "Título principal", type: "text", placeholder: defaultTitle },
            { key: "subtitle", label: "Subtítulo", type: "text", placeholder: data.org_name },
            { key: "footer", label: "Rodapé", type: "text", placeholder: "Apresentado em ..." },
          ]}
          initialValues={{
            eyebrow: override?.eyebrow ?? "",
            title: override?.title ?? "",
            subtitle: override?.subtitle ?? "",
            footer: override?.footer ?? "",
          }}
          onSave={(v) => onSave(v as CoverOverride)}
          onReset={onReset}
        />
      )}
    </ScaledSlide>
  );
}
