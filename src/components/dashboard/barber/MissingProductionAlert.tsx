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
  confirmed_presence: boolean | null;
  presence_type: string | null;
  services_basic_total: number | null;
  services_extra_total: number | null;
  products_total: number | null;
}

interface TransactionDateRow {
  created_at: string;
}

const RESOLVED_PRESENCE_TYPES = new Set(["day_off", "absence", "optional_sunday", "holiday", "present"]);

const toManausDateKey = (isoDateTime: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoDateTime));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

export default function MissingProductionAlert({ barberId }: MissingProductionAlertProps) {
  const [productions, setProductions] = useState<ProductionStatusRow[]>([]);
  const [transactionDates, setTransactionDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchPendingContext = async () => {
      if (!barberId) {
        if (isMounted) {
          setProductions([]);
          setTransactionDates([]);
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

        const [productionsRes, transactionsRes] = await Promise.all([
          supabase
            .from("daily_productions")
            .select("date, confirmed_presence, presence_type, services_basic_total, services_extra_total, products_total")
            .eq("barber_id", barberId)
            .gte("date", startOfMonth)
            .lte("date", yesterdayStr),
          supabase
            .from("sale_transactions")
            .select("created_at")
            .eq("barber_id", barberId)
            .gte("created_at", `${startOfMonth}T00:00:00-04:00`)
            .lt("created_at", `${format(today, "yyyy-MM-dd")}T00:00:00-04:00`),
        ]);

        if (productionsRes.error) throw productionsRes.error;
        if (transactionsRes.error) throw transactionsRes.error;

        if (isMounted) {
          const txDateSet = new Set(
            ((transactionsRes.data || []) as TransactionDateRow[])
              .map((transaction) => toManausDateKey(transaction.created_at))
          );

          setProductions((productionsRes.data || []) as ProductionStatusRow[]);
          setTransactionDates(Array.from(txDateSet));
        }
      } catch (error) {
        console.error("Erro ao verificar dias pendentes:", error);
        if (isMounted) {
          setProductions([]);
          setTransactionDates([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPendingContext();

    return () => {
      isMounted = false;
    };
  }, [barberId]);

  const currentDateKey = format(getManausDate(), "yyyy-MM-dd");

  const missingDays = useMemo(() => {
    const currentDate = new Date(`${currentDateKey}T12:00:00`);
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const expectedDays: string[] = [];
    for (let day = 1; day < currentDate.getDate(); day++) {
      const date = new Date(currentYear, currentMonth, day);
      expectedDays.push(format(date, "yyyy-MM-dd"));
    }

    const resolvedFromTransactions = new Set(transactionDates);

    const resolvedFromProduction = new Set(
      productions
        .filter((production) => {
          const totalValue =
            (Number(production.services_basic_total) || 0) +
            (Number(production.services_extra_total) || 0) +
            (Number(production.products_total) || 0);

          const hasConfirmedPresence = production.confirmed_presence === true;
          const hasResolvedPresenceType = RESOLVED_PRESENCE_TYPES.has(production.presence_type ?? "");

          return totalValue > 0 || hasConfirmedPresence || hasResolvedPresenceType;
        })
        .map((production) => production.date)
    );

    const resolvedDays = new Set([...resolvedFromTransactions, ...resolvedFromProduction]);

    return expectedDays.filter((day) => !resolvedDays.has(day));
  }, [productions, transactionDates, currentDateKey]);

  if (isLoading || missingDays.length === 0) {
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
            <h3 className="font-bold text-red-500 flex items-center gap-2">⚠️ Dias pendentes de conferência</h3>
            <p className="text-sm text-foreground">Ainda existem dias sem lançamento da recepção ou sem status confirmado:</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {missingDays.map((day) => (
                <span key={day} className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-500 rounded text-sm font-medium">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(`${day}T12:00:00`), "dd/MM", { locale: ptBR })}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">A recepção deve lançar as vendas ou registrar folga/falta/presença sem venda nesses dias.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
