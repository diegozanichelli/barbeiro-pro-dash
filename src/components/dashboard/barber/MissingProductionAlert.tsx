import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MissingProductionAlertProps {
  barberId: string;
}

export default function MissingProductionAlert({ barberId }: MissingProductionAlertProps) {
  const [missingDays, setMissingDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  useEffect(() => {
    fetchMissingDays();
  }, [barberId]);

  const getWorkingDaysUntilToday = (): string[] => {
    const days: string[] = [];
    for (let d = 1; d < today.getDate(); d++) {
      const date = new Date(currentYear, currentMonth - 1, d);
      if (date.getDay() !== 0) { // Excluir domingos
        days.push(format(date, "yyyy-MM-dd"));
      }
    }
    return days;
  };

  const fetchMissingDays = async () => {
    if (!barberId) return;

    setLoading(true);

    try {
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
      const yesterdayStr = format(new Date(today.getTime() - 86400000), "yyyy-MM-dd");

      const { data: productions, error } = await supabase
        .from("daily_productions")
        .select("date")
        .eq("barber_id", barberId)
        .gte("date", startOfMonth)
        .lte("date", yesterdayStr);

      if (error) throw error;

      const workingDays = getWorkingDaysUntilToday();
      const productionDates = (productions || []).map(p => p.date);
      const missing = workingDays.filter(day => !productionDates.includes(day));

      setMissingDays(missing);
    } catch (error) {
      console.error("Erro ao verificar dias pendentes:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDayList = (days: string[]): string => {
    return days
      .map(d => format(new Date(d + "T12:00:00"), "dd/MM (EEEE)", { locale: ptBR }))
      .join(", ");
  };

  if (loading || missingDays.length === 0) {
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
            <h3 className="font-bold text-red-500 flex items-center gap-2">
              ⚠️ Produções Pendentes!
            </h3>
            <p className="text-sm text-foreground">
              Você ainda não lançou a produção dos seguintes dias:
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {missingDays.map((day) => (
                <span 
                  key={day}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-500 rounded text-sm font-medium"
                >
                  <Calendar className="w-3 h-3" />
                  {format(new Date(day + "T12:00:00"), "dd/MM", { locale: ptBR })}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Lance sua produção diária para manter seu acompanhamento em dia.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
