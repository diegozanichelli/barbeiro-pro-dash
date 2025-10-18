import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, DollarSign, TrendingUp, Users } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function ManagerReports() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalCommission: 0,
    totalClients: 0,
    averageTicket: 0,
    goalsAchieved: 0,
    totalBarbers: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const now = new Date();
    const start = format(startOfMonth(now), "yyyy-MM-dd");
    const end = format(endOfMonth(now), "yyyy-MM-dd");

    // Buscar produções do mês
    const { data: productions } = await supabase
      .from("daily_productions")
      .select("*")
      .gte("date", start)
      .lte("date", end);

    // Buscar barbeiros ativos
    const { data: barbers } = await supabase
      .from("barbers")
      .select("id")
      .eq("status", "active");

    // Buscar metas do mês
    const { data: goals } = await supabase
      .from("monthly_goals")
      .select("*, barbers!inner(id)")
      .eq("month", now.getMonth() + 1)
      .eq("year", now.getFullYear());

    if (productions) {
      const totalRevenue = productions.reduce(
        (sum, p) => sum + Number(p.services_total) + Number(p.products_total),
        0
      );
      const totalCommission = productions.reduce(
        (sum, p) => sum + Number(p.commission_earned),
        0
      );
      const totalClients = productions.reduce(
        (sum, p) => sum + Number(p.clients_count),
        0
      );

      // Calcular comissão acumulada por barbeiro para verificar metas
      const barberCommissions = new Map<string, number>();
      productions.forEach((p) => {
        const current = barberCommissions.get(p.barber_id) || 0;
        barberCommissions.set(p.barber_id, current + Number(p.commission_earned));
      });

      let goalsAchieved = 0;
      if (goals) {
        goals.forEach((goal) => {
          const earned = barberCommissions.get(goal.barber_id) || 0;
          if (earned >= goal.target_commission) {
            goalsAchieved++;
          }
        });
      }

      setStats({
        totalRevenue,
        totalCommission,
        totalClients,
        averageTicket: totalClients > 0 ? totalRevenue / totalClients : 0,
        goalsAchieved,
        totalBarbers: barbers?.length || 0,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Visão Geral do Mês</h2>
        <p className="text-muted-foreground">Acompanhe o desempenho geral da sua barbearia</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-card border-border shadow-card-custom">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Bruta Total</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              R$ {stats.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Serviços + Produtos</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-border shadow-card-custom">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissão Total Paga</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              R$ {stats.totalCommission.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Para todos os barbeiros</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-border shadow-card-custom">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClients}</div>
            <p className="text-xs text-muted-foreground">Atendimentos no mês</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card border-border shadow-card-custom">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio Geral</CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              R$ {stats.averageTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Por cliente</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader>
          <CardTitle>Metas Batidas</CardTitle>
          <CardDescription>Barbeiros que atingiram a meta do mês</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-primary">{stats.goalsAchieved}</span>
            <span className="text-2xl text-muted-foreground">/ {stats.totalBarbers}</span>
            <span className="text-sm text-muted-foreground">barbeiros</span>
          </div>
          <div className="mt-2">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${stats.totalBarbers > 0 ? (stats.goalsAchieved / stats.totalBarbers) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
