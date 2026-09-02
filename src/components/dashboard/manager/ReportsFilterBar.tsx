import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useReportsFilter } from "@/contexts/reportsFilter";
import { getCurrentMonthYear } from "@/lib/dateUtils";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Campo = "month" | "year" | "unit";

interface Unidade {
  id: string;
  name: string;
}

/**
 * Barra de recorte dos Relatórios. Mostra só os campos que o setor usa — um
 * seletor que não muda nada na tela é pior que seletor nenhum.
 */
export default function ReportsFilterBar({ fields }: { fields: Campo[] }) {
  const { month, year, unitId, setMonth, setYear, setUnitId } = useReportsFilter();
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  useEffect(() => {
    if (!fields.includes("unit")) return;
    (async () => {
      const { data } = await supabase
        .from("units")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      setUnidades((data ?? []) as Unidade[]);
    })();
  }, [fields]);

  const anoAtual = getCurrentMonthYear().year;
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - 2 + i);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {fields.includes("month") && (
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="h-9 w-[150px] bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {fields.includes("year") && (
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-9 w-[110px] bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {fields.includes("unit") && (
        <Select value={unitId} onValueChange={setUnitId}>
          <SelectTrigger className="h-9 w-[190px] bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as unidades</SelectItem>
            {unidades.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
