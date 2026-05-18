import { useState } from "react";
import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { fmtBRL, monthNamesPt } from "../slideHelpers";
import { Rocket, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import SlideEditDialog from "../SlideEditDialog";

export interface ClosingOverride {
  title?: string | null;
  target_label?: string | null;
  target_value?: number | null;
  message?: string | null;
}

interface Props {
  data: MonthlyPresentationData;
  override?: ClosingOverride;
  editable?: boolean;
  onSave?: (payload: ClosingOverride) => Promise<void>;
  onReset?: () => Promise<void>;
}

export default function ClosingSlide({ data, override, editable, onSave, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const nextMonth = data.month === 12 ? 1 : data.month + 1;
  const nextYear = data.month === 12 ? data.year + 1 : data.year;
  const defaultLabel = `${monthNamesPt[nextMonth - 1]} / ${nextYear}`;

  const title = override?.title ?? "Vamos pra cima!";
  const message = override?.message ?? "Obrigado pelo trabalho de cada um. 💪";
  const targetLabel = override?.target_label ?? defaultLabel;
  const targetValue = override?.target_value ?? data.next_month_target;

  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col justify-center items-center px-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.2),transparent_60%)]" />

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
          <Rocket className="w-32 h-32 text-primary mx-auto" />
          <h1 className="text-9xl font-bold leading-none">{title}</h1>
          <div className="h-1 w-48 mx-auto bg-gradient-to-r from-transparent via-primary to-transparent" />
          <div className="rounded-3xl border-2 border-primary/40 bg-primary/5 p-12 mt-12 inline-block">
            <p className="text-3xl text-muted-foreground mb-3">Meta de comissão do time em</p>
            <p className="text-5xl font-semibold text-foreground mb-6">{targetLabel}</p>
            <p className="text-8xl font-bold text-primary">{fmtBRL(targetValue ?? 0)}</p>
          </div>
          <p className="text-3xl text-muted-foreground mt-12">{message}</p>
        </div>
      </div>

      {editable && onSave && (
        <SlideEditDialog
          open={open}
          onOpenChange={setOpen}
          title="Editar encerramento"
          description="Personalize o recado final e a meta exibida para o próximo mês."
          fields={[
            { key: "title", label: "Título", type: "text", placeholder: "Vamos pra cima!" },
            { key: "target_label", label: "Rótulo do período", type: "text", placeholder: defaultLabel },
            {
              key: "target_value",
              label: "Meta do próximo mês (R$)",
              type: "number",
              placeholder: String(data.next_month_target ?? 0),
              helper: "Deixe vazio para usar o valor calculado automaticamente do sistema.",
            },
            { key: "message", label: "Mensagem final", type: "textarea", placeholder: "Obrigado pelo trabalho..." },
          ]}
          initialValues={{
            title: override?.title ?? "",
            target_label: override?.target_label ?? "",
            target_value: override?.target_value ?? "",
            message: override?.message ?? "",
          }}
          onSave={(v) => onSave(v as ClosingOverride)}
          onReset={onReset}
        />
      )}
    </ScaledSlide>
  );
}
