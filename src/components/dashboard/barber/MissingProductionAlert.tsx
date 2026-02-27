import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getManausDate, getCurrentMonthYear } from "@/lib/dateUtils";
import { useOrganization } from "@/hooks/useOrganization";
import { useOrganizationHolidays } from "@/hooks/useOrganizationHolidays";

interface MissingProductionAlertProps {
  barberId: string;
}

interface ProductionStatusRow {
  date: string;
  confirmed_presence: boolean | null;
  presence_type: string | null;
  services_basic_total: number | null;
  services_extra_total: number | null;
  products_total: number | null;
  tx_basic_total: number | null;
  tx_extra_total: number | null;
  tx_products_total: number | null;
}

const RESOLVED_PRESENCE_TYPES = new Set(["day_off", "absence", "optional_sunday", "holiday"]);

export default function MissingProductionAlert({ barberId }: MissingProductionAlertProps) {
  const { organizationId } = useOrganization();
  const [productions, setProductions] = useState<ProductionStatusRow[]>([]);
  const [isLoadingProductions, setIsLoadingProductions] = useState(true);
  const [hasLoadedAtLeastOnce, setHasLoadedAtLeastOnce] = useState(false);

  const { month: currentMonth, year: currentYear } = getCurrentMonthYear();
  const { holidayDates, loading: holidaysLoading, error: holidaysError } = useOrganizationHolidays({
    organizationId,
    month: currentMonth,
    year: currentYear,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchProductions = async () => {
      if (!barberId || holidaysLoading) return;

      if (!hasLoadedAtLeastOnce && isMounted) {
        setIsLoadingProductions(true);
      }

      try {
        const today = getManausDate();
        const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
        const yesterdayDate = new Date(today.getTime() - 86400000);
        const yesterdayStr = format(yesterdayDate, "yyyy-MM-dd");

        const { data, error } = await supabase
          .from("daily_productions")
          .select(
            "date, confirmed_presence, presence_type, services_basic_total, services_extra_total, products_total, tx_basic_total, tx_extra_total, tx_products_total"
          )
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
          setIsLoadingProductions(false);
          setHasLoadedAtLeastOnce(true);
        }
      }
    };

    fetchProductions();

    return () => {
      isMounted = false;
    };
  }, [barberId, currentMonth, currentYear, holidaysLoading, hasLoadedAtLeastOnce]);

  const missingDays = useMemo(() => {
    const today = getManausDate();
    const effectiveHolidayDates = holidaysError ? [] : holidayDates;
    const targetDays: string[] = [];

    for (let d = 1; d < today.getDate(); d++) {
      const date = new Date(currentYear, currentMonth - 1, d);
      const dateKey = format(date, "yyyy-MM-dd");

      if (!effectiveHolidayDates.includes(dateKey)) {
        targetDays.push(dateKey);
      }
    }

    const resolvedDates = new Set(
      productions
        .filter((production) => {
          const hasPresence = production.confirmed_presence === true;
          const hasResolvedPresenceType = RESOLVED_PRESENCE_TYPES.has(production.presence_type ?? "");
          const manualTotal =
            (production.services_basic_total || 0) +
            (production.services_extra_total || 0) +
            (production.products_total || 0);
          const txTotal = (production.tx_basic_total || 0) + (production.tx_extra_total || 0) + (production.tx_products_total || 0);

          return hasPresence || hasResolvedPresenceType || manualTotal > 0 || txTotal > 0;
        })
        .map((production) => production.date)
    );

    return targetDays.filter((day) => !resolvedDates.has(day));
  }, [currentMonth, currentYear, holidayDates, holidaysError, productions]);

  const isLoading = holidaysLoading || isLoadingProductions;

  if ((isLoading && !hasLoadedAtLeastOnce) || missingDays.length === 0) {
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
