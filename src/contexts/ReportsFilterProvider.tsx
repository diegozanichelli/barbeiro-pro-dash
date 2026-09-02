import { useMemo, useState, type ReactNode } from "react";
import { getCurrentMonthYear } from "@/lib/dateUtils";
import { ReportsFilterContext } from "./reportsFilter";

export function ReportsFilterProvider({ children }: { children: ReactNode }) {
  const atual = useMemo(() => getCurrentMonthYear(), []);
  const [month, setMonth] = useState(atual.month);
  const [year, setYear] = useState(atual.year);
  const [unitId, setUnitId] = useState("all");

  const value = useMemo(
    () => ({ month, year, unitId, setMonth, setYear, setUnitId }),
    [month, year, unitId]
  );

  return <ReportsFilterContext.Provider value={value}>{children}</ReportsFilterContext.Provider>;
}
