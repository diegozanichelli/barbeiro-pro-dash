import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Crown, TrendingUp, Users, Calendar, Building2, CalendarDays } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { getTodayString, getManausDate, manausDayStart, manausDayEnd, formatManausDateTime } from "@/lib/dateUtils";
import { ptBR } from "date-fns/locale";
import { useOrganization } from "@/hooks/useOrganization";
import { Label } from "@/components/ui/label";
import { fetchAllRows } from "@/lib/supabasePagination";

/** Evita que o TS parseie a select string (custo de typecheck). */
const sel = (s: string): string => s;

interface SubTxRow {
  barber_id: string | null;
  created_at: string;
  unit_id: string | null;
}


interface Unit {
  id: string;
  name: string;
}

interface BarberSubscriptions {
  barber_id: string | null;
  barber_name: string;
  unit_name: string;
  unit_id: string | null;
  today_count: number;
  week_count: number;
  month_count: number;
  is_reception?: boolean;
}

export default function SubscriptionsTracking() {
  const { organizationId } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BarberSubscriptions[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [totalToday, setTotalToday] = useState(0);
  const [totalWeek, setTotalWeek] = useState(0);
  const [totalMonth, setTotalMonth] = useState(0);

  useEffect(() => {
    if (organizationId) {
      fetchUnits();
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      fetchSubscriptionsData();
    }
  }, [organizationId, selectedUnit]);

  const fetchUnits = async () => {
    const { data } = await supabase
      .from("units")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    if (data) setUnits(data);
  };

  const fetchSubscriptionsData = async () => {
    if (!organizationId) return;

    setLoading(true);
    const today = getTodayString();
    const manausNow = getManausDate();
    const monthStart = format(startOfMonth(manausNow), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(manausNow), "yyyy-MM-dd");
    const weekStart = format(startOfWeek(manausNow, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(manausNow, { weekStartsOn: 1 }), "yyyy-MM-dd");

    try {
      // Buscar barbeiros com suas unidades
      let barbersQuery = supabase
        .from("barbers")
        .select("id, name, unit_id, units(name)")
        .eq("organization_id", organizationId)
        .eq("status", "active");

      if (selectedUnit !== "all") {
        barbersQuery = barbersQuery.eq("unit_id", selectedUnit);
      }

      const { data: barbers } = await barbersQuery;

      if (!barbers) {
        setData([]);
        setLoading(false);
        return;
      }

      // Buscar assinaturas do mês (paginado + fuso Manaus explícito)
      const transactions = await fetchAllRows<SubTxRow>(() => {
        let txQuery = supabase
          .from("sale_transactions")
          .select(sel("barber_id, created_at, unit_id"))
          .eq("organization_id", organizationId)
          .eq("item_type", "subscription")
          .gte("created_at", manausDayStart(monthStart))
          .lte("created_at", manausDayEnd(monthEnd));

        if (selectedUnit !== "all") {
          txQuery = txQuery.eq("unit_id", selectedUnit);
        }
        return txQuery.returns<SubTxRow[]>();
      });

      // Agrupar por barbeiro
      const subscriptionsByBarber: Record<string, { today: number; week: number; month: number }> = {};

      transactions.forEach((tx) => {
        const key = tx.barber_id || "reception";
        if (!subscriptionsByBarber[key]) {
          subscriptionsByBarber[key] = { today: 0, week: 0, month: 0 };
        }
        subscriptionsByBarber[key].month += 1;

        // created_at é timestamptz: converter para o dia em Manaus antes de comparar.
        const txDate = formatManausDateTime(tx.created_at, "yyyy-MM-dd");
        if (txDate === today) {
          subscriptionsByBarber[key].today += 1;
        }
        if (txDate >= weekStart && txDate <= weekEnd) {
          subscriptionsByBarber[key].week += 1;
        }
      });


      // Combinar dados
      const result: BarberSubscriptions[] = barbers.map((barber) => ({
        barber_id: barber.id,
        barber_name: barber.name,
        unit_name: (barber.units as any)?.name || "Sem unidade",
        unit_id: barber.unit_id,
        today_count: subscriptionsByBarber[barber.id]?.today || 0,
        week_count: subscriptionsByBarber[barber.id]?.week || 0,
        month_count: subscriptionsByBarber[barber.id]?.month || 0,
        is_reception: false,
      }));

      // Recepção
      const receptionData = subscriptionsByBarber["reception"];
      if (receptionData && receptionData.month > 0) {
        result.push({
          barber_id: null,
          barber_name: "🏢 Recepção / Loja",
          unit_name: "—",
          unit_id: null,
          today_count: receptionData.today,
          week_count: receptionData.week,
          month_count: receptionData.month,
          is_reception: true,
        });
      }

      result.sort((a, b) => b.month_count - a.month_count);

      setData(result);
      setTotalToday(result.reduce((sum, b) => sum + b.today_count, 0));
      setTotalWeek(result.reduce((sum, b) => sum + b.week_count, 0));
      setTotalMonth(result.reduce((sum, b) => sum + b.month_count, 0));
    } catch (error) {
      console.error("Erro ao buscar assinaturas:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentMonthName = format(getManausDate(), "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">
      {/* Filtro por Unidade */}
      <div className="max-w-xs">
        <Label className="text-sm font-medium text-muted-foreground mb-2 block">Filtrar por Unidade</Label>
        <Select value={selectedUnit} onValueChange={setSelectedUnit}>
          <SelectTrigger className="bg-secondary">
            <SelectValue placeholder="Todas as unidades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Unidades</SelectItem>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hoje</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-primary">{totalToday}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Semana</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{totalWeek}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mês</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{totalMonth}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pontos Gerados</CardTitle>
            <Crown className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-warning">{totalMonth * 10} pts</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            Assinaturas por Barbeiro
          </CardTitle>
          <CardDescription>
            Acompanhamento de vendas de assinaturas em {currentMonthName}
            {selectedUnit !== "all" && units.find(u => u.id === selectedUnit) && (
              <span className="ml-1 font-medium"> — {units.find(u => u.id === selectedUnit)?.name}</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma assinatura registrada neste mês</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barbeiro</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-center">Hoje</TableHead>
                  <TableHead className="text-center">Semana</TableHead>
                  <TableHead className="text-center">Mês</TableHead>
                  <TableHead className="text-right">Pontos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((barber) => (
                  <TableRow
                    key={barber.barber_id || "reception"}
                    className={barber.is_reception ? "bg-muted/50" : ""}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {barber.is_reception && <Building2 className="w-4 h-4 text-muted-foreground" />}
                        {barber.barber_name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{barber.unit_name}</TableCell>
                    <TableCell className="text-center">
                      {barber.today_count > 0 ? (
                        <Badge variant="default" className="bg-primary">
                          {barber.today_count}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {barber.week_count > 0 ? (
                        <Badge variant="secondary">{barber.week_count}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-medium">{barber.month_count}</TableCell>
                    <TableCell className="text-right">
                      {barber.is_reception ? (
                        <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                          — pts
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-warning text-warning">
                          {barber.month_count * 10} pts
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
