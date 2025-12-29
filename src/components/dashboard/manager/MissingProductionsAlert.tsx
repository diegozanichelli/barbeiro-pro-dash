import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BarberMissingDays {
  barberId: string;
  barberName: string;
  unitName: string;
  missingDays: string[];
}

export default function MissingProductionsAlert() {
  const { organizationId } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const [missingData, setMissingData] = useState<BarberMissingDays[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  useEffect(() => {
    fetchMissingProductions();
  }, [organizationId]);

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

  const fetchMissingProductions = async () => {
    if (!organizationId) return;

    setLoading(true);

    try {
      // Buscar todos os barbeiros ativos com metas
      const { data: barbers, error: barbersError } = await supabase
        .from("barbers")
        .select(`
          id,
          name,
          units (name)
        `)
        .eq("status", "active");

      if (barbersError) throw barbersError;

      // Buscar produções do mês atual
      const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
      const yesterdayStr = format(new Date(today.getTime() - 86400000), "yyyy-MM-dd");
      
      const { data: productions, error: prodError } = await supabase
        .from("daily_productions")
        .select("barber_id, date")
        .gte("date", startOfMonth)
        .lte("date", yesterdayStr);

      if (prodError) throw prodError;

      // Dias úteis até ontem (não incluir hoje)
      const workingDays = getWorkingDaysUntilToday();

      // Calcular dias faltantes para cada barbeiro
      const missingByBarber: BarberMissingDays[] = [];

      (barbers || []).forEach((barber: any) => {
        const barberProductions = (productions || [])
          .filter(p => p.barber_id === barber.id)
          .map(p => p.date);

        const missingDays = workingDays.filter(day => !barberProductions.includes(day));

        if (missingDays.length > 0) {
          missingByBarber.push({
            barberId: barber.id,
            barberName: barber.name,
            unitName: barber.units?.name || "Sem unidade",
            missingDays,
          });
        }
      });

      // Ordenar por quantidade de dias faltantes (maior primeiro)
      missingByBarber.sort((a, b) => b.missingDays.length - a.missingDays.length);

      setMissingData(missingByBarber);
    } catch (error) {
      console.error("Erro ao buscar produções pendentes:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDayList = (days: string[]): string => {
    return days
      .map(d => format(new Date(d + "T12:00:00"), "dd/MM", { locale: ptBR }))
      .join(", ");
  };

  if (loading) {
    return null;
  }

  if (missingData.length === 0) {
    return null;
  }

  const totalMissing = missingData.reduce((sum, b) => sum + b.missingDays.length, 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-orange-500/10 border-orange-500/30">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-orange-500/5 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-orange-500">
                <AlertTriangle className="w-5 h-5" />
                Produções Pendentes
                <Badge variant="outline" className="ml-2 border-orange-500/30 text-orange-500">
                  {missingData.length} barbeiro{missingData.length > 1 ? "s" : ""} • {totalMissing} dia{totalMissing > 1 ? "s" : ""}
                </Badge>
              </CardTitle>
              <ChevronDown 
                className={`w-5 h-5 text-orange-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Os seguintes barbeiros ainda não lançaram a produção diária em alguns dias deste mês:
            </p>
            <div className="space-y-3">
              {missingData.map((barber) => (
                <div 
                  key={barber.barberId}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-card/50 rounded-lg border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{barber.barberName}</p>
                    <p className="text-xs text-muted-foreground">{barber.unitName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-500 shrink-0" />
                    <div className="text-sm">
                      <span className="text-muted-foreground">Dias sem lançamento: </span>
                      <span className="font-medium text-orange-500">
                        {formatDayList(barber.missingDays)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
