import { useEffect, useState } from "react";
import ScaledSlide from "../ScaledSlide";
import { MonthlyPresentationData } from "@/hooks/useMonthlyPresentationData";
import { ListChecks } from "lucide-react";

interface Props {
  data: MonthlyPresentationData;
  orgId: string;
  unitKey: string;
  editable?: boolean;
}

export default function NextStepsSlide({ data, orgId, unitKey, editable }: Props) {
  const key = `mtg-notes:${orgId}:${data.year}-${String(data.month).padStart(2, "0")}:${unitKey}`;
  const [notes, setNotes] = useState<string[]>(["", "", ""]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setNotes([parsed[0] || "", parsed[1] || "", parsed[2] || ""]);
      } else {
        setNotes(["", "", ""]);
      }
    } catch {
      setNotes(["", "", ""]);
    }
  }, [key]);

  const update = (i: number, v: string) => {
    const next = [...notes];
    next[i] = v;
    setNotes(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <ScaledSlide>
      <div className="w-full h-full flex flex-col px-32 py-24">
        <p className="text-2xl font-mono uppercase tracking-[0.3em] text-accent/80 mb-6">Próximos passos</p>
        <h2 className="text-7xl font-bold mb-12 flex items-center gap-6">
          <ListChecks className="w-16 h-16 text-accent" />
          Nossos compromissos do próximo mês
        </h2>
        <div className="space-y-8 flex-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-3xl border border-border bg-card/60 p-10 flex items-start gap-8">
              <span className="text-7xl font-bold text-accent leading-none">{i + 1}.</span>
              {editable ? (
                <textarea
                  value={notes[i]}
                  onChange={(e) => update(i, e.target.value)}
                  placeholder="Escreva aqui o compromisso…"
                  className="flex-1 bg-transparent text-4xl outline-none resize-none placeholder:text-muted-foreground/40"
                  rows={2}
                />
              ) : (
                <p className="flex-1 text-4xl leading-snug">
                  {notes[i] || <span className="text-muted-foreground/40 italic">— sem nota —</span>}
                </p>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <p className="text-xl text-muted-foreground/60 mt-8 text-center">
            ✏️ Editável só no preview. As notas ficam salvas neste navegador.
          </p>
        )}
      </div>
    </ScaledSlide>
  );
}
