import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { format, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { getManausDate, getCurrentMonthYear } from "@/lib/dateUtils";
import { useOrganizationHolidays } from "@/hooks/useOrganizationHolidays";

interface BarberRow {
  id: string;
  name: string;
  units: { name: string } | null;
}

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

  const today = getManausDate();
  const { month: todayMonth, year: todayYear } = getCurrentMonthYear();
  const [selectedMonth, setSelectedMonth] = useState(todayMonth);
  const [selectedYear, setSelectedYear] = useState(todayYear);

  const isCurrentMonth = selectedMonth === todayMonth && selectedYear === todayYear;
  const { holidayDates } = useOrganizationHolidays({ organizationId, month: selectedMonth, year: selectedYear });

  const fetchMissingProductions = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data: barbers, error: barbersError } = await supabase
        .from("barbers")
        .select(`
          id,
          name,
          units (name)
        `)
        .eq("status", "active");

      if (barbersError) throw barbersError;

      const days: string[] = [];
      const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth - 1));
      const lastDay = isCurrentMonth ? today.getDate() - 1 : daysInMonth;

      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(selectedYear, selectedMonth - 1, d);
        const dateKey = format(date, "yyyy-MM-dd");
        if (date.getDay() !== 0 && !holidayDates.includes(dateKey)) {
          days.push(dateKey);
        }
      }

      const startOfMonth = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const endOfMonth = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      const { data: productions, error: prodError } = await supabase
        .from("daily_productions")
        .select("barber_id, date, confirmed_presence, services_basic_total, services_extra_total, products_total")
        .gte("date", startOfMonth)
        .lte("date", endOfMonth);

      if (prodError) throw prodError;

      const missingByBarber: BarberMissingDays[] = [];

      ((barbers || []) as BarberRow[]).forEach((barber) => {
        const confirmedDates = (productions || [])
          .filter((p) => {
            if (p.barber_id !== barber.id) return false;
            if (p.confirmed_presence === true) return true;
            const total = (p.services_basic_total || 0) + (p.services_extra_total || 0) + (p.products_total || 0);
            return total > 0;
          })
          .map((p) => p.date);

        const missingDays = days.filter((day) => !confirmedDates.includes(day));

        if (missingDays.length > 0) {
          missingByBarber.push({
            barberId: barber.id,
            barberName: barber.name,
            unitName: barber.units?.name || "Sem unidade",
            missingDays,
          });
        }
      });

      missingByBarber.sort((a, b) => b.missingDays.length - a.missingDays.length);
      setMissingData(missingByBarber);
    } catch (error) {
      console.error("Erro ao buscar produções pendentes:", error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, selectedYear, selectedMonth, holidayDates, isCurrentMonth, today]);

  useEffect(() => {
    fetchMissingProductions();
  }, [fetchMissingProductions]);

  const formatDayList = (days: string[]): string => {
    return days.map((d) => format(new Date(d + "T12:00:00"), "dd/MM", { locale: ptBR })).join(", ");
  };

  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (isCurrentMonth) return;

    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const getMonthName = () => {
    return format(new Date(selectedYear, selectedMonth - 1), "MMMM 'de' yyyy", { locale: ptBR });
  };

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
                {!loading && missingData.length > 0 && (
                  <Badge variant="outline" className="ml-2 border-orange-500/30 text-orange-500">
                    {missingData.length} barbeiro{missingData.length > 1 ? "s" : ""} • {totalMissing} dia{totalMissing > 1 ? "s" : ""}
                  </Badge>
                )}
                {!loading && missingData.length === 0 && (
                  <Badge variant="outline" className="ml-2 border-green-500/30 text-green-500">✓ Tudo em dia</Badge>
                )}
              </CardTitle>
              <ChevronDown className={`w-5 h-5 text-orange-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center justify-center gap-2 py-2">
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); goToPreviousMonth(); }} className="h-8 w-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[150px] text-center capitalize">{getMonthName()}</span>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); goToNextMonth(); }} disabled={isCurrentMonth} className="h-8 w-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : missingData.length === 0 ? (
              <p className="text-sm text-green-500 text-center py-4">✓ Todos os barbeiros lançaram suas produções em {getMonthName()}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Os seguintes barbeiros ainda não lançaram a produção diária em alguns dias de {getMonthName()}:</p>
                <div className="space-y-3">
                  {missingData.map((barber) => (
                    <div key={barber.barberId} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-card/50 rounded-lg border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">{barber.barberName}</p>
                        <p className="text-xs text-muted-foreground">{barber.unitName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-orange-500 shrink-0" />
                        <div className="text-sm">
                          <span className="text-muted-foreground">Dias sem lançamento: </span>
                          <span className="font-medium text-orange-500">{formatDayList(barber.missingDays)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
