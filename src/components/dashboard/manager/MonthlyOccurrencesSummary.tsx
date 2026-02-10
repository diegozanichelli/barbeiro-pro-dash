import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCheck, CalendarOff, XCircle, ClipboardList, Loader2 } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { getCurrentMonthYear } from "@/lib/dateUtils";
import { format, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BarberOccurrence {
  barberId: string;
  barberName: string;
  unitId: string;
  unitName: string;
  presentCount: number;
  dayOffCount: number;
  absenceCount: number;
}

interface UnitOption {
  id: string;
  name: string;
}

export default function MonthlyOccurrencesSummary() {
  const { organizationId } = useOrganization();
  const [occurrences, setOccurrences] = useState<BarberOccurrence[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const { month, year } = getCurrentMonthYear();

  useEffect(() => {
    if (!organizationId) return;
    fetchUnits();
    fetchOccurrences();
  }, [organizationId]);

  const fetchUnits = async () => {
    const { data } = await supabase
      .from("units")
      .select("id, name")
      .eq("organization_id", organizationId!)
      .eq("status", "active")
      .order("name");
    if (data) setUnits(data);
  };

  const fetchOccurrences = async () => {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = endOfMonth(startDate);
      const startStr = format(startDate, "yyyy-MM-dd");
      const endStr = format(endDate, "yyyy-MM-dd");

      const { data: productions, error } = await supabase
        .from("daily_productions")
        .select("barber_id, presence_type, confirmed_presence, barbers!inner(name, unit_id, units!inner(id, name))")
        .eq("organization_id", organizationId!)
        .eq("confirmed_presence", true)
        .gte("date", startStr)
        .lte("date", endStr);

      if (error) throw error;

      const map = new Map<string, BarberOccurrence>();

      for (const p of productions || []) {
        const barber = p.barbers as any;
        if (!map.has(p.barber_id)) {
          map.set(p.barber_id, {
            barberId: p.barber_id,
            barberName: barber.name,
            unitId: barber.units.id,
            unitName: barber.units.name,
            presentCount: 0,
            dayOffCount: 0,
            absenceCount: 0,
          });
        }
        const entry = map.get(p.barber_id)!;
        const type = p.presence_type || "present";
        if (type === "present") entry.presentCount++;
        else if (type === "day_off") entry.dayOffCount++;
        else if (type === "absence") entry.absenceCount++;
      }

      setOccurrences(
        Array.from(map.values())
          .filter((o) => o.presentCount + o.dayOffCount + o.absenceCount > 0)
          .sort((a, b) => (b.dayOffCount + b.absenceCount) - (a.dayOffCount + a.absenceCount))
      );
    } catch (err) {
      console.error("Erro ao buscar ocorrências:", err);
    } finally {
      setLoading(false);
    }
  };

  const monthLabel = format(new Date(year, month - 1), "MMMM yyyy", { locale: ptBR });

  const filtered = selectedUnit === "all"
    ? occurrences
    : occurrences.filter((o) => o.unitId === selectedUnit);

  const totals = filtered.reduce(
    (acc, o) => ({
      present: acc.present + o.presentCount,
      dayOff: acc.dayOff + o.dayOffCount,
      absence: acc.absence + o.absenceCount,
    }),
    { present: 0, dayOff: 0, absence: 0 }
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (occurrences.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Ocorrências do Mês — <span className="capitalize">{monthLabel}</span>
          </CardTitle>
          {units.length > 1 && (
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todas as unidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Totals */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 rounded-lg border p-3 bg-orange-500/10">
            <UserCheck className="w-4 h-4 text-orange-500" />
            <div>
              <p className="text-xs text-muted-foreground">Presente s/ vendas</p>
              <p className="text-xl font-bold text-orange-500">{totals.present}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-3 bg-blue-500/10">
            <CalendarOff className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Folgas</p>
              <p className="text-xl font-bold text-blue-500">{totals.dayOff}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-3 bg-red-500/10">
            <XCircle className="w-4 h-4 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Faltas</p>
              <p className="text-xl font-bold text-red-500">{totals.absence}</p>
            </div>
          </div>
        </div>

        {/* Per barber */}
        <div className="space-y-2">
          {filtered.map((o) => (
            <div
              key={o.barberId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-medium text-sm">{o.barberName}</p>
                <p className="text-xs text-muted-foreground">{o.unitName}</p>
              </div>
              <div className="flex items-center gap-2">
                {o.presentCount > 0 && (
                  <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30 hover:bg-orange-500/30">
                    <UserCheck className="w-3 h-3 mr-1" />
                    {o.presentCount}
                  </Badge>
                )}
                {o.dayOffCount > 0 && (
                  <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30 hover:bg-blue-500/30">
                    <CalendarOff className="w-3 h-3 mr-1" />
                    {o.dayOffCount}
                  </Badge>
                )}
                {o.absenceCount > 0 && (
                  <Badge className="bg-red-500/20 text-red-600 border-red-500/30 hover:bg-red-500/30">
                    <XCircle className="w-3 h-3 mr-1" />
                    {o.absenceCount}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
