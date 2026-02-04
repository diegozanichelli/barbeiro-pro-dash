import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, TrendingUp, Users, Calendar, Building2 } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useOrganization } from "@/hooks/useOrganization";

interface BarberSubscriptions {
  barber_id: string | null;
  barber_name: string;
  unit_name: string;
  today_count: number;
  month_count: number;
  is_reception?: boolean;
}

export default function SubscriptionsTracking() {
  const { organizationId } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BarberSubscriptions[]>([]);
  const [totalToday, setTotalToday] = useState(0);
  const [totalMonth, setTotalMonth] = useState(0);

  useEffect(() => {
    if (organizationId) {
      fetchSubscriptionsData();
    }
  }, [organizationId]);

  const fetchSubscriptionsData = async () => {
    if (!organizationId) return;

    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

    try {
      // Buscar barbeiros com suas unidades
      const { data: barbers } = await supabase
        .from("barbers")
        .select("id, name, units(name)")
        .eq("organization_id", organizationId)
        .eq("status", "active");

      if (!barbers) {
        setData([]);
        setLoading(false);
        return;
      }

      // Buscar assinaturas do mês (incluindo as da recepção onde barber_id é null)
      const { data: transactions } = await supabase
        .from("sale_transactions")
        .select("barber_id, created_at")
        .eq("organization_id", organizationId)
        .eq("item_type", "subscription")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd + "T23:59:59");

      // Agrupar por barbeiro (usando "reception" como key para barber_id nulo)
      const subscriptionsByBarber: Record<string, { today: number; month: number }> = {};

      (transactions || []).forEach((tx) => {
        const key = tx.barber_id || "reception";
        if (!subscriptionsByBarber[key]) {
          subscriptionsByBarber[key] = { today: 0, month: 0 };
        }
        subscriptionsByBarber[key].month += 1;
        
        const txDate = tx.created_at.split("T")[0];
        if (txDate === today) {
          subscriptionsByBarber[key].today += 1;
        }
      });

      // Combinar dados dos barbeiros
      const result: BarberSubscriptions[] = barbers.map((barber) => ({
        barber_id: barber.id,
        barber_name: barber.name,
        unit_name: (barber.units as any)?.name || "Sem unidade",
        today_count: subscriptionsByBarber[barber.id]?.today || 0,
        month_count: subscriptionsByBarber[barber.id]?.month || 0,
        is_reception: false,
      }));

      // Adicionar linha de Recepção se houver vendas
      const receptionData = subscriptionsByBarber["reception"];
      if (receptionData && receptionData.month > 0) {
        result.push({
          barber_id: null,
          barber_name: "🏢 Recepção / Loja",
          unit_name: "—",
          today_count: receptionData.today,
          month_count: receptionData.month,
          is_reception: true,
        });
      }

      // Ordenar por quantidade no mês
      result.sort((a, b) => b.month_count - a.month_count);

      setData(result);
      setTotalToday(result.reduce((sum, b) => sum + b.today_count, 0));
      setTotalMonth(result.reduce((sum, b) => sum + b.month_count, 0));
    } catch (error) {
      console.error("Erro ao buscar assinaturas:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentMonthName = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Hoje</CardTitle>
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
            <CardTitle className="text-sm font-medium">Assinaturas no Mês</CardTitle>
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

      {/* Tabela de Barbeiros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            Assinaturas por Barbeiro
          </CardTitle>
          <CardDescription>
            Acompanhamento de vendas de assinaturas em {currentMonthName}
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
