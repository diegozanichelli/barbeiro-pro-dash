import { createContext, useContext, useMemo, useState } from "react";
import { getCurrentMonthYear } from "@/lib/dateUtils";

/**
 * Recorte compartilhado entre as telas de Relatórios.
 *
 * Antes cada tela guardava o seu: a Evolução era por ano, o Comparativo por
 * mês, os Melhores Dias por período livre. Quem queria olhar "agosto, Unidade
 * Centro" refazia a seleção em cada uma, e nem sempre com a mesma
 * granularidade. Aqui o mês, o ano e a unidade vivem num lugar só e acompanham
 * o gestor entre os setores.
 */
export interface ReportsFilter {
  month: number;
  year: number;
  /** "all" ou o id da unidade. */
  unitId: string;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  setUnitId: (unitId: string) => void;
}

export const ReportsFilterContext = createContext<ReportsFilter | null>(null);

/**
 * Fora do provider — uma tela usada em outro contexto — devolve o mês corrente
 * e todas as unidades, para o componente seguir funcionando sozinho.
 */
export function useReportsFilter(): ReportsFilter {
  const ctx = useContext(ReportsFilterContext);
  const atual = useMemo(() => getCurrentMonthYear(), []);
  const [avulso, setAvulso] = useState({ month: atual.month, year: atual.year, unitId: "all" });

  const isolado = useMemo<ReportsFilter>(
    () => ({
      ...avulso,
      setMonth: (month) => setAvulso((a) => ({ ...a, month })),
      setYear: (year) => setAvulso((a) => ({ ...a, year })),
      setUnitId: (unitId) => setAvulso((a) => ({ ...a, unitId })),
    }),
    [avulso]
  );

  return ctx ?? isolado;
}
