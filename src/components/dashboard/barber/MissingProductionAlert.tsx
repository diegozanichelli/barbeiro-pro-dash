import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getManausDate } from "@/lib/dateUtils";
import StatusDoDiaDialog, { type PresenceType } from "./StatusDoDiaDialog";
import { toast } from "sonner";

interface MissingProductionAlertProps {
  barberId: string;
  organizationId: string;
  onStatusRegistered?: () => void;
}

interface ProductionStatusRow {
  date: string;
  presence_type: string | null;
  services_basic_total: number | null;
  services_extra_total: number | null;
  products_total: number | null;
  services_total: number | null;
  tx_basic_total: number | null;
  tx_extra_total: number | null;
  tx_products_total: number | null;
}

const RESOLVED_PRESENCE_TYPES = new Set(["day_off", "absence", "optional_sunday", "holiday", "present"]);

export default function MissingProductionAlert({ barberId, organizationId, onStatusRegistered }: MissingProductionAlertProps) {
  const [productions, setProductions] = useState<ProductionStatusRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

      if (isMounted) setIsLoading(true);

      try {
        const today = getManausDate();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
        const yesterdayDate = new Date(today.getTime() - 86400000);
        const yesterdayStr = format(yesterdayDate, "yyyy-MM-dd");

        const { data, error } = await supabase
          .from("daily_productions")
          .select("date, presence_type, services_basic_total, services_extra_total, products_total, services_total, tx_basic_total, tx_extra_total, tx_products_total")
          .eq("barber_id", barberId)
          .gte("date", startOfMonth)
          .lte("date", yesterdayStr);

        if (error) throw error;

        if (isMounted) {
          setProductions((data || []) as ProductionStatusRow[]);
        }
      } catch (error) {
        console.error("Erro ao verificar dias pendentes:", error);
        if (isMounted) setProductions([]);
      } finally {
        if (isMounted) setIsLoading(false);
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

    // Days that have production with revenue OR resolved presence type
    const resolvedDays = new Set(
      safeProductions
        .filter((p) => {
          const hasRevenue =
            (Number(p.tx_basic_total) || 0) + (Number(p.tx_extra_total) || 0) + (Number(p.tx_products_total) || 0) > 0 ||
            (Number(p.services_basic_total) || 0) + (Number(p.services_extra_total) || 0) + (Number(p.products_total) || 0) > 0 ||
            (Number(p.services_total) || 0) > 0;
          const isResolvedPresenceType = RESOLVED_PRESENCE_TYPES.has(p.presence_type ?? "");
          return hasRevenue || isResolvedPresenceType;
        })
        .map((p) => p.date)
    );

    return expectedDays.filter((day) => !resolvedDays.has(day));
  }, [productions, currentDateKey]);

  const handleConfirmStatus = async (status: PresenceType) => {
    if (!selectedDate) return;
    setIsSaving(true);

    try {
      // Check if production exists for this date
      const { data: existing } = await supabase
        .from("daily_productions")
        .select("id")
        .eq("barber_id", barberId)
        .eq("date", selectedDate)
        .maybeSingle();

      let error = null;

      if (existing?.id) {
        const result = await supabase
          .from("daily_productions")
          .update({
            confirmed_presence: true,
            presence_type: status,
            clients_count: 0,
            manual_clients_count: 0,
          })
          .eq("id", existing.id);
        error = result.error;
      } else {
        const result = await supabase
          .from("daily_productions")
          .insert({
            barber_id: barberId,
            organization_id: organizationId,
            date: selectedDate,
            services_basic_total: 0,
            services_extra_total: 0,
            products_total: 0,
            services_total: 0,
            clients_count: 0,
            manual_clients_count: 0,
            services_count: 0,
            products_count: 0,
            confirmed_presence: true,
            presence_type: status,
          });
        error = result.error;
      }

      if (error) throw error;

      const dateLabel = selectedDate.split("-").reverse().join("/");
      const statusLabels: Record<string, string> = {
        present: "Presença registrada",
        day_off: "Folga registrada",
        absence: "Falta registrada",
      };
      toast.success(`${statusLabels[status] || "Status registrado"} em ${dateLabel}`);

      // Remove the date from the list locally
      setProductions((prev) => [
        ...prev,
        { date: selectedDate, presence_type: status, services_basic_total: 0, services_extra_total: 0, products_total: 0, services_total: 0, tx_basic_total: 0, tx_extra_total: 0, tx_products_total: 0 },
      ]);

      onStatusRegistered?.();
    } catch (error) {
      console.error("Erro ao registrar status:", error);
      toast.error("Erro ao registrar status do dia");
    } finally {
      setIsSaving(false);
      setSelectedDate(null);
    }
  };

  if (isLoading || missingDays.length === 0) return null;

  return (
    <>
      <Card className="border-destructive/30 bg-destructive/5 shadow-card-custom">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="w-5 h-5 text-destructive" />
            Dias sem Registro
            <Badge variant="destructive" className="ml-auto">
              {missingDays.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground mb-3">
            Esses dias não têm vendas nem status registrado. Informe o que aconteceu.
          </p>
          {missingDays.map((day) => (
            <div
              key={day}
              className="flex items-center justify-between rounded-lg border bg-background px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <p className="font-semibold">
                  {format(new Date(`${day}T12:00:00`), "EEEE, dd/MM", { locale: ptBR })}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedDate(day)}
                className="gap-1.5"
              >
                Registrar
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <StatusDoDiaDialog
        open={!!selectedDate}
        onOpenChange={(open) => { if (!open) setSelectedDate(null); }}
        barberId={barberId}
        date={selectedDate || ""}
        isLoading={isSaving}
        onConfirm={handleConfirmStatus}
      />
    </>
  );
}
