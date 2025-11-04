import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, TrendingUp, DollarSign, Users } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

interface RankingItem {
  barber_id: string;
  barber_name: string;
  unit_name: string;
  value: number;
}

export default function Leaderboard() {
  const [period, setPeriod] = useState("current_month");
  const [unitFilter, setUnitFilter] = useState("all");
  const [units, setUnits] = useState<any[]>([]);
  
  const [servicesRanking, setServicesRanking] = useState<RankingItem[]>([]);
  const [servicesExtraRanking, setServicesExtraRanking] = useState<RankingItem[]>([]);
  const [productsRanking, setProductsRanking] = useState<RankingItem[]>([]);
  const [ticketRanking, setTicketRanking] = useState<RankingItem[]>([]);
  const [commissionRanking, setCommissionRanking] = useState<RankingItem[]>([]);

  useEffect(() => {
    fetchUnits();
  }, []);

  useEffect(() => {
    fetchRankings();
  }, [period, unitFilter]);

  const fetchUnits = async () => {
    const { data } = await supabase.from("units").select("*").eq("status", "active");
    if (data) setUnits(data);
  };

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case "current_week":
        return {
          start: format(startOfWeek(now), "yyyy-MM-dd"),
          end: format(endOfWeek(now), "yyyy-MM-dd"),
        };
      case "current_month":
        return {
          start: format(startOfMonth(now), "yyyy-MM-dd"),
          end: format(endOfMonth(now), "yyyy-MM-dd"),
        };
      default:
        return {
          start: format(startOfMonth(now), "yyyy-MM-dd"),
          end: format(endOfMonth(now), "yyyy-MM-dd"),
        };
    }
  };

  const fetchRankings = async () => {
    const { start, end } = getDateRange();

    // Use the security definer function to get rankings for all barbers in the organization
    const { data: rankings, error } = await supabase.rpc("get_organization_rankings", {
      p_start_date: start,
      p_end_date: end,
      p_unit_id: unitFilter === "all" ? null : unitFilter,
    });

    if (error) {
      console.error("Error fetching rankings:", error);
      return;
    }

    if (!rankings) return;

    const statsArray = rankings.map((r: any) => ({
      barber_id: r.barber_id,
      barber_name: r.barber_name,
      unit_name: r.unit_name,
      services_total: Number(r.services_total) || 0,
      services_extra_total: Number(r.services_extra_total) || 0,
      products_total: Number(r.products_total) || 0,
      clients_count: Number(r.clients_count) || 0,
      commission_earned: Number(r.commission_earned) || 0,
    }));

    // Ranking de Serviços
    const services = statsArray
      .map((s) => ({ ...s, value: s.services_total }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setServicesRanking(services);

    // Ranking de Serviços Extras
    const servicesExtra = statsArray
      .map((s) => ({ ...s, value: s.services_extra_total }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setServicesExtraRanking(servicesExtra);

    // Ranking de Produtos
    const products = statsArray
      .map((s) => ({ ...s, value: s.products_total }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setProductsRanking(products);

    // Ranking de Ticket Médio
    const ticket = statsArray
      .map((s) => ({
        ...s,
        value: s.clients_count > 0 ? (s.services_total + s.products_total) / s.clients_count : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setTicketRanking(ticket);

    // Ranking de Comissão
    const commission = statsArray
      .map((s) => ({ ...s, value: s.commission_earned }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    setCommissionRanking(commission);
  };

  const getMedal = (index: number) => {
    const medals = ["🥇", "🥈", "🥉"];
    return medals[index] || "";
  };

  const RankingCard = ({
    title,
    icon,
    data,
    valuePrefix = "R$",
  }: {
    title: string;
    icon: React.ReactNode;
    data: RankingItem[];
    valuePrefix?: string;
  }) => (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item, index) => (
            <div
              key={item.barber_id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getMedal(index)}</span>
                <div>
                  <p className="font-bold">{item.barber_name}</p>
                  <p className="text-sm text-muted-foreground">({item.unit_name})</p>
                </div>
              </div>
              <p className="text-xl font-bold text-primary">
                {valuePrefix} {item.value.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Filtrar por unidade" />
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

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current_week">Semana Atual</SelectItem>
            <SelectItem value="current_month">Mês Atual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingCard
          title="O BICHÃO DOS SERVIÇOS"
          icon={<TrendingUp className="w-5 h-5 text-success" />}
          data={servicesRanking}
        />
        <RankingCard
          title="REI DOS SERVIÇOS EXTRAS"
          icon={<TrendingUp className="w-5 h-5 text-warning" />}
          data={servicesExtraRanking}
        />
        <RankingCard
          title="REI DOS PRODUTOS"
          icon={<DollarSign className="w-5 h-5 text-primary" />}
          data={productsRanking}
        />
        <RankingCard
          title="MESTRE DO TICKET MÉDIO"
          icon={<Users className="w-5 h-5 text-accent" />}
          data={ticketRanking}
        />
        <RankingCard
          title="MÃO DE OURO"
          icon={<Trophy className="w-5 h-5 text-primary" />}
          data={commissionRanking}
        />
      </div>
    </div>
  );
}
