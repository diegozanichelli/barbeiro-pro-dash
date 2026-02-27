import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getManausDate } from "@/lib/dateUtils";

interface MissingProductionAlertProps {
  barberId: string;
}

interface ProductionStatusRow {
  date: string;
  presence_type: string | null;
}

const RESOLVED_PRESENCE_TYPES = new Set(["day_off", "absence", "optional_sunday", "holiday"]);

export default function MissingProductionAlert({ barberId }: MissingProductionAlertProps) {
  const [productions, setProductions] = useState<ProductionStatusRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchProductions = async () => {
      if (!barberId) {
        if (isMounted) {
          setProductions([]);
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setIsLoading(true);
      }

      try {
        const today = getManausDate();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
        const yesterdayDate = new Date(today.getTime() - 86400000);
        const yesterdayStr = format(yesterdayDate, "yyyy-MM-dd");

        const { data, error } = await supabase
          .from("daily_productions")
          .select("date, presence_type")
          .eq("barber_id", barberId)
          .gte("date", startOfMonth)
          .lte("date", yesterdayStr);

        if (error) throw error;

        if (isMounted) {
          setProductions((data || []) as ProductionStatusRow[]);
        }
      } catch (error) {
        console.error("Erro ao verificar dias pendentes:", error);
        if (isMounted) {
          setProductions([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProductions();

    return () => {
      isMounted = false;
    };
  }, [barberId]);

  const currentDateKey = format(getManausDate(), "yyyy-MM-dd");

  const missingDays = useMemo(() => {
    const safeProductions = productions || [];

    const currentDate = new Date(`${currentDateKey}T12:00:00`);
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const expectedDays: string[] = [];
    for (let day = 1; day < currentDate.getDate(); day++) {
      const date = new Date(currentYear, currentMonth, day);
      expectedDays.push(format(date, "yyyy-MM-dd"));
    }

    const resolvedDays = new Set(
      safeProductions
        .filter((production) => {
          const hasAnyProductionRecord = Boolean(production?.date);
          const isResolvedPresenceType = RESOLVED_PRESENCE_TYPES.has(production.presence_type ?? "");
          return hasAnyProductionRecord || isResolvedPresenceType;
        })
        .map((production) => production.date)
    );

    return expectedDays.filter((day) => !resolvedDays.has(day));
  }, [productions, currentDateKey]);

  console.log("Dias pendentes calculados:", missingDays);

  if (isLoading) {
    return null;
  }

  if (missingDays.length === 0) {
    return null;
  }

  return (
    <Card className="bg-red-500/10 border-red-500/50 shadow-lg">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-500/20 rounded-full shrink-0">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div className="space-y-2 flex-1">
            <h3 className="font-bold text-red-500 flex items-center gap-2">⚠️ Produções Pendentes!</h3>
            <p className="text-sm text-foreground">Você ainda não lançou a produção dos seguintes dias:</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {missingDays.map((day) => (
                <span key={day} className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-500 rounded text-sm font-medium">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(`${day}T12:00:00`), "dd/MM", { locale: ptBR })}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Lance sua produção diária para manter seu acompanhamento em dia.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
